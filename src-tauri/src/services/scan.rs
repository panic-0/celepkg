use crate::domain::{ModMetadata, ModRecord, ProfilesState, ScanResult, SubMapInfo};
use crate::parsers::dialog::{dialog_title_for_sid, is_dialog_file, read_dialog_titles};
use crate::parsers::everest::{is_builtin_dependency, parse_metadata};
use crate::parsers::save_stats::read_save_stats;
use crate::services::game::resolve_game_executable;
use crate::storage::{read_json, scan_cache_path, write_json};
use crate::utils::{normalize_slash, path_basename, stable_id};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;
use zip::ZipArchive;

const SCAN_CACHE_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ScanSignature {
    version: u32,
    celeste_path: String,
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

struct Blacklist {
    file: PathBuf,
    lines: Vec<String>,
    entries: HashSet<String>,
}

pub fn full_scan_cached(celeste_path: &Path, profiles: ProfilesState) -> ScanResult {
    let signature = build_scan_signature(celeste_path);
    let cache_path = scan_cache_path(celeste_path);
    if let Some(mut cached) = read_json::<CachedScan>(&cache_path) {
        if cached.signature == signature {
            cached.result.profiles = profiles;
            return cached.result;
        }
    }

    let result = full_scan(celeste_path, profiles);
    let cache = CachedScan {
        signature,
        result: result.clone(),
    };
    let _ = write_json(&cache_path, &cache);
    result
}

pub fn full_scan(celeste_path: &Path, profiles: ProfilesState) -> ScanResult {
    let mut scan = scan_mods(celeste_path, &profiles);
    scan.maps = read_save_stats(celeste_path, scan.maps);
    scan
}

fn build_scan_signature(celeste_path: &Path) -> ScanSignature {
    let mut files = vec![];
    collect_tree_stamps(celeste_path, &celeste_path.join("Mods"), "Mods", &mut files);
    collect_save_stamps(celeste_path, &mut files);
    collect_file_stamp(&celeste_path.join("Celeste.exe"), "Celeste.exe", &mut files);
    collect_file_stamp(&celeste_path.join("Celeste"), "Celeste", &mut files);
    files.sort_by(|a, b| a.path.cmp(&b.path));
    ScanSignature {
        version: SCAN_CACHE_VERSION,
        celeste_path: normalize_slash(&celeste_path.to_string_lossy()).to_lowercase(),
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
            if !is_primary_save_file_name(&file_name) {
                continue;
            }
            let relative = path.strip_prefix(celeste_path).unwrap_or(&path);
            collect_file_stamp(&path, &normalize_slash(&relative.to_string_lossy()), files);
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

fn is_primary_save_file_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower == "debug.celeste" {
        return true;
    }
    lower
        .strip_suffix(".celeste")
        .map(|stem| !stem.is_empty() && stem.chars().all(|ch| ch.is_ascii_digit()))
        .unwrap_or(false)
}

pub fn scan_mods(celeste_path: &Path, profiles: &ProfilesState) -> ScanResult {
    let mods_path = celeste_path.join("Mods");
    if !mods_path.exists() {
        return ScanResult {
            celeste_path: celeste_path.to_string_lossy().to_string(),
            mods_path: mods_path.to_string_lossy().to_string(),
            blacklist_path: mods_path
                .join("blacklist.txt")
                .to_string_lossy()
                .to_string(),
            blacklist_entries: vec![],
            game_executable: resolve_game_executable(celeste_path),
            maps: vec![],
            other_mods: vec![],
            profiles: profiles.clone(),
            warnings: vec!["没有找到 Celeste/Mods 目录。".to_string()],
        };
    }

    let blacklist = read_blacklist(&mods_path);
    let mut records = vec![];
    if let Ok(entries) = fs::read_dir(&mods_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.eq_ignore_ascii_case("blacklist.txt") {
                continue;
            }
            let parsed = if path.is_dir() {
                read_directory_mod(&path, &mods_path)
            } else if path.is_file() && file_name.to_lowercase().ends_with(".zip") {
                read_zip_mod(&path, &mods_path)
            } else {
                None
            };
            if let Some(mut record) = parsed {
                record.enabled = !is_blacklisted(&record, &blacklist);
                records.push(record);
            }
        }
    }

    let available_names: HashSet<String> = records
        .iter()
        .flat_map(|record| {
            [
                record.name.clone(),
                record.metadata.name.clone(),
                record.file_name.trim_end_matches(".zip").to_string(),
            ]
        })
        .filter(|name| !name.is_empty())
        .map(|name| name.to_lowercase())
        .collect();

    let mut maps = vec![];
    let mut other_mods = vec![];
    for mut record in records {
        if record.kind == "map" {
            for dep in &record.dependencies {
                if !dep.name.is_empty()
                    && !is_builtin_dependency(&dep.name)
                    && !available_names.contains(&dep.name.to_lowercase())
                {
                    record.warnings.push(format!(
                        "缺少依赖：{}{}",
                        dep.name,
                        if dep.version.is_empty() {
                            String::new()
                        } else {
                            format!(" {}", dep.version)
                        }
                    ));
                }
            }
            maps.push(record);
        } else {
            other_mods.push(record);
        }
    }
    maps.sort_by(|a, b| a.name.cmp(&b.name));
    other_mods.sort_by(|a, b| a.name.cmp(&b.name));

    ScanResult {
        celeste_path: celeste_path.to_string_lossy().to_string(),
        mods_path: mods_path.to_string_lossy().to_string(),
        blacklist_path: blacklist.file.to_string_lossy().to_string(),
        blacklist_entries: blacklist.entries.iter().cloned().collect(),
        game_executable: resolve_game_executable(celeste_path),
        maps,
        other_mods,
        profiles: profiles.clone(),
        warnings: vec![],
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
    let mut lines: Vec<String> = blacklist
        .lines
        .into_iter()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return true;
            }
            !managed_keys.contains(&normalize_slash(trimmed).to_lowercase())
        })
        .collect();
    let enabled_maps: HashSet<&String> = enabled_map_ids.iter().collect();
    for map in &scan.maps {
        if !enabled_maps.contains(&map.id) {
            lines.push(map.relative_path.clone());
        }
    }
    let enabled_mods: HashSet<&String> = enabled_mod_ids.iter().collect();
    for mod_item in &scan.other_mods {
        if !enabled_mods.contains(&mod_item.id) {
            lines.push(mod_item.relative_path.clone());
        }
    }
    fs::create_dir_all(&mods_path).map_err(|error| format!("创建 Mods 目录失败：{error}"))?;
    let mut file =
        File::create(&blacklist.file).map_err(|error| format!("写入 blacklist 失败：{error}"))?;
    let content = format!("{}\n", lines.join("\n").trim());
    file.write_all(content.as_bytes())
        .map_err(|error| format!("写入 blacklist 失败：{error}"))
}

fn read_directory_mod(dir_path: &Path, mods_path: &Path) -> Option<ModRecord> {
    let mut entries = vec![];
    let mut yaml_text = String::new();
    let mut dialog_texts = vec![];
    for entry in WalkDir::new(dir_path).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let relative =
            normalize_slash(&entry.path().strip_prefix(dir_path).ok()?.to_string_lossy());
        if path_basename(&relative).eq_ignore_ascii_case("everest.yaml")
            || path_basename(&relative).eq_ignore_ascii_case("everest.yml")
        {
            yaml_text = fs::read_to_string(entry.path()).unwrap_or_default();
        }
        if is_dialog_file(&relative) {
            dialog_texts.push((
                relative.clone(),
                fs::read_to_string(entry.path()).unwrap_or_default(),
            ));
        }
        entries.push(relative);
    }
    Some(create_mod_record(
        dir_path,
        mods_path,
        false,
        entries,
        parse_metadata(&yaml_text),
        read_dialog_titles(dialog_texts),
    ))
}

fn read_zip_mod(zip_path: &Path, mods_path: &Path) -> Option<ModRecord> {
    let file = File::open(zip_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut entries = vec![];
    let mut yaml_text = String::new();
    let mut dialog_texts = vec![];
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).ok()?;
        let name = normalize_slash(file.name());
        let mut text = String::new();
        if path_basename(&name).eq_ignore_ascii_case("everest.yaml")
            || path_basename(&name).eq_ignore_ascii_case("everest.yml")
        {
            let _ = file.read_to_string(&mut text);
            yaml_text = text.clone();
        } else if is_dialog_file(&name) {
            let _ = file.read_to_string(&mut text);
            dialog_texts.push((name.clone(), text));
        }
        entries.push(name);
    }
    Some(create_mod_record(
        zip_path,
        mods_path,
        true,
        entries,
        parse_metadata(&yaml_text),
        read_dialog_titles(dialog_texts),
    ))
}

fn create_mod_record(
    absolute_path: &Path,
    mods_path: &Path,
    is_archive: bool,
    entries: Vec<String>,
    metadata: ModMetadata,
    dialog_titles: HashMap<String, String>,
) -> ModRecord {
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
    let map_ids: Vec<String> = entries
        .iter()
        .filter_map(|entry| {
            let lower = entry.to_lowercase();
            if lower.starts_with("maps/") && lower.ends_with(".bin") {
                Some(entry[5..entry.len() - 4].to_string())
            } else {
                None
            }
        })
        .collect();
    let sub_maps: Vec<SubMapInfo> = map_ids
        .iter()
        .map(|sid| SubMapInfo {
            id: stable_id(&format!("{}::{sid}", relative_path.to_lowercase())),
            sid: sid.clone(),
            display_name: dialog_title_for_sid(sid, &dialog_titles)
                .unwrap_or_else(|| sub_map_display_name(sid)),
            chapter: sub_map_chapter(sid),
            file_path: format!("Maps/{sid}.bin"),
            stats: None,
        })
        .collect();
    let is_map_mod = is_map_mod_record(&file_name, &relative_path, &metadata, &map_ids, &entries);
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
        kind: if is_map_mod { "map" } else { "mod" }.to_string(),
        enabled: true,
        map_count: map_ids.len(),
        dependencies: metadata.dependencies.clone(),
        optional_dependencies: metadata.optional_dependencies.clone(),
        metadata,
        map_ids,
        sub_maps,
        stats: None,
        warnings: vec![],
    }
}

fn is_map_mod_record(
    file_name: &str,
    relative_path: &str,
    metadata: &ModMetadata,
    map_ids: &[String],
    entries: &[String],
) -> bool {
    if map_ids.is_empty() {
        return false;
    }
    let has_code = entries.iter().any(|entry| {
        let lower = entry.to_lowercase();
        lower.ends_with(".dll") || lower.ends_with(".exe")
    });
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

fn is_blacklisted(record: &ModRecord, blacklist: &Blacklist) -> bool {
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
    .any(|value| blacklist.entries.contains(&value))
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
        let entries = vec![
            "everest.yaml".to_string(),
            "Maps/sleuter/chinatour/micnight.bin".to_string(),
            "Maps/sleuter/chinatour/micpeach.bin".to_string(),
        ];

        assert!(is_map_mod_record(
            "A_Tour_in_China.zip",
            "A_Tour_in_China.zip",
            &metadata("A Tour in China"),
            &map_ids,
            &entries,
        ));
    }

    #[test]
    fn classifies_helper_with_test_maps_as_other_mod() {
        let map_ids = vec!["leppa/AltSidesHelper/AltSidesHelperTest".to_string()];
        let entries = vec![
            "bin/Debug/AltSidesHelper.dll".to_string(),
            "Maps/leppa/AltSidesHelper/AltSidesHelperTest.bin".to_string(),
        ];

        assert!(!is_map_mod_record(
            "AltSidesHelper.zip",
            "AltSidesHelper.zip",
            &metadata("AltSidesHelper"),
            &map_ids,
            &entries,
        ));
    }

    #[test]
    fn classifies_code_mod_with_only_test_maps_as_other_mod() {
        let map_ids = vec!["preview/test".to_string()];
        let entries = vec![
            "Example.dll".to_string(),
            "Maps/preview/test.bin".to_string(),
        ];

        assert!(!is_map_mod_record(
            "Example.zip",
            "Example.zip",
            &metadata("Example"),
            &map_ids,
            &entries,
        ));
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
            maps: vec![record("map-id", "Map.zip", "map")],
            other_mods: vec![record("mod-id", "Helper.zip", "mod")],
            profiles: ProfilesState {
                active_profile_id: "default".to_string(),
                profiles: vec![],
            },
            warnings: vec![],
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
    fn cached_scan_uses_latest_profiles_and_invalidates_on_blacklist() {
        let root = temp_celeste_root("cache-blacklist");
        write_dir_map(&root, "TestMap", "maps/cache/one");
        let cache_file = scan_cache_path(&root);
        let _ = fs::remove_file(&cache_file);

        let first = full_scan_cached(
            &root,
            ProfilesState {
                active_profile_id: "one".to_string(),
                profiles: vec![],
            },
        );
        assert_eq!(first.profiles.active_profile_id, "one");
        assert_eq!(first.maps.len(), 1);
        assert!(first.maps[0].enabled);

        let cached = full_scan_cached(
            &root,
            ProfilesState {
                active_profile_id: "two".to_string(),
                profiles: vec![],
            },
        );
        assert_eq!(cached.profiles.active_profile_id, "two");
        assert!(cached.maps[0].enabled);

        fs::write(root.join("Mods").join("blacklist.txt"), "TestMap\n").expect("blacklist");
        let invalidated = full_scan_cached(
            &root,
            ProfilesState {
                active_profile_id: "three".to_string(),
                profiles: vec![],
            },
        );

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert_eq!(invalidated.profiles.active_profile_id, "three");
        assert!(!invalidated.maps[0].enabled);
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

        let first = full_scan_cached(&root, empty_profiles());
        assert_eq!(
            first.maps[0].stats.as_ref().map(|stats| stats.deaths),
            Some(1)
        );

        fs::write(
            saves_path.join("0.celeste"),
            format!("{}\n<!-- changed -->", save_xml("maps/cache/save", 7)),
        )
        .expect("save file update");
        let second = full_scan_cached(&root, empty_profiles());

        let _ = fs::remove_file(cache_file);
        let _ = fs::remove_dir_all(root);

        assert_eq!(
            second.maps[0].stats.as_ref().map(|stats| stats.deaths),
            Some(7)
        );
    }

    fn record(id: &str, relative_path: &str, kind: &str) -> ModRecord {
        ModRecord {
            id: id.to_string(),
            name: relative_path.to_string(),
            file_name: relative_path.to_string(),
            relative_path: relative_path.to_string(),
            absolute_path: relative_path.to_string(),
            is_archive: true,
            kind: kind.to_string(),
            enabled: true,
            metadata: ModMetadata::default(),
            map_ids: vec![],
            sub_maps: vec![],
            map_count: 0,
            dependencies: Vec::<Dependency>::new(),
            optional_dependencies: vec![],
            stats: None,
            warnings: vec![],
        }
    }

    fn empty_profiles() -> ProfilesState {
        ProfilesState {
            active_profile_id: "default".to_string(),
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

    fn save_xml(sid: &str, deaths: u64) -> String {
        format!(
            r#"<Save><AreaStats SID="{sid}"><AreaModeStats Deaths="{deaths}" TimePlayed="10" Completed="true" /></AreaStats></Save>"#
        )
    }
}
