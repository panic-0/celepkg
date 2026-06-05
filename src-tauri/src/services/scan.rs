use crate::domain::{
    CompletionStatus, Dependency, ModKind, ModMetadata, ModRecord, ProfilesState, SaveFileInfo,
    ScanResult, ScanTiming, SubMapInfo,
};
use crate::parsers::dialog::{dialog_title_for_key, dialog_title_for_sid, read_dialog_titles};
use crate::parsers::everest::{is_builtin_dependency, parse_metadata};
use crate::parsers::map_bin::{read_map_summary, StrawberryCounts};
use crate::parsers::save_stats::{
    is_selectable_save_file, list_save_files, normalize_selected_save_files, read_save_stats,
};
use crate::services::game::resolve_game_executable;
use crate::storage::{read_json, scan_cache_path, write_json, write_text_file};
use crate::utils::{normalize_dependency_name, normalize_slash, stable_id};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{Instant, UNIX_EPOCH};
use walkdir::WalkDir;
use zip::ZipArchive;

const SCAN_CACHE_VERSION: u32 = 15;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ScanSignature {
    version: u32,
    celeste_path: String,
    selected_save_files: Vec<String>,
    files: Vec<FileStamp>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct FileStamp {
    path: String,
    len: u64,
    modified: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedScan {
    signature: ScanSignature,
    result: ScanResult,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedScanRef<'a> {
    signature: &'a ScanSignature,
    result: &'a ScanResult,
}

struct Blacklist {
    file: PathBuf,
    lines: Vec<String>,
    entries: HashSet<String>,
}

struct ModScanTarget {
    file_name: String,
    path: PathBuf,
}

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

fn write_cached_scan(
    cache_path: &Path,
    signature: &ScanSignature,
    result: &ScanResult,
) -> Result<(), String> {
    let cache = CachedScanRef { signature, result };
    write_json(cache_path, &cache)
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

fn build_scan_signature(celeste_path: &Path, selected_save_files: &[String]) -> ScanSignature {
    let mut files = vec![];
    collect_tree_stamps(
        celeste_path,
        &celeste_path.join("Content").join("Maps"),
        "Content/Maps",
        &mut files,
    );
    collect_official_dialog_stamps(celeste_path, &mut files);
    collect_mods_tree_stamps(celeste_path, &celeste_path.join("Mods"), "Mods", &mut files);
    collect_save_stamps(celeste_path, &mut files);
    collect_file_stamp(&celeste_path.join("Celeste.exe"), "Celeste.exe", &mut files);
    collect_file_stamp(&celeste_path.join("Celeste"), "Celeste", &mut files);
    files.sort_by(|a, b| a.path.cmp(&b.path));
    ScanSignature {
        version: SCAN_CACHE_VERSION,
        celeste_path: normalize_slash(&celeste_path.to_string_lossy()).to_lowercase(),
        selected_save_files: selected_save_files.to_vec(),
        files,
    }
}

fn collect_tree_stamps(root: &Path, dir: &Path, prefix: &str, files: &mut Vec<FileStamp>) {
    if !dir.exists() {
        files.push(FileStamp {
            path: format!("{prefix}/"),
            len: 0,
            modified: 0,
        });
        return;
    }
    for entry in WalkDir::new(dir).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry.path().strip_prefix(root).unwrap_or(entry.path());
        collect_file_stamp(
            entry.path(),
            &normalize_slash(&relative.to_string_lossy()),
            files,
        );
    }
}

fn collect_mods_tree_stamps(root: &Path, dir: &Path, prefix: &str, files: &mut Vec<FileStamp>) {
    if !dir.exists() {
        files.push(FileStamp {
            path: format!("{prefix}/"),
            len: 0,
            modified: 0,
        });
        return;
    }
    for entry in WalkDir::new(dir)
        .into_iter()
        .filter_entry(|entry| !is_top_level_mods_cache_entry(entry))
        .flatten()
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry.path().strip_prefix(root).unwrap_or(entry.path());
        collect_file_stamp(
            entry.path(),
            &normalize_slash(&relative.to_string_lossy()),
            files,
        );
    }
}

fn is_top_level_mods_cache_entry(entry: &walkdir::DirEntry) -> bool {
    entry.depth() == 1
        && entry.file_type().is_dir()
        && entry
            .file_name()
            .to_string_lossy()
            .eq_ignore_ascii_case("Cache")
}

fn collect_save_stamps(celeste_path: &Path, files: &mut Vec<FileStamp>) {
    let saves_path = celeste_path.join("Saves");
    if !saves_path.exists() {
        files.push(FileStamp {
            path: "Saves/".to_string(),
            len: 0,
            modified: 0,
        });
        return;
    }
    if let Ok(entries) = fs::read_dir(&saves_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !is_selectable_save_file(&file_name) {
                continue;
            }
            let relative = path.strip_prefix(celeste_path).unwrap_or(&path);
            collect_file_stamp(&path, &normalize_slash(&relative.to_string_lossy()), files);
        }
    }
}

fn collect_official_dialog_stamps(celeste_path: &Path, files: &mut Vec<FileStamp>) {
    collect_tree_stamps(
        celeste_path,
        &celeste_path.join("Content").join("Dialog"),
        "Content/Dialog",
        files,
    );
    let content_path = celeste_path.join("Content");
    if let Ok(entries) = fs::read_dir(&content_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with("Content.Dialog.") && file_name.ends_with(".txt") {
                let relative = path.strip_prefix(celeste_path).unwrap_or(&path);
                collect_file_stamp(&path, &normalize_slash(&relative.to_string_lossy()), files);
            }
        }
    }
}

fn collect_file_stamp(path: &Path, relative: &str, files: &mut Vec<FileStamp>) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if !metadata.is_file() {
        return;
    }
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    files.push(FileStamp {
        path: normalize_slash(relative).to_lowercase(),
        len: metadata.len(),
        modified,
    });
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

    records.extend(builtin_mod_records(celeste_path));
    let dependency_index = DependencyIndex::new(&records, celeste_path);
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

fn should_ignore_mods_entry(file_name: &str, is_dir: bool) -> bool {
    file_name.eq_ignore_ascii_case("blacklist.txt")
        || file_name.eq_ignore_ascii_case("favorites.txt")
        || (is_dir && file_name.eq_ignore_ascii_case("Cache"))
}

#[derive(Debug, Clone)]
struct DependencyCandidate {
    version: String,
}

#[derive(Debug)]
struct DependencyIndex {
    mods: HashMap<String, DependencyCandidate>,
    builtin_versions: HashMap<String, String>,
}

impl DependencyIndex {
    fn new(records: &[ModRecord], celeste_path: &Path) -> Self {
        let mut mods = HashMap::new();
        for record in records {
            let candidate = DependencyCandidate {
                version: record.metadata.version.clone(),
            };
            for alias in dependency_aliases(record) {
                let normalized = normalize_dependency_name(&alias);
                if !normalized.is_empty() {
                    mods.entry(normalized).or_insert_with(|| candidate.clone());
                }
            }
        }
        Self {
            mods,
            builtin_versions: builtin_dependency_versions(celeste_path),
        }
    }

    fn find_mod(&self, name: &str) -> Option<&DependencyCandidate> {
        self.mods.get(&normalize_dependency_name(name))
    }

    fn builtin_version(&self, name: &str) -> Option<&str> {
        self.builtin_versions
            .get(&normalize_dependency_name(name))
            .map(String::as_str)
    }
}

fn dependency_aliases(record: &ModRecord) -> Vec<String> {
    vec![
        record.id.clone(),
        record.name.clone(),
        record.metadata.name.clone(),
        record.file_name.clone(),
        record.file_name.trim_end_matches(".zip").to_string(),
        record.relative_path.clone(),
    ]
}

fn dependency_warnings(
    dependencies: &[Dependency],
    dependency_index: &DependencyIndex,
    warn_missing_dependencies: bool,
    unknown_builtin_dependencies: &mut HashSet<String>,
) -> Vec<String> {
    let mut warnings = vec![];
    for dependency in dependencies {
        if dependency.name.trim().is_empty() {
            continue;
        }
        if is_builtin_dependency(&dependency.name) {
            match builtin_dependency_version_warning(dependency, dependency_index) {
                BuiltinDependencyVersionWarning::None => {}
                BuiltinDependencyVersionWarning::TooLow(warning) => warnings.push(warning),
                BuiltinDependencyVersionWarning::Unknown(label) => {
                    unknown_builtin_dependencies.insert(label);
                }
            }
            continue;
        }
        let Some(installed) = dependency_index.find_mod(&dependency.name) else {
            if warn_missing_dependencies {
                warnings.push(format!("缺少依赖：{}", dependency_label(dependency)));
            }
            continue;
        };
        if dependency_version_too_low(&installed.version, &dependency.version) {
            warnings.push(format!(
                "依赖版本可能过低：{} 需要 {}，本地 {}",
                dependency.name, dependency.version, installed.version
            ));
        }
    }
    warnings
}

enum BuiltinDependencyVersionWarning {
    None,
    TooLow(String),
    Unknown(String),
}

fn builtin_dependency_version_warning(
    dependency: &Dependency,
    dependency_index: &DependencyIndex,
) -> BuiltinDependencyVersionWarning {
    let Some(required_version) = parse_numeric_version(&dependency.version) else {
        return BuiltinDependencyVersionWarning::None;
    };
    let Some(installed_version) = dependency_index.builtin_version(&dependency.name) else {
        return BuiltinDependencyVersionWarning::Unknown(dependency_label(dependency));
    };
    let Some(installed_numeric_version) = parse_numeric_version(installed_version) else {
        return BuiltinDependencyVersionWarning::None;
    };
    if compare_numeric_version_parts(&installed_numeric_version, &required_version)
        == std::cmp::Ordering::Less
    {
        BuiltinDependencyVersionWarning::TooLow(format!(
            "依赖版本可能过低：{} 需要 {}，本地 {}",
            dependency.name, dependency.version, installed_version
        ))
    } else {
        BuiltinDependencyVersionWarning::None
    }
}

fn dependency_version_too_low(installed_version: &str, required_version: &str) -> bool {
    let Some(installed) = parse_numeric_version(installed_version) else {
        return false;
    };
    let Some(required) = parse_numeric_version(required_version) else {
        return false;
    };
    compare_numeric_version_parts(&installed, &required) == std::cmp::Ordering::Less
}

fn parse_numeric_version(value: &str) -> Option<Vec<u64>> {
    let mut parts = vec![];
    let mut current = String::new();
    for ch in value.chars() {
        if ch.is_ascii_digit() {
            current.push(ch);
        } else if !current.is_empty() {
            parts.push(current.parse().ok()?);
            current.clear();
        }
    }
    if !current.is_empty() {
        parts.push(current.parse().ok()?);
    }
    (!parts.is_empty()).then_some(parts)
}

fn compare_numeric_version_parts(left: &[u64], right: &[u64]) -> std::cmp::Ordering {
    for index in 0..left.len().max(right.len()) {
        let left_part = left.get(index).copied().unwrap_or_default();
        let right_part = right.get(index).copied().unwrap_or_default();
        match left_part.cmp(&right_part) {
            std::cmp::Ordering::Equal => {}
            order => return order,
        }
    }
    std::cmp::Ordering::Equal
}

fn dependency_label(dependency: &Dependency) -> String {
    if dependency.version.is_empty() {
        dependency.name.clone()
    } else {
        format!("{} {}", dependency.name, dependency.version)
    }
}

fn builtin_dependency_versions(celeste_path: &Path) -> HashMap<String, String> {
    let mut versions = HashMap::new();
    insert_builtin_dependency_version(&mut versions, "Celeste", "1.4.0.0");
    if let Some(version) = read_everest_build_version(celeste_path) {
        insert_builtin_dependency_version(&mut versions, "Everest", &version);
        insert_builtin_dependency_version(&mut versions, "EverestCore", &version);
        return versions;
    }
    if let Some(metadata) = read_everest_builtin_metadata(celeste_path) {
        insert_builtin_dependency_version(&mut versions, "Everest", &metadata.version);
        insert_builtin_dependency_version(&mut versions, "EverestCore", &metadata.version);
        insert_builtin_dependency_version(&mut versions, &metadata.name, &metadata.version);
    }
    versions
}

fn builtin_mod_records(celeste_path: &Path) -> Vec<ModRecord> {
    let versions = builtin_dependency_versions(celeste_path);
    let everest_version = versions
        .get(&normalize_dependency_name("Everest"))
        .cloned()
        .unwrap_or_default();
    let everest_core_version = versions
        .get(&normalize_dependency_name("EverestCore"))
        .cloned()
        .unwrap_or_else(|| everest_version.clone());
    vec![
        builtin_mod_record(
            "builtin-everest",
            "Everest",
            &everest_version,
            "Celeste/Everest",
            "Celeste 的 Mod 加载器，安装在游戏根目录。",
            celeste_path,
        ),
        builtin_mod_record(
            "builtin-everest-core",
            "EverestCore",
            &everest_core_version,
            "Celeste/EverestCore",
            "Everest 内置核心依赖，由 Everest 安装器维护。",
            celeste_path,
        ),
    ]
}

fn builtin_mod_record(
    id: &str,
    name: &str,
    version: &str,
    relative_path: &str,
    description: &str,
    celeste_path: &Path,
) -> ModRecord {
    ModRecord {
        id: id.to_string(),
        name: name.to_string(),
        file_name: name.to_string(),
        relative_path: relative_path.to_string(),
        absolute_path: celeste_path.to_string_lossy().to_string(),
        is_archive: false,
        kind: ModKind::Mod,
        enabled: true,
        favorite: false,
        protected: true,
        read_only: true,
        metadata: ModMetadata {
            name: name.to_string(),
            version: version.to_string(),
            author: "Everest".to_string(),
            description: description.to_string(),
            dependencies: vec![],
            optional_dependencies: vec![],
        },
        map_ids: vec![],
        sub_maps: vec![],
        map_count: 0,
        strawberry_count: 0,
        strawberry_total_count: 0,
        completion_status: CompletionStatus::NotApplicable,
        dependencies: vec![],
        optional_dependencies: vec![],
        stats: None,
        warnings: vec![],
    }
}

fn insert_builtin_dependency_version(
    versions: &mut HashMap<String, String>,
    name: &str,
    version: &str,
) {
    let normalized = normalize_dependency_name(name);
    if !normalized.is_empty() && !version.trim().is_empty() {
        versions.insert(normalized, version.to_string());
    }
}

fn read_everest_build_version(celeste_path: &Path) -> Option<String> {
    let build = [
        celeste_path.join("Celeste.exe"),
        celeste_path.join("Celeste.dll"),
    ]
    .into_iter()
    .find_map(read_everest_build_from_file)?;
    Some(format!("1.{build}.0"))
}

fn read_everest_build_from_file(path: PathBuf) -> Option<u64> {
    const CHUNK_SIZE: usize = 64 * 1024;
    let file = File::open(path).ok()?;
    read_everest_build_from_reader(BufReader::new(file), CHUNK_SIZE)
}

fn read_everest_build_from_reader(mut reader: impl Read, chunk_size: usize) -> Option<u64> {
    const MAGIC: &[u8] = b"EverestBuild";
    let mut buffer = vec![0; chunk_size.max(1)];
    let mut matched = 0;
    let mut found_magic = false;
    let mut version_bytes = Vec::new();

    loop {
        let read_len = reader.read(&mut buffer).ok()?;
        if read_len == 0 {
            break;
        }

        for byte in &buffer[..read_len] {
            if found_magic {
                if byte.is_ascii_digit() {
                    version_bytes.push(*byte);
                    continue;
                }
                return (!version_bytes.is_empty())
                    .then(|| std::str::from_utf8(&version_bytes).ok()?.parse().ok())
                    .flatten();
            }

            if *byte == MAGIC[matched] {
                matched += 1;
                if matched == MAGIC.len() {
                    found_magic = true;
                }
            } else {
                matched = usize::from(*byte == MAGIC[0]);
            }
        }
    }

    found_magic
        .then(|| std::str::from_utf8(&version_bytes).ok()?.parse().ok())
        .flatten()
}

fn read_everest_builtin_metadata(celeste_path: &Path) -> Option<ModMetadata> {
    [
        celeste_path.join("everest.yaml"),
        celeste_path.join("everest.yml"),
        celeste_path
            .join("Mods")
            .join("Everest")
            .join("everest.yaml"),
        celeste_path
            .join("Mods")
            .join("Everest")
            .join("everest.yml"),
    ]
    .into_iter()
    .find_map(|path| {
        let text = fs::read_to_string(path).ok()?;
        let metadata = parse_metadata(&text);
        (!metadata.version.trim().is_empty()).then_some(metadata)
    })
}

struct OfficialMapFile {
    area_name: String,
    area_sort: u16,
    side_sort: u8,
    side_name: String,
    sid: String,
    mode_index: u8,
    file_name: String,
    path: PathBuf,
}

fn scan_official_maps(celeste_path: &Path, favorites: &HashSet<String>) -> Vec<ModRecord> {
    let maps_path = celeste_path.join("Content").join("Maps");
    let dialog_titles = read_official_dialog_titles(celeste_path);
    let mut files = vec![];
    if let Ok(entries) = fs::read_dir(&maps_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file()
                || !path
                    .extension()
                    .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("bin"))
                    .unwrap_or(false)
            {
                continue;
            }
            let Some(info) = official_map_file_info(&path, &dialog_titles) else {
                continue;
            };
            files.push(info);
        }
    }
    if files.is_empty() {
        return vec![];
    }
    files.sort_by_key(|file| (file.area_sort, file.side_sort));
    let sub_maps: Vec<SubMapInfo> = files
        .iter()
        .map(|file| {
            let strawberry_counts = fs::read(&file.path)
                .ok()
                .and_then(|bytes| read_map_summary(&bytes).map(|summary| summary.strawberry_counts))
                .unwrap_or_default();
            let sid = format!("{}/{}", file.sid, file.side_name);
            SubMapInfo {
                id: stable_id(&format!("vanilla::{sid}")),
                sid,
                mode_index: Some(file.mode_index),
                display_name: official_sub_map_display_name(&file.area_name, file.mode_index),
                chapter: format!("Celeste/{}", file.area_name),
                file_path: format!("Content/Maps/{}", file.file_name),
                difficulty: String::new(),
                strawberry_count: strawberry_counts.visible,
                strawberry_total_count: strawberry_counts.total,
                completion_status: CompletionStatus::Unknown,
                stats: None,
            }
        })
        .collect();
    let strawberry_count = sub_maps
        .iter()
        .map(|sub_map| sub_map.strawberry_count)
        .sum();
    let strawberry_total_count = sub_maps
        .iter()
        .map(|sub_map| sub_map.strawberry_total_count)
        .sum();
    let mut map_ids: Vec<String> = files.iter().map(|file| file.sid.clone()).collect();
    map_ids.sort();
    map_ids.dedup();
    let mut record = ModRecord {
        id: stable_id("vanilla::celeste"),
        name: "Celeste".to_string(),
        file_name: "Celeste/".to_string(),
        relative_path: "Celeste/".to_string(),
        absolute_path: maps_path.to_string_lossy().to_string(),
        is_archive: false,
        kind: ModKind::Map,
        enabled: true,
        favorite: false,
        protected: true,
        read_only: true,
        metadata: ModMetadata {
            name: "Celeste 官方地图".to_string(),
            author: "Extremely OK Games".to_string(),
            description: "Celeste 自带关卡，只用于查看统计。".to_string(),
            ..ModMetadata::default()
        },
        map_ids,
        sub_maps,
        map_count: files.len(),
        strawberry_count,
        strawberry_total_count,
        completion_status: CompletionStatus::Unknown,
        dependencies: vec![],
        optional_dependencies: vec![],
        stats: None,
        warnings: vec![],
    };
    record.favorite = is_favorite(&record, favorites);
    vec![record]
}

fn official_map_file_info(
    path: &Path,
    titles: &HashMap<String, String>,
) -> Option<OfficialMapFile> {
    let file_name = path.file_name()?.to_string_lossy().to_string();
    let stem = path.file_stem()?.to_string_lossy().to_string();
    if stem.eq_ignore_ascii_case("LostLevels") {
        return Some(OfficialMapFile {
            area_name: official_area_name(10, "Farewell", titles),
            area_sort: 10,
            side_sort: 0,
            side_name: "Farewell".to_string(),
            sid: "Celeste/LostLevels".to_string(),
            mode_index: 0,
            file_name,
            path: path.to_path_buf(),
        });
    }
    let (number_text, rest) = split_leading_digits(&stem)?;
    let number = number_text.parse::<u16>().ok()?;
    let (mode_index, side_sort, base_stem, side_name) = if let Some(name) = rest.strip_prefix("H-")
    {
        (1, 1, format!("{number}-{name}"), "B-Side".to_string())
    } else if let Some(name) = rest.strip_prefix("X-") {
        (2, 2, format!("{number}-{name}"), "C-Side".to_string())
    } else if rest.starts_with('-') {
        (0, 0, stem.clone(), "A-Side".to_string())
    } else {
        return None;
    };
    Some(OfficialMapFile {
        area_name: official_area_name(number, &base_stem, titles),
        area_sort: number,
        side_sort,
        side_name,
        sid: format!("Celeste/{base_stem}"),
        mode_index,
        file_name,
        path: path.to_path_buf(),
    })
}

fn split_leading_digits(value: &str) -> Option<(&str, &str)> {
    let split_at = value
        .char_indices()
        .find(|(_, ch)| !ch.is_ascii_digit())
        .map(|(index, _)| index)?;
    if split_at == 0 {
        None
    } else {
        Some(value.split_at(split_at))
    }
}

fn read_official_dialog_titles(celeste_path: &Path) -> HashMap<String, String> {
    let mut dialog_texts = vec![];
    for dialog_path in [
        celeste_path.join("Content").join("Dialog"),
        celeste_path.join("Content"),
    ] {
        if let Ok(entries) = fs::read_dir(&dialog_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file()
                    || !path
                        .extension()
                        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("txt"))
                        .unwrap_or(false)
                {
                    continue;
                }
                let file_name = entry.file_name().to_string_lossy().to_string();
                if dialog_path.ends_with("Content") && !file_name.starts_with("Content.Dialog.") {
                    continue;
                }
                if let Ok(text) = fs::read_to_string(&path) {
                    let relative = path
                        .strip_prefix(celeste_path)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();
                    dialog_texts.push((relative, text));
                }
            }
        }
    }
    read_dialog_titles(dialog_texts)
}

fn official_area_key(number: u16) -> String {
    format!("area_{number}")
}

fn official_area_name(number: u16, fallback: &str, titles: &HashMap<String, String>) -> String {
    let title = dialog_title_for_key(&official_area_key(number), titles)
        .unwrap_or_else(|| official_area_fallback_name(number, fallback));
    official_numbered_area_name(number, &title)
}

fn official_area_fallback_name(number: u16, fallback: &str) -> String {
    match number {
        0 => "Prologue",
        1 => "Forsaken City",
        2 => "Old Site",
        3 => "Celestial Resort",
        4 => "Golden Ridge",
        5 => "Mirror Temple",
        6 => "Reflection",
        7 => "The Summit",
        8 => "Epilogue",
        9 => "Core",
        10 => "Farewell",
        _ => fallback,
    }
    .to_string()
}

fn official_numbered_area_name(number: u16, title: &str) -> String {
    match number {
        1..=7 => format!("{number} - {title}"),
        9 => format!("8 - {title}"),
        10 => format!("9 - {title}"),
        _ => title.to_string(),
    }
}

fn official_sub_map_display_name(area_name: &str, mode_index: u8) -> String {
    match mode_index {
        0 => area_name.to_string(),
        1 => format!("{area_name} B-Side"),
        2 => format!("{area_name} C-Side"),
        _ => area_name.to_string(),
    }
}

pub fn write_profile_blacklist(
    celeste_path: &Path,
    enabled_map_ids: &[String],
    enabled_mod_ids: &[String],
    scan: &ScanResult,
) -> Result<(), String> {
    let mods_path = celeste_path.join("Mods");
    let blacklist = read_blacklist(&mods_path);
    let managed_keys: HashSet<String> = scan
        .maps
        .iter()
        .chain(scan.other_mods.iter())
        .flat_map(|map| {
            [
                normalize_slash(&map.file_name).to_lowercase(),
                normalize_slash(&map.relative_path).to_lowercase(),
                normalize_slash(&map.name).to_lowercase(),
                normalize_slash(&map.metadata.name).to_lowercase(),
            ]
        })
        .filter(|value| !value.is_empty())
        .collect();
    let protected_keys: HashSet<String> = scan
        .maps
        .iter()
        .chain(scan.other_mods.iter())
        .filter(|record| record.protected)
        .flat_map(record_match_keys)
        .collect();
    let mut lines: Vec<String> = blacklist
        .lines
        .into_iter()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return true;
            }
            let key = normalize_slash(trimmed).to_lowercase();
            !protected_keys.contains(&key) && !managed_keys.contains(&key)
        })
        .collect();
    let enabled_maps: HashSet<&String> = enabled_map_ids.iter().collect();
    for map in &scan.maps {
        if !map.protected && !enabled_maps.contains(&map.id) {
            lines.push(map.relative_path.clone());
        }
    }
    let enabled_mods: HashSet<&String> = enabled_mod_ids.iter().collect();
    for mod_item in &scan.other_mods {
        if !mod_item.protected && !enabled_mods.contains(&mod_item.id) {
            lines.push(mod_item.relative_path.clone());
        }
    }
    fs::create_dir_all(&mods_path).map_err(|error| format!("创建 Mods 目录失败：{error}"))?;
    let content = format!("{}\n", lines.join("\n").trim());
    write_text_file(&blacklist.file, &content)
        .map_err(|error| format!("写入 blacklist 失败：{error}"))
}

pub fn write_favorite_state(
    celeste_path: &Path,
    record_id: &str,
    favorite: bool,
    scan: &ScanResult,
) -> Result<(), String> {
    let record = scan
        .maps
        .iter()
        .chain(scan.other_mods.iter())
        .find(|record| record.id == record_id)
        .ok_or_else(|| "Mod 不存在".to_string())?;
    let mods_path = celeste_path.join("Mods");
    fs::create_dir_all(&mods_path).map_err(|error| format!("创建 Mods 目录失败：{error}"))?;
    let file = mods_path.join("favorites.txt");
    let mut lines: Vec<String> = fs::read_to_string(&file)
        .unwrap_or_default()
        .lines()
        .map(ToString::to_string)
        .collect();
    let keys: HashSet<String> = record_match_keys(record).into_iter().collect();
    lines.retain(|line| {
        let trimmed = line.trim();
        trimmed.is_empty()
            || trimmed.starts_with('#')
            || !keys.contains(&normalize_slash(trimmed).to_lowercase())
    });
    if favorite {
        lines.push(record.relative_path.clone());
    }
    let content = format!("{}\n", lines.join("\n").trim());
    write_text_file(&file, &content).map_err(|error| format!("写入 favorites.txt 失败：{error}"))
}

pub fn set_scan_favorite_state(
    scan: &mut ScanResult,
    record_id: &str,
    favorite: bool,
) -> Result<(), String> {
    let record = scan
        .maps
        .iter_mut()
        .chain(scan.other_mods.iter_mut())
        .find(|record| record.id == record_id)
        .ok_or_else(|| "Mod 不存在".to_string())?;
    record.favorite = favorite;
    Ok(())
}

pub fn set_scan_protected_state(
    scan: &mut ScanResult,
    record_id: &str,
    protected: bool,
) -> Result<(), String> {
    let record = scan
        .maps
        .iter_mut()
        .chain(scan.other_mods.iter_mut())
        .find(|record| record.id == record_id)
        .ok_or_else(|| "Mod 不存在".to_string())?;
    if record.read_only {
        return Err("内置项目不能修改始终启用状态".to_string());
    }
    record.protected = protected;
    Ok(())
}

fn read_directory_mod(dir_path: &Path, mods_path: &Path) -> Option<ModRecord> {
    let mut map_ids = vec![];
    let mut has_code = false;
    let mut yaml_text = String::new();
    let mut dialog_texts = vec![];
    let mut strawberry_counts = HashMap::new();
    let mut map_difficulties = HashMap::new();
    for entry in WalkDir::new(dir_path).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative =
            normalize_slash(&entry.path().strip_prefix(dir_path).ok()?.to_string_lossy());
        if let Some(sid) = map_sid_from_entry(&relative) {
            map_ids.push(sid.clone());
            if let Ok(bytes) = fs::read(entry.path()) {
                if let Some(summary) = read_map_summary(&bytes) {
                    strawberry_counts.insert(sid.clone(), summary.strawberry_counts);
                    if let Some(difficulty) = summary
                        .map_icon
                        .and_then(|icon| difficulty_from_map_icon(&icon))
                    {
                        map_difficulties.insert(sid, difficulty);
                    }
                }
            }
        }
        if let Some(sid) = map_meta_sid_from_entry(&relative) {
            if let Ok(text) = fs::read_to_string(entry.path()) {
                if let Some(difficulty) =
                    read_meta_yaml_icon(&text).and_then(|icon| difficulty_from_map_icon(&icon))
                {
                    map_difficulties.insert(sid, difficulty);
                }
            }
        }
        if is_everest_yaml_entry(&relative) {
            yaml_text = fs::read_to_string(entry.path()).unwrap_or_default();
        }
        if is_dialog_entry(&relative) {
            dialog_texts.push((
                relative.clone(),
                fs::read_to_string(entry.path()).unwrap_or_default(),
            ));
        }
        if is_code_entry(&relative) {
            has_code = true;
        }
    }
    Some(create_mod_record(
        dir_path,
        mods_path,
        false,
        ScannedModData {
            map_ids,
            has_code,
            metadata: parse_metadata(&yaml_text),
            dialog_titles: read_dialog_titles(dialog_texts),
            strawberry_counts,
            map_difficulties,
        },
    ))
}

fn read_zip_mod(zip_path: &Path, mods_path: &Path) -> Option<ModRecord> {
    let file = File::open(zip_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut map_ids = vec![];
    let mut has_code = false;
    let mut yaml_text = String::new();
    let mut dialog_texts = vec![];
    let mut strawberry_counts = HashMap::new();
    let mut map_difficulties = HashMap::new();
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).ok()?;
        let name = normalize_slash(file.name());
        if let Some(sid) = map_sid_from_entry(&name) {
            map_ids.push(sid.clone());
            let mut bytes = Vec::with_capacity(file.size() as usize);
            let _ = file.read_to_end(&mut bytes);
            if let Some(summary) = read_map_summary(&bytes) {
                strawberry_counts.insert(sid.clone(), summary.strawberry_counts);
                if let Some(difficulty) = summary
                    .map_icon
                    .and_then(|icon| difficulty_from_map_icon(&icon))
                {
                    map_difficulties.insert(sid, difficulty);
                }
            }
        }
        if is_everest_yaml_entry(&name) {
            let mut text = String::new();
            let _ = file.read_to_string(&mut text);
            yaml_text = text;
        } else if is_dialog_entry(&name) {
            let mut text = String::new();
            let _ = file.read_to_string(&mut text);
            dialog_texts.push((name.clone(), text));
        } else if let Some(sid) = map_meta_sid_from_entry(&name) {
            let mut text = String::new();
            let _ = file.read_to_string(&mut text);
            if let Some(difficulty) =
                read_meta_yaml_icon(&text).and_then(|icon| difficulty_from_map_icon(&icon))
            {
                map_difficulties.insert(sid, difficulty);
            }
        }
        if is_code_entry(&name) {
            has_code = true;
        }
    }
    Some(create_mod_record(
        zip_path,
        mods_path,
        true,
        ScannedModData {
            map_ids,
            has_code,
            metadata: parse_metadata(&yaml_text),
            dialog_titles: read_dialog_titles(dialog_texts),
            strawberry_counts,
            map_difficulties,
        },
    ))
}

struct ScannedModData {
    map_ids: Vec<String>,
    has_code: bool,
    metadata: ModMetadata,
    dialog_titles: HashMap<String, String>,
    strawberry_counts: HashMap<String, StrawberryCounts>,
    map_difficulties: HashMap<String, String>,
}

fn create_mod_record(
    absolute_path: &Path,
    mods_path: &Path,
    is_archive: bool,
    data: ScannedModData,
) -> ModRecord {
    let ScannedModData {
        map_ids,
        has_code,
        metadata,
        dialog_titles,
        strawberry_counts,
        map_difficulties,
    } = data;
    let relative_path = normalize_slash(
        &absolute_path
            .strip_prefix(mods_path)
            .unwrap_or(absolute_path)
            .to_string_lossy(),
    );
    let file_name = absolute_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| relative_path.clone());
    let sub_maps: Vec<SubMapInfo> = map_ids
        .iter()
        .map(|sid| SubMapInfo {
            id: stable_id(&format!("{}::{sid}", relative_path.to_lowercase())),
            sid: sid.clone(),
            mode_index: None,
            display_name: dialog_title_for_sid(sid, &dialog_titles)
                .unwrap_or_else(|| sub_map_display_name(sid)),
            chapter: sub_map_chapter(sid),
            file_path: format!("Maps/{sid}.bin"),
            difficulty: map_difficulties.get(sid).cloned().unwrap_or_default(),
            strawberry_count: strawberry_counts
                .get(sid)
                .map(|counts| counts.visible)
                .unwrap_or(0),
            strawberry_total_count: strawberry_counts
                .get(sid)
                .map(|counts| counts.total)
                .unwrap_or(0),
            completion_status: CompletionStatus::Unknown,
            stats: None,
        })
        .collect();
    let strawberry_count = sub_maps
        .iter()
        .map(|sub_map| sub_map.strawberry_count)
        .sum();
    let strawberry_total_count = sub_maps
        .iter()
        .map(|sub_map| sub_map.strawberry_total_count)
        .sum();
    let is_map_mod = is_map_mod_record(&file_name, &relative_path, &metadata, &map_ids, has_code);
    let fallback_name = file_name.trim_end_matches(".zip").replace(['_', '-'], " ");
    let name = if metadata.name.is_empty() {
        fallback_name
    } else {
        metadata.name.clone()
    };
    let name = if sub_maps.len() == 1 {
        append_single_sub_map_name(name, &sub_maps[0].display_name)
    } else {
        name
    };
    ModRecord {
        id: stable_id(&relative_path.to_lowercase()),
        name,
        file_name,
        relative_path: relative_path.clone(),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        is_archive,
        kind: if is_map_mod {
            ModKind::Map
        } else {
            ModKind::Mod
        },
        enabled: true,
        favorite: false,
        protected: false,
        read_only: false,
        map_count: map_ids.len(),
        dependencies: metadata.dependencies.clone(),
        optional_dependencies: metadata.optional_dependencies.clone(),
        metadata,
        map_ids,
        sub_maps,
        stats: None,
        completion_status: CompletionStatus::Unknown,
        strawberry_count,
        strawberry_total_count,
        warnings: vec![],
    }
}

fn map_sid_from_entry(entry: &str) -> Option<String> {
    if starts_with_ignore_ascii_case(entry, "maps/") && ends_with_ignore_ascii_case(entry, ".bin") {
        Some(entry[5..entry.len() - 4].to_string())
    } else {
        None
    }
}

fn map_meta_sid_from_entry(entry: &str) -> Option<String> {
    if starts_with_ignore_ascii_case(entry, "maps/")
        && ends_with_ignore_ascii_case(entry, ".meta.yaml")
    {
        Some(entry[5..entry.len() - 10].to_string())
    } else {
        None
    }
}

fn read_meta_yaml_icon(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let trimmed = line.trim();
        let (key, value) = trimmed.split_once(':')?;
        if !key.trim().eq_ignore_ascii_case("Icon") {
            return None;
        }
        let value = value.trim().trim_matches(['"', '\'']).trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}

fn difficulty_from_map_icon(icon: &str) -> Option<String> {
    let normalized = icon.trim().replace('\\', "/");
    let lower = normalized.to_lowercase();
    let (_, value) = lower.rsplit_once("/meters/")?;
    let value = value.rsplit('/').next().unwrap_or(value);
    let label = value
        .split_once('-')
        .map(|(_, label)| label)
        .unwrap_or(value)
        .trim();
    let display = match label {
        "easy" => "Easy",
        "med" | "medium" => "Medium",
        "hard" => "Hard",
        "wtf" => "WTF",
        "cracked" => "Cracked",
        "hellish" => "Hellish",
        "lobby" => return None,
        other if !other.is_empty() => return Some(title_case_difficulty(other)),
        _ => return None,
    };
    Some(display.to_string())
}

fn title_case_difficulty(value: &str) -> String {
    value
        .split(['-', '_', ' '])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_map_mod_record(
    file_name: &str,
    relative_path: &str,
    metadata: &ModMetadata,
    map_ids: &[String],
    has_code: bool,
) -> bool {
    if map_ids.is_empty() {
        return false;
    }
    let helper_like = is_helper_like_mod(file_name, relative_path, metadata);
    let only_test_maps = map_ids.iter().all(|sid| is_test_map_sid(sid));

    if helper_like && has_code {
        return false;
    }
    if has_code && only_test_maps {
        return false;
    }
    true
}

fn is_code_entry(entry: &str) -> bool {
    ends_with_ignore_ascii_case(entry, ".dll") || ends_with_ignore_ascii_case(entry, ".exe")
}

fn is_dialog_entry(entry: &str) -> bool {
    starts_with_ignore_ascii_case(entry, "dialog/") && ends_with_ignore_ascii_case(entry, ".txt")
}

fn is_everest_yaml_entry(entry: &str) -> bool {
    let basename = entry.rsplit('/').next().unwrap_or(entry);
    basename.eq_ignore_ascii_case("everest.yaml") || basename.eq_ignore_ascii_case("everest.yml")
}

fn starts_with_ignore_ascii_case(value: &str, prefix: &str) -> bool {
    value
        .get(..prefix.len())
        .is_some_and(|head| head.eq_ignore_ascii_case(prefix))
}

fn ends_with_ignore_ascii_case(value: &str, suffix: &str) -> bool {
    value
        .get(value.len().saturating_sub(suffix.len())..)
        .is_some_and(|tail| tail.eq_ignore_ascii_case(suffix))
}

fn is_helper_like_mod(file_name: &str, relative_path: &str, metadata: &ModMetadata) -> bool {
    [
        file_name,
        relative_path,
        metadata.name.as_str(),
        metadata.description.as_str(),
    ]
    .iter()
    .any(|value| value.to_lowercase().contains("helper"))
}

fn is_test_map_sid(sid: &str) -> bool {
    let lower = sid.to_lowercase();
    lower.split('/').any(|part| {
        matches!(
            part,
            "test" | "debug" | "sample" | "example" | "preview" | "dev" | "sandbox"
        ) || part.ends_with("test")
            || part.contains("testmap")
    })
}

fn read_blacklist(mods_path: &Path) -> Blacklist {
    let file = mods_path.join("blacklist.txt");
    let lines: Vec<String> = fs::read_to_string(&file)
        .unwrap_or_default()
        .lines()
        .map(ToString::to_string)
        .collect();
    let entries = lines
        .iter()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| normalize_slash(line).to_lowercase())
        .collect();
    Blacklist {
        file,
        lines,
        entries,
    }
}

fn read_favorites(mods_path: &Path) -> HashSet<String> {
    fs::read_to_string(mods_path.join("favorites.txt"))
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| normalize_slash(line).to_lowercase())
        .collect()
}

fn is_blacklisted(record: &ModRecord, blacklist: &Blacklist) -> bool {
    [
        record.id.as_str(),
        record.file_name.as_str(),
        record.relative_path.as_str(),
        record.name.as_str(),
        record.metadata.name.as_str(),
        record.file_name.trim_end_matches(".zip"),
    ]
    .iter()
    .filter(|value| !value.is_empty())
    .map(|value| normalize_slash(value).to_lowercase())
    .any(|value| blacklist.entries.contains(&value))
}

fn is_favorite(record: &ModRecord, favorites: &HashSet<String>) -> bool {
    record_match_keys(record)
        .into_iter()
        .any(|value| favorites.contains(&value))
}

fn record_match_keys(record: &ModRecord) -> Vec<String> {
    [
        record.file_name.as_str(),
        record.relative_path.as_str(),
        record.name.as_str(),
        record.metadata.name.as_str(),
        record.file_name.trim_end_matches(".zip"),
    ]
    .iter()
    .filter(|value| !value.is_empty())
    .map(|value| normalize_slash(value).to_lowercase())
    .collect()
}

fn sub_map_display_name(sid: &str) -> String {
    sid.rsplit('/')
        .next()
        .unwrap_or(sid)
        .replace(['_', '-'], " ")
}

fn append_single_sub_map_name(map_name: String, sub_map_name: &str) -> String {
    let sub_map_name = sub_map_name.trim();
    if sub_map_name.is_empty()
        || map_name.trim().eq_ignore_ascii_case(sub_map_name)
        || map_name.contains(sub_map_name)
    {
        map_name
    } else {
        format!("{map_name} - {sub_map_name}")
    }
}

fn sub_map_chapter(sid: &str) -> String {
    let mut parts = sid.split('/');
    let first = parts.next().unwrap_or_default();
    let second = parts.next().unwrap_or_default();
    if second.is_empty() {
        first.to_string()
    } else {
        format!("{first}/{second}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Dependency;
    use std::io::{Cursor, Seek, SeekFrom, Write};

    fn metadata(name: &str) -> ModMetadata {
        ModMetadata {
            name: name.to_string(),
            ..ModMetadata::default()
        }
    }

    #[test]
    fn classifies_regular_map_pack_as_map() {
        let map_ids = vec![
            "sleuter/chinatour/micnight".to_string(),
            "sleuter/chinatour/micpeach".to_string(),
        ];

        assert!(is_map_mod_record(
            "A_Tour_in_China.zip",
            "A_Tour_in_China.zip",
            &metadata("A Tour in China"),
            &map_ids,
            false,
        ));
    }

    #[test]
    fn classifies_helper_with_test_maps_as_other_mod() {
        let map_ids = vec!["leppa/AltSidesHelper/AltSidesHelperTest".to_string()];

        assert!(!is_map_mod_record(
            "AltSidesHelper.zip",
            "AltSidesHelper.zip",
            &metadata("AltSidesHelper"),
            &map_ids,
            true,
        ));
    }

    #[test]
    fn classifies_code_mod_with_only_test_maps_as_other_mod() {
        let map_ids = vec!["preview/test".to_string()];

        assert!(!is_map_mod_record(
            "Example.zip",
            "Example.zip",
            &metadata("Example"),
            &map_ids,
            true,
        ));
    }

    #[test]
    fn create_mod_record_applies_sub_map_and_pack_strawberry_totals() {
        let root = temp_celeste_root("strawberry-counts");
        let mods_path = root.join("Mods");
        let mod_path = mods_path.join("BerryPack.zip");
        let map_ids = vec!["pack/one".to_string(), "pack/two".to_string()];
        let strawberry_counts = HashMap::from([
            (
                "pack/one".to_string(),
                StrawberryCounts {
                    visible: 3,
                    total: 4,
                },
            ),
            (
                "pack/two".to_string(),
                StrawberryCounts {
                    visible: 5,
                    total: 7,
                },
            ),
        ]);
        let map_difficulties = HashMap::from([
            ("pack/one".to_string(), "Medium".to_string()),
            ("pack/two".to_string(), "Hard".to_string()),
        ]);

        let record = create_mod_record(
            &mod_path,
            &mods_path,
            true,
            ScannedModData {
                map_ids,
                has_code: false,
                metadata: metadata("BerryPack"),
                dialog_titles: HashMap::new(),
                strawberry_counts,
                map_difficulties,
            },
        );

        assert_eq!(record.strawberry_count, 8);
        assert_eq!(record.strawberry_total_count, 11);
        assert_eq!(record.sub_maps[0].strawberry_count, 3);
        assert_eq!(record.sub_maps[0].strawberry_total_count, 4);
        assert_eq!(record.sub_maps[0].difficulty, "Medium");
        assert_eq!(record.sub_maps[1].strawberry_count, 5);
        assert_eq!(record.sub_maps[1].strawberry_total_count, 7);
        assert_eq!(record.sub_maps[1].difficulty, "Hard");
    }

    #[test]
    fn reads_collab_difficulty_from_map_icons() {
        assert_eq!(
            difficulty_from_map_icon("areas/SJ2021/meters/2-med"),
            Some("Medium".to_string())
        );
        assert_eq!(
            difficulty_from_map_icon("areas/CNY2024/meters/4-hellish"),
            Some("Hellish".to_string())
        );
        assert_eq!(
            difficulty_from_map_icon("areas/SJ2021/lobby/1-Beginner"),
            None
        );
    }

    #[test]
    fn reads_map_icon_from_meta_yaml() {
        let text = r#"
Icon: 'areas/CNY2024/meters/5-Lobby'
CompleteScreen:
  Atlas: Endscreens/ChineseNewYear2024
"#;

        assert_eq!(
            read_meta_yaml_icon(text).and_then(|icon| difficulty_from_map_icon(&icon)),
            None
        );
    }

    #[test]
    fn blacklist_writes_maps_and_mods_from_separate_enabled_sets() {
        let root = std::env::temp_dir().join(format!(
            "celepkg-blacklist-test-{}",
            stable_id(&crate::utils::now_string())
        ));
        let mods_path = root.join("Mods");
        fs::create_dir_all(&mods_path).expect("mods dir");
        fs::write(mods_path.join("blacklist.txt"), "unmanaged.zip\n").expect("blacklist");
        let scan = ScanResult {
            celeste_path: root.to_string_lossy().to_string(),
            mods_path: mods_path.to_string_lossy().to_string(),
            blacklist_path: mods_path
                .join("blacklist.txt")
                .to_string_lossy()
                .to_string(),
            blacklist_entries: vec![],
            game_executable: String::new(),
            maps: vec![record("map-id", "Map.zip", ModKind::Map)],
            other_mods: vec![record("mod-id", "Helper.zip", ModKind::Mod)],
            profiles: ProfilesState {
                active_map_profile_id: "default-maps".to_string(),
                active_mod_profile_id: "default-mods".to_string(),
                profiles: vec![],
            },
            available_save_files: vec![],
            selected_save_files: vec![],
            warnings: vec![],
            timings: vec![],
        };

        write_profile_blacklist(&root, &[], &["mod-id".to_string()], &scan)
            .expect("write blacklist");
        let text = fs::read_to_string(mods_path.join("blacklist.txt")).expect("read blacklist");
        let _ = fs::remove_dir_all(&root);

        assert!(text.contains("unmanaged.zip"));
        assert!(text.contains("Map.zip"));
        assert!(!text.contains("Helper.zip"));
    }

    #[test]
    fn blacklist_removes_always_enabled_records() {
        let root = std::env::temp_dir().join(format!(
            "celepkg-always-enabled-blacklist-test-{}",
            stable_id(&crate::utils::now_string())
        ));
        let mods_path = root.join("Mods");
        fs::create_dir_all(&mods_path).expect("mods dir");
        fs::write(
            mods_path.join("blacklist.txt"),
            "DisabledAlwaysEnabled.zip\n",
        )
        .expect("blacklist");
        let mut enabled_always_enabled = record(
            "enabled-always-enabled",
            "EnabledAlwaysEnabled.zip",
            ModKind::Mod,
        );
        enabled_always_enabled.protected = true;
        let mut disabled_always_enabled = record(
            "disabled-always-enabled",
            "DisabledAlwaysEnabled.zip",
            ModKind::Mod,
        );
        disabled_always_enabled.protected = true;
        let scan = ScanResult {
            celeste_path: root.to_string_lossy().to_string(),
            mods_path: mods_path.to_string_lossy().to_string(),
            blacklist_path: mods_path
                .join("blacklist.txt")
                .to_string_lossy()
                .to_string(),
            blacklist_entries: vec![],
            game_executable: String::new(),
            maps: vec![],
            other_mods: vec![enabled_always_enabled, disabled_always_enabled],
            profiles: empty_profiles(),
            available_save_files: vec![],
            selected_save_files: vec![],
            warnings: vec![],
            timings: vec![],
        };

        write_profile_blacklist(&root, &[], &["disabled-always-enabled".to_string()], &scan)
            .expect("write blacklist");
        let text = fs::read_to_string(mods_path.join("blacklist.txt")).expect("read blacklist");
        let _ = fs::remove_dir_all(&root);

        assert!(!text.contains("DisabledAlwaysEnabled.zip"));
        assert!(!text.contains("EnabledAlwaysEnabled.zip"));
    }

    #[test]
    fn favorites_file_round_trips_record_state() {
        let root = temp_celeste_root("favorites");
        write_dir_map(&root, "FavoriteMap", "maps/favorite/one");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);
        let scan = full_scan_cached(&root, empty_profiles(), &[], &[]);
        let record_id = scan.maps[0].id.clone();

        write_favorite_state(&root, &record_id, true, &scan).expect("write favorite");
        let favorite_scan = full_scan_cached(&root, empty_profiles(), &[], &[]);
        assert!(favorite_scan.maps[0].favorite);

        write_favorite_state(&root, &record_id, false, &favorite_scan).expect("remove favorite");
        let plain_scan = full_scan_cached(&root, empty_profiles(), &[], &[]);

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert!(!plain_scan.maps[0].favorite);
    }

    #[test]
    fn cached_scan_overlays_protected_state() {
        let root = temp_celeste_root("protected-cache");
        write_dir_map(&root, "ProtectedMap", "maps/protected/one");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);
        let first = full_scan_cached(&root, empty_profiles(), &[], &[]);
        let record_id = first.maps[0].id.clone();
        assert!(!first.maps[0].protected);

        let second = full_scan_cached(&root, empty_profiles(), &[record_id], &[]);

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert!(second.maps[0].protected);
    }

    #[test]
    fn cached_scan_uses_latest_profiles_and_invalidates_on_blacklist() {
        let root = temp_celeste_root("cache-blacklist");
        write_dir_map(&root, "TestMap", "maps/cache/one");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);

        let first = full_scan_cached(
            &root,
            ProfilesState {
                active_map_profile_id: "one".to_string(),
                active_mod_profile_id: "mods".to_string(),
                profiles: vec![],
            },
            &[],
            &[],
        );
        assert_eq!(first.profiles.active_map_profile_id, "one");
        assert_eq!(first.maps.len(), 1);
        assert!(first.maps[0].enabled);

        let cached = full_scan_cached(
            &root,
            ProfilesState {
                active_map_profile_id: "two".to_string(),
                active_mod_profile_id: "mods".to_string(),
                profiles: vec![],
            },
            &[],
            &[],
        );
        assert_eq!(cached.profiles.active_map_profile_id, "two");
        assert!(cached.maps[0].enabled);

        fs::write(root.join("Mods").join("blacklist.txt"), "TestMap\n").expect("blacklist");
        let invalidated = full_scan_cached(
            &root,
            ProfilesState {
                active_map_profile_id: "three".to_string(),
                active_mod_profile_id: "mods".to_string(),
                profiles: vec![],
            },
            &[],
            &[],
        );

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert_eq!(invalidated.profiles.active_map_profile_id, "three");
        assert!(!invalidated.maps[0].enabled);
    }

    #[test]
    fn fresh_scan_bypasses_existing_cache() {
        let root = temp_celeste_root("fresh-cache");
        write_dir_map(&root, "FreshMap", "maps/cache/fresh");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);

        let first = full_scan_cached(&root, empty_profiles(), &[], &[]);
        assert_eq!(first.maps.len(), 1);

        let signature = build_scan_signature(&root, &first.selected_save_files);
        let cached = CachedScan {
            signature,
            result: ScanResult {
                maps: vec![],
                ..first.clone()
            },
        };
        write_json(&cache_file, &cached).expect("write cache");

        let cached_scan = full_scan_cached(&root, empty_profiles(), &[], &[]);
        let fresh_scan = full_scan_fresh(&root, empty_profiles(), &[], &[]);

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert!(cached_scan.maps.is_empty());
        assert_eq!(fresh_scan.maps.len(), 1);
    }

    #[test]
    fn scan_ignores_mods_cache_directory() {
        let root = temp_celeste_root("ignore-mods-cache");
        let cache_path = root.join("Mods").join("Cache");
        fs::create_dir_all(&cache_path).expect("cache dir");
        fs::write(
            cache_path.join("everest.yaml"),
            "Name: Cache\nVersion: 1.0.0\n",
        )
        .expect("cache metadata");
        fs::write(cache_path.join("Cache.dll"), "").expect("cache code");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);

        let scan = full_scan_fresh(&root, empty_profiles(), &[], &[]);

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert!(!scan
            .maps
            .iter()
            .chain(scan.other_mods.iter())
            .any(|record| record.relative_path.eq_ignore_ascii_case("Cache")));
    }

    #[test]
    fn scan_signature_ignores_mods_cache_changes() {
        let root = temp_celeste_root("ignore-mods-cache-signature");
        let cache_path = root.join("Mods").join("Cache");
        fs::create_dir_all(&cache_path).expect("cache dir");
        fs::write(cache_path.join("cache.bin"), "first").expect("cache file");

        let first = build_scan_signature(&root, &[]);
        fs::write(cache_path.join("cache.bin"), "second value").expect("cache file update");
        fs::write(cache_path.join("nested.txt"), "nested").expect("cache nested file");
        let second = build_scan_signature(&root, &[]);

        let _ = fs::remove_dir_all(root);

        assert_eq!(first, second);
    }

    #[test]
    fn write_scan_cache_round_trips_cached_scan() {
        let root = temp_celeste_root("cache-write");
        fs::create_dir_all(&root).expect("root dir");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);
        let scan = ScanResult {
            celeste_path: root.to_string_lossy().to_string(),
            mods_path: root.join("Mods").to_string_lossy().to_string(),
            blacklist_path: root
                .join("Mods")
                .join("blacklist.txt")
                .to_string_lossy()
                .to_string(),
            blacklist_entries: vec![],
            game_executable: String::new(),
            maps: vec![record("map-id", "Map.zip", ModKind::Map)],
            other_mods: vec![record("mod-id", "Helper.zip", ModKind::Mod)],
            profiles: empty_profiles(),
            available_save_files: vec![],
            selected_save_files: vec!["0.celeste".to_string()],
            warnings: vec![],
            timings: vec![],
        };

        write_scan_cache(&root, &scan);
        let cached = read_json::<CachedScan>(&cache_file).expect("cached scan");

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert_eq!(cached.result.maps.len(), 1);
        assert_eq!(cached.result.other_mods.len(), 1);
        assert_eq!(cached.signature.selected_save_files, vec!["0.celeste"]);
    }

    #[test]
    fn cached_scan_invalidates_on_primary_save_change() {
        let root = temp_celeste_root("cache-save");
        write_dir_map(&root, "SaveMap", "maps/cache/save");
        let saves_path = root.join("Saves");
        fs::create_dir_all(&saves_path).expect("saves dir");
        fs::write(saves_path.join("0.celeste"), save_xml("maps/cache/save", 1)).expect("save file");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);

        let first = full_scan_cached(&root, empty_profiles(), &[], &[]);
        assert_eq!(
            first.maps[0].stats.as_ref().map(|stats| stats.deaths),
            Some(1)
        );

        fs::write(
            saves_path.join("0.celeste"),
            format!("{}\n<!-- changed -->", save_xml("maps/cache/save", 7)),
        )
        .expect("save file update");
        let second = full_scan_cached(&root, empty_profiles(), &[], &[]);

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert_eq!(
            second.maps[0].stats.as_ref().map(|stats| stats.deaths),
            Some(7)
        );
    }

    #[test]
    fn dependency_warning_reports_low_installed_versions() {
        let mut helper = record("helper-id", "Helper.zip", ModKind::Mod);
        helper.metadata.name = "Helper".to_string();
        helper.metadata.version = "1.1.5".to_string();
        let index = DependencyIndex::new(&[helper], Path::new(""));

        let warnings =
            dependency_warnings_for_test(&[dependency("Helper", "1.2.0")], &index, true).0;

        assert_eq!(
            warnings,
            vec!["依赖版本可能过低：Helper 需要 1.2.0，本地 1.1.5"]
        );
    }

    #[test]
    fn dependency_warning_accepts_equal_or_higher_versions() {
        let mut helper = record("helper-id", "Helper.zip", ModKind::Mod);
        helper.metadata.name = "Helper".to_string();
        helper.metadata.version = "1.10.0".to_string();
        let index = DependencyIndex::new(&[helper], Path::new(""));

        assert!(
            dependency_warnings_for_test(&[dependency("Helper", "1.2.0")], &index, true)
                .0
                .is_empty()
        );
        assert!(
            dependency_warnings_for_test(&[dependency("Helper", "1.10.0")], &index, true)
                .0
                .is_empty()
        );
    }

    #[test]
    fn dependency_warning_skips_missing_or_unparseable_versions() {
        let mut helper = record("helper-id", "Helper.zip", ModKind::Mod);
        helper.metadata.name = "Helper".to_string();
        helper.metadata.version = "preview".to_string();
        let index = DependencyIndex::new(&[helper], Path::new(""));

        assert!(
            dependency_warnings_for_test(&[dependency("Helper", "")], &index, true)
                .0
                .is_empty()
        );
        assert!(
            dependency_warnings_for_test(&[dependency("Helper", "next")], &index, true)
                .0
                .is_empty()
        );
        assert!(
            dependency_warnings_for_test(&[dependency("Helper", "1.2.0")], &index, true)
                .0
                .is_empty()
        );
    }

    #[test]
    fn dependency_warning_matches_normalized_aliases() {
        let mut helper = record("helper-id", "Helper_Pack.zip", ModKind::Mod);
        helper.metadata.version = "1.0.0".to_string();
        let index = DependencyIndex::new(&[helper], Path::new(""));

        let warnings =
            dependency_warnings_for_test(&[dependency("Helper Pack", "1.1.0")], &index, true).0;

        assert_eq!(
            warnings,
            vec!["依赖版本可能过低：Helper Pack 需要 1.1.0，本地 1.0.0"]
        );
    }

    #[test]
    fn builtin_dependency_with_unknown_local_version_gets_warning() {
        let index = DependencyIndex::new(&[], Path::new(""));

        let (warnings, unknown_builtin_versions) =
            dependency_warnings_for_test(&[dependency("EverestCore", "1.4980.0")], &index, true);

        assert!(warnings.is_empty());
        assert_eq!(
            unknown_builtin_versions,
            HashSet::from(["EverestCore 1.4980.0".to_string()])
        );
    }

    #[test]
    fn celeste_builtin_dependency_uses_common_version() {
        let index = DependencyIndex::new(&[], Path::new(""));

        let same_version =
            dependency_warnings_for_test(&[dependency("Celeste", "1.4.0.0")], &index, true);
        let newer_required =
            dependency_warnings_for_test(&[dependency("Celeste", "1.4.1.0")], &index, true);

        assert!(same_version.0.is_empty());
        assert!(same_version.1.is_empty());
        assert_eq!(
            newer_required.0,
            vec!["依赖版本可能过低：Celeste 需要 1.4.1.0，本地 1.4.0.0"]
        );
        assert!(newer_required.1.is_empty());
    }

    #[test]
    fn builtin_dependency_version_is_checked_when_detected() {
        let root = temp_celeste_root("builtin-version");
        fs::create_dir_all(&root).expect("root dir");
        fs::write(
            root.join("everest.yaml"),
            "Name: EverestCore\nVersion: 1.4970.0\n",
        )
        .expect("everest yaml");
        let index = DependencyIndex::new(&[], &root);

        let warnings =
            dependency_warnings_for_test(&[dependency("EverestCore", "1.4980.0")], &index, true).0;
        let high_enough =
            dependency_warnings_for_test(&[dependency("EverestCore", "1.4960.0")], &index, true).0;

        let _ = fs::remove_dir_all(root);

        assert_eq!(
            warnings,
            vec!["依赖版本可能过低：EverestCore 需要 1.4980.0，本地 1.4970.0"]
        );
        assert!(high_enough.is_empty());
    }

    #[test]
    fn everest_build_version_is_read_from_game_binary() {
        let root = temp_celeste_root("everest-build");
        fs::create_dir_all(&root).expect("root dir");
        fs::write(
            root.join("Celeste.exe"),
            b"prefix EverestBuild4980\0 suffix",
        )
        .expect("game binary");

        let version = read_everest_build_version(&root).expect("everest build");

        let _ = fs::remove_dir_all(root);

        assert_eq!(version, "1.4980.0");
    }

    #[test]
    fn everest_build_version_is_read_from_late_file_section() {
        let root = temp_celeste_root("everest-build-late");
        fs::create_dir_all(&root).expect("root dir");
        let mut file = File::create(root.join("Celeste.exe")).expect("game binary");
        file.set_len(2 * 1024 * 1024).expect("file len");
        file.seek(SeekFrom::Start(2 * 1024 * 1024 + 17))
            .expect("seek");
        file.write_all(b"EverestBuild4980\0").expect("build");

        let version = read_everest_build_version(&root).expect("everest build");

        let _ = fs::remove_dir_all(root);

        assert_eq!(version, "1.4980.0");
    }

    #[test]
    fn everest_build_magic_can_cross_chunk_boundary() {
        let build =
            read_everest_build_from_reader(Cursor::new(b"prefix EverestBuild4980".as_slice()), 9)
                .expect("everest build");

        assert_eq!(build, 4980);
    }

    #[test]
    fn everest_build_digits_can_cross_chunk_boundary() {
        let build =
            read_everest_build_from_reader(Cursor::new(b"EverestBuild123456789".as_slice()), 15)
                .expect("everest build");

        assert_eq!(build, 123456789);
    }

    #[test]
    fn everest_build_version_prefer_binary_over_yaml_fallback() {
        let root = temp_celeste_root("everest-build-precedence");
        fs::create_dir_all(&root).expect("root dir");
        fs::write(
            root.join("Celeste.exe"),
            b"prefix EverestBuild4980\0 suffix",
        )
        .expect("game binary");
        fs::write(
            root.join("everest.yaml"),
            "Name: EverestCore\nVersion: 1.4970.0\n",
        )
        .expect("everest yaml");
        let index = DependencyIndex::new(&[], &root);

        let warnings =
            dependency_warnings_for_test(&[dependency("EverestCore", "1.4980.0")], &index, true).0;

        let _ = fs::remove_dir_all(root);

        assert!(warnings.is_empty());
    }

    #[test]
    fn unknown_builtin_versions_are_deduped_as_scan_warnings() {
        let root = temp_celeste_root("unknown-builtin-scan-warning");
        write_dir_mod_with_dependencies(
            &root,
            "FirstHelper",
            &[dependency("EverestCore", "1.4980.0")],
        );
        write_dir_mod_with_dependencies(
            &root,
            "SecondHelper",
            &[dependency("EverestCore", "1.4980.0")],
        );
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);

        let scan = full_scan_fresh(&root, empty_profiles(), &[], &[]);

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert_eq!(
            scan.warnings,
            vec!["内置依赖版本无法确认：EverestCore 1.4980.0，无法判断本地版本"]
        );
        assert!(scan
            .other_mods
            .iter()
            .all(|mod_item| mod_item.warnings.is_empty()));
    }

    #[test]
    fn selected_save_files_control_scanned_stats() {
        let root = temp_celeste_root("selected-save");
        write_dir_map(&root, "SaveMap", "maps/selected/save");
        let saves_path = root.join("Saves");
        fs::create_dir_all(&saves_path).expect("saves dir");
        fs::write(
            saves_path.join("0.celeste"),
            save_xml("maps/selected/save", 1),
        )
        .expect("save 0");
        fs::write(
            saves_path.join("2.celeste"),
            save_xml("maps/selected/save", 9),
        )
        .expect("save 2");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);

        let default_scan = full_scan_cached(&root, empty_profiles(), &[], &[]);
        let selected_scan = full_scan_cached(
            &root,
            empty_profiles(),
            &[],
            &["2.celeste".to_string(), "debug.celeste".to_string()],
        );

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert_eq!(
            default_scan.selected_save_files,
            vec!["0.celeste".to_string()]
        );
        assert_eq!(
            selected_scan
                .available_save_files
                .iter()
                .map(|save| save.name.clone())
                .collect::<Vec<_>>(),
            vec!["0.celeste".to_string(), "2.celeste".to_string()]
        );
        assert_eq!(
            selected_scan.selected_save_files,
            vec!["2.celeste".to_string()]
        );
        assert_eq!(
            default_scan.maps[0]
                .stats
                .as_ref()
                .map(|stats| stats.deaths),
            Some(1)
        );
        assert_eq!(
            selected_scan.maps[0]
                .stats
                .as_ref()
                .map(|stats| stats.deaths),
            Some(9)
        );
    }

    #[test]
    fn official_maps_are_scanned_as_read_only_maps() {
        let root = temp_celeste_root("official-maps");
        let content_maps = root.join("Content").join("Maps");
        fs::create_dir_all(&content_maps).expect("content maps dir");
        fs::create_dir_all(root.join("Mods")).expect("mods dir");
        write_official_dialog(&root, "area_1=被遗弃的城市\narea_9=核心\narea_10=再见\n");
        fs::write(content_maps.join("1-ForsakenCity.bin"), "").expect("a side");
        fs::write(content_maps.join("1H-ForsakenCity.bin"), "").expect("b side");
        fs::write(content_maps.join("1X-ForsakenCity.bin"), "").expect("c side");
        let saves_path = root.join("Saves");
        fs::create_dir_all(&saves_path).expect("saves dir");
        fs::write(
            saves_path.join("0.celeste"),
            r#"<Save><AreaStats SID="Celeste/1-ForsakenCity" Cassette="true"><Modes><AreaModeStats Deaths="1" Completed="true" HeartGem="true" /><AreaModeStats Deaths="2" Completed="false" HeartGem="true" /><AreaModeStats Deaths="3" Completed="true" HeartGem="true" /></Modes></AreaStats></Save>"#,
        )
        .expect("save");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);

        let scan = full_scan_cached(&root, empty_profiles(), &[], &[]);

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        let official = scan
            .maps
            .iter()
            .find(|map| map.name == "Celeste")
            .expect("official map");
        assert_eq!(scan.maps.len(), 1);
        assert!(official.read_only);
        assert!(official.enabled);
        assert!(official.protected);
        assert_eq!(official.relative_path, "Celeste/");
        assert_eq!(official.sub_maps.len(), 3);
        assert_eq!(official.sub_maps[1].sid, "Celeste/1-ForsakenCity/B-Side");
        assert_eq!(official.sub_maps[1].display_name, "1 - 被遗弃的城市 B-Side");
        assert_eq!(official.sub_maps[1].chapter, "Celeste/1 - 被遗弃的城市");
        assert_eq!(
            official.sub_maps[1]
                .stats
                .as_ref()
                .map(|stats| stats.deaths),
            Some(2)
        );
        assert_eq!(
            official.sub_maps[1].completion_status,
            CompletionStatus::Unfinished
        );
    }

    #[test]
    fn official_area_names_use_builtin_dialog_titles() {
        let titles = read_dialog_titles(vec![(
            "Content/Dialog/ChineseSimplified.txt".to_string(),
            [
                "area_0=序章",
                "area_1=被遗弃的城市",
                "area_8=尾声",
                "area_9=核心",
                "area_10=再见",
            ]
            .join("\n"),
        )]);
        let cases = [
            ("0-Intro.bin", "序章", "序章"),
            ("1-ForsakenCity.bin", "1 - 被遗弃的城市", "1 - 被遗弃的城市"),
            ("8-Epilogue.bin", "尾声", "尾声"),
            ("9-Core.bin", "8 - 核心", "8 - 核心"),
            ("LostLevels.bin", "9 - 再见", "9 - 再见"),
            (
                "1H-ForsakenCity.bin",
                "1 - 被遗弃的城市",
                "1 - 被遗弃的城市 B-Side",
            ),
        ];

        for (file_name, area_name, display_name) in cases {
            let file = official_map_file_info(std::path::Path::new(file_name), &titles)
                .expect("official file");
            assert_eq!(file.area_name, area_name);
            assert_eq!(
                official_sub_map_display_name(&file.area_name, file.mode_index),
                display_name
            );
        }
    }

    fn write_official_dialog(root: &Path, text: &str) {
        let dialog_path = root.join("Content").join("Dialog");
        fs::create_dir_all(&dialog_path).expect("dialog dir");
        fs::write(dialog_path.join("ChineseSimplified.txt"), text).expect("dialog");
    }

    fn record(id: &str, relative_path: &str, kind: ModKind) -> ModRecord {
        ModRecord {
            id: id.to_string(),
            name: relative_path.to_string(),
            file_name: relative_path.to_string(),
            relative_path: relative_path.to_string(),
            absolute_path: relative_path.to_string(),
            is_archive: true,
            kind,
            enabled: true,
            favorite: false,
            protected: false,
            read_only: false,
            metadata: ModMetadata::default(),
            map_ids: vec![],
            sub_maps: vec![],
            map_count: 0,
            strawberry_count: 0,
            strawberry_total_count: 0,
            completion_status: CompletionStatus::Unknown,
            dependencies: Vec::<Dependency>::new(),
            optional_dependencies: vec![],
            stats: None,
            warnings: vec![],
        }
    }

    fn dependency(name: &str, version: &str) -> Dependency {
        Dependency {
            name: name.to_string(),
            version: version.to_string(),
        }
    }

    fn dependency_warnings_for_test(
        dependencies: &[Dependency],
        dependency_index: &DependencyIndex,
        warn_missing_dependencies: bool,
    ) -> (Vec<String>, HashSet<String>) {
        let mut unknown_builtin_dependencies = HashSet::new();
        let warnings = dependency_warnings(
            dependencies,
            dependency_index,
            warn_missing_dependencies,
            &mut unknown_builtin_dependencies,
        );
        (warnings, unknown_builtin_dependencies)
    }

    fn empty_profiles() -> ProfilesState {
        ProfilesState {
            active_map_profile_id: "default-maps".to_string(),
            active_mod_profile_id: "default-mods".to_string(),
            profiles: vec![],
        }
    }

    fn temp_celeste_root(label: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("celepkg-{label}-{}-{stamp}", std::process::id()))
    }

    fn write_dir_map(root: &Path, name: &str, sid: &str) {
        let mod_path = root.join("Mods").join(name);
        fs::create_dir_all(
            mod_path
                .join("Maps")
                .join(sid.rsplit_once('/').map(|(prefix, _)| prefix).unwrap_or("")),
        )
        .expect("map dir");
        fs::write(
            mod_path.join("everest.yaml"),
            format!("Name: {name}\nVersion: 1.0.0\n"),
        )
        .expect("everest yaml");
        fs::write(mod_path.join(format!("Maps/{sid}.bin")), "").expect("map bin");
    }

    fn write_dir_mod_with_dependencies(root: &Path, name: &str, dependencies: &[Dependency]) {
        let mod_path = root.join("Mods").join(name);
        fs::create_dir_all(&mod_path).expect("mod dir");
        let dependency_yaml = dependencies
            .iter()
            .map(|dependency| {
                format!(
                    "  - Name: {}\n    Version: {}\n",
                    dependency.name, dependency.version
                )
            })
            .collect::<String>();
        fs::write(
            mod_path.join("everest.yaml"),
            format!("Name: {name}\nVersion: 1.0.0\nDependencies:\n{dependency_yaml}"),
        )
        .expect("everest yaml");
    }

    fn save_xml(sid: &str, deaths: u64) -> String {
        format!(
            r#"<Save><AreaStats SID="{sid}"><AreaModeStats Deaths="{deaths}" TimePlayed="10" Completed="true" /></AreaStats></Save>"#
        )
    }
}
