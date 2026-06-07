use crate::domain::{ModKind, ModRecord, ProfilesState, SaveFileInfo, ScanResult, ScanTiming};
use crate::parsers::save_stats::{list_save_files, normalize_selected_save_files, read_save_stats};
use crate::services::game::resolve_game_executable;
use crate::services::scan_cache::{
    build_scan_signature, write_cached_scan, CachedScan, ScanSignature,
};
mod dependencies;
mod mod_records;
mod official_maps;
mod state_files;
use crate::storage::{read_json, scan_cache_path};
use dependencies::{
    builtin_dependency_versions, builtin_mod_records, dependency_warnings, DependencyIndex,
};
use mod_records::{read_directory_mod, read_zip_mod, should_ignore_mods_entry, ModScanTarget};
use official_maps::scan_official_maps;
use rayon::prelude::*;
use state_files::{is_blacklisted, is_favorite, read_blacklist, read_favorites};
pub use state_files::{
    set_scan_favorite_state, set_scan_protected_state, write_favorite_state,
    write_profile_blacklist,
};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::Instant;

pub fn full_scan_cached(
    celeste_path: &Path,
    profiles: ProfilesState,
    protected_record_ids: &[String],
    selected_save_files: &[String],
) -> ScanResult {
    let mut timings = vec![];
    let available_save_files = time_stage(&mut timings, "列出存档", || {
        list_save_files(celeste_path)
    });
    let selected_save_files =
        normalize_selected_save_files(&available_save_files, selected_save_files);
    let signature = time_stage(&mut timings, "生成缓存签名", || {
        build_scan_signature(celeste_path, &selected_save_files)
    });
    let cache_path = scan_cache_path(celeste_path);
    if let Some(mut cached) = read_json::<CachedScan>(&cache_path) {
        if cached.signature == signature {
            cached.result.profiles = profiles;
            cached.result.available_save_files = available_save_files;
            cached.result.selected_save_files = selected_save_files;
            apply_protected_flags(&mut cached.result, protected_record_ids);
            timings.push(ScanTiming {
                stage: "命中扫描缓存".to_string(),
                ms: 0,
            });
            cached.result.timings = timings;
            return cached.result;
        }
    }

    scan_and_write_cache(
        celeste_path,
        profiles,
        protected_record_ids,
        available_save_files,
        selected_save_files,
        signature,
        &mut timings,
    )
}

pub fn full_scan_fresh(
    celeste_path: &Path,
    profiles: ProfilesState,
    protected_record_ids: &[String],
    selected_save_files: &[String],
) -> ScanResult {
    let mut timings = vec![];
    let available_save_files = time_stage(&mut timings, "列出存档", || {
        list_save_files(celeste_path)
    });
    let selected_save_files =
        normalize_selected_save_files(&available_save_files, selected_save_files);
    let signature = time_stage(&mut timings, "生成缓存签名", || {
        build_scan_signature(celeste_path, &selected_save_files)
    });
    scan_and_write_cache(
        celeste_path,
        profiles,
        protected_record_ids,
        available_save_files,
        selected_save_files,
        signature,
        &mut timings,
    )
}

fn scan_and_write_cache(
    celeste_path: &Path,
    profiles: ProfilesState,
    protected_record_ids: &[String],
    available_save_files: Vec<SaveFileInfo>,
    selected_save_files: Vec<String>,
    signature: ScanSignature,
    timings: &mut Vec<ScanTiming>,
) -> ScanResult {
    let mut result = full_scan(
        celeste_path,
        profiles,
        available_save_files,
        selected_save_files,
        timings,
    );
    time_stage(timings, "应用始终启用标记", || {
        apply_protected_flags(&mut result, protected_record_ids);
    });
    result.timings = timings.clone();
    let cache_path = scan_cache_path(celeste_path);
    time_stage(timings, "写入扫描缓存", || {
        let _ = write_cached_scan(&cache_path, &signature, &result);
    });
    result.timings = timings.clone();
    result
}

pub fn list_available_save_files(celeste_path: &Path) -> Vec<SaveFileInfo> {
    list_save_files(celeste_path)
}

pub fn write_scan_cache(celeste_path: &Path, result: &ScanResult) {
    let signature = build_scan_signature(celeste_path, &result.selected_save_files);
    let _ = write_cached_scan(&scan_cache_path(celeste_path), &signature, result);
}

pub fn full_scan(
    celeste_path: &Path,
    profiles: ProfilesState,
    available_save_files: Vec<SaveFileInfo>,
    selected_save_files: Vec<String>,
    timings: &mut Vec<ScanTiming>,
) -> ScanResult {
    let mut scan = time_stage(timings, "扫描 Mod 和地图", || {
        scan_mods(celeste_path, &profiles)
    });
    scan.maps = time_stage(timings, "读取存档统计", || {
        read_save_stats(celeste_path, scan.maps, &selected_save_files)
    });
    scan.available_save_files = available_save_files;
    scan.selected_save_files = selected_save_files;
    scan
}

fn time_stage<T>(timings: &mut Vec<ScanTiming>, stage: &str, task: impl FnOnce() -> T) -> T {
    let started = Instant::now();
    let value = task();
    timings.push(ScanTiming {
        stage: stage.to_string(),
        ms: started.elapsed().as_millis(),
    });
    value
}

fn apply_protected_flags(scan: &mut ScanResult, protected_record_ids: &[String]) {
    let protected: HashSet<&String> = protected_record_ids.iter().collect();
    for record in scan.maps.iter_mut().chain(scan.other_mods.iter_mut()) {
        record.protected = record.read_only || protected.contains(&record.id);
    }
}

pub fn scan_mods(celeste_path: &Path, profiles: &ProfilesState) -> ScanResult {
    let mods_path = celeste_path.join("Mods");
    let blacklist = read_blacklist(&mods_path);
    let favorites = read_favorites(&mods_path);
    let mut records = scan_official_maps(celeste_path, &favorites);
    let targets: Vec<ModScanTarget> = fs::read_dir(&mods_path)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|entry| {
                    let path = entry.path();
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if should_ignore_mods_entry(&file_name, path.is_dir()) {
                        return None;
                    }
                    (path.is_dir()
                        || (path.is_file() && file_name.to_lowercase().ends_with(".zip")))
                    .then_some(ModScanTarget { file_name, path })
                })
                .collect()
        })
        .unwrap_or_default();
    let mut scanned: Vec<ModRecord> = targets
        .par_iter()
        .filter_map(|target| {
            if target.path.is_dir() {
                read_directory_mod(&target.path, &mods_path)
            } else if target.path.is_file() && target.file_name.to_lowercase().ends_with(".zip") {
                read_zip_mod(&target.path, &mods_path)
            } else {
                None
            }
        })
        .collect();
    for record in &mut scanned {
        record.enabled = !is_blacklisted(record, &blacklist);
        record.favorite = is_favorite(record, &favorites);
    }
    records.append(&mut scanned);
    let warnings = if mods_path.exists() {
        vec![]
    } else {
        vec!["没有找到 Celeste/Mods 目录。".to_string()]
    };

    let builtin_versions = builtin_dependency_versions(celeste_path);
    records.extend(builtin_mod_records(celeste_path, &builtin_versions));
    let dependency_index = DependencyIndex::new(&records, builtin_versions);
    let mut unknown_builtin_dependencies = HashSet::new();

    let mut maps = vec![];
    let mut other_mods = vec![];
    for mut record in records {
        let warn_missing_dependencies = record.kind == ModKind::Map;
        record.warnings.extend(dependency_warnings(
            &record.dependencies,
            &dependency_index,
            warn_missing_dependencies,
            &mut unknown_builtin_dependencies,
        ));
        if record.kind == ModKind::Map {
            maps.push(record);
        } else {
            other_mods.push(record);
        }
    }
    maps.sort_by(|a, b| a.name.cmp(&b.name));
    other_mods.sort_by(|a, b| a.name.cmp(&b.name));
    let mut warnings = warnings;
    if !unknown_builtin_dependencies.is_empty() {
        let mut dependencies = unknown_builtin_dependencies.into_iter().collect::<Vec<_>>();
        dependencies.sort();
        warnings.push(format!(
            "内置依赖版本无法确认：{}，无法判断本地版本",
            dependencies.join("、")
        ));
    }

    ScanResult {
        celeste_path: celeste_path.to_string_lossy().to_string(),
        mods_path: mods_path.to_string_lossy().to_string(),
        blacklist_path: blacklist.file.to_string_lossy().to_string(),
        blacklist_entries: blacklist.entries.iter().cloned().collect(),
        game_executable: resolve_game_executable(celeste_path),
        maps,
        other_mods,
        profiles: profiles.clone(),
        available_save_files: vec![],
        selected_save_files: vec![],
        warnings,
        timings: vec![],
    }
}

#[cfg(test)]
mod tests;
