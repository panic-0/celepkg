use crate::domain::ScanResult;
use crate::parsers::save_stats::is_selectable_save_file;
use crate::storage::write_json;
use crate::utils::normalize_slash;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

const SCAN_CACHE_VERSION: u32 = 17;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct ScanSignature {
    version: u32,
    celeste_path: String,
    pub(super) selected_save_files: Vec<String>,
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
pub(super) struct CachedScan {
    pub(super) signature: ScanSignature,
    pub(super) result: ScanResult,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedScanRef<'a> {
    signature: &'a ScanSignature,
    result: &'a ScanResult,
}

pub(super) fn write_cached_scan(
    cache_path: &Path,
    signature: &ScanSignature,
    result: &ScanResult,
) -> Result<(), String> {
    let cache = CachedScanRef { signature, result };
    write_json(cache_path, &cache)
}

pub(super) fn build_scan_signature(
    celeste_path: &Path,
    selected_save_files: &[String],
) -> ScanSignature {
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
