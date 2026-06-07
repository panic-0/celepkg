use crate::domain::{ModRecord, ScanResult};
use crate::storage::write_text_file;
use crate::utils::normalize_slash;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub(super) struct Blacklist {
    pub(super) file: PathBuf,
    pub(super) lines: Vec<String>,
    pub(super) entries: HashSet<String>,
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

pub(super) fn read_blacklist(mods_path: &Path) -> Blacklist {
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

pub(super) fn read_favorites(mods_path: &Path) -> HashSet<String> {
    fs::read_to_string(mods_path.join("favorites.txt"))
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| normalize_slash(line).to_lowercase())
        .collect()
}

pub(super) fn is_blacklisted(record: &ModRecord, blacklist: &Blacklist) -> bool {
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

pub(super) fn is_favorite(record: &ModRecord, favorites: &HashSet<String>) -> bool {
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
