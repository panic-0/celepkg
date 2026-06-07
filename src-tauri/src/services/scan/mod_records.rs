use crate::domain::{CompletionStatus, ModKind, ModMetadata, ModRecord, SubMapInfo};
use crate::parsers::dialog::{dialog_title_for_sid, read_dialog_titles};
use crate::parsers::everest::{parse_metadata, parse_metadata_checked};
use crate::parsers::map_bin::{read_map_summary, StrawberryCounts, StrawberryIdSets};
use crate::utils::{normalize_slash, stable_id};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zip::ZipArchive;

pub(super) struct ModScanTarget {
    pub(super) file_name: String,
    pub(super) path: PathBuf,
}

pub(super) fn should_ignore_mods_entry(file_name: &str, is_dir: bool) -> bool {
    file_name.eq_ignore_ascii_case("blacklist.txt")
        || file_name.eq_ignore_ascii_case("favorites.txt")
        || (is_dir && file_name.eq_ignore_ascii_case("Cache"))
}

pub(super) fn read_directory_mod(dir_path: &Path, mods_path: &Path) -> Option<ModRecord> {
    let mut map_ids = vec![];
    let mut has_code = false;
    let mut yaml_text = String::new();
    let mut dialog_texts = vec![];
    let mut strawberry_counts = HashMap::new();
    let mut strawberry_ids = HashMap::new();
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
                    strawberry_ids.insert(sid.clone(), summary.strawberry_ids.clone());
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
            strawberry_ids,
            map_difficulties,
        },
    ))
}

pub(super) fn read_zip_mod(zip_path: &Path, mods_path: &Path) -> Option<ModRecord> {
    let file = match File::open(zip_path) {
        Ok(file) => file,
        Err(error) => {
            return Some(unreadable_zip_record(
                zip_path,
                mods_path,
                format!("压缩包无法读取：{error}"),
            ));
        }
    };
    let mut archive = match ZipArchive::new(file) {
        Ok(archive) => archive,
        Err(error) => {
            return Some(unreadable_zip_record(
                zip_path,
                mods_path,
                format!("压缩包无法打开或已损坏：{error}"),
            ));
        }
    };
    let mut map_ids = vec![];
    let mut has_code = false;
    let mut yaml_text = String::new();
    let mut dialog_texts = vec![];
    let mut strawberry_counts = HashMap::new();
    let mut strawberry_ids = HashMap::new();
    let mut map_difficulties = HashMap::new();
    let mut warnings = vec![];
    for index in 0..archive.len() {
        let mut file = match archive.by_index(index) {
            Ok(file) => file,
            Err(error) => {
                warnings.push(format!("压缩包条目 #{index} 无法读取：{error}"));
                continue;
            }
        };
        let name = normalize_slash(file.name());
        let bytes = if file.is_dir() {
            None
        } else if is_zip_entry_read_needed(&name) {
            read_zip_entry_bytes(&mut file, &name, &mut warnings)
        } else {
            None
        };
        if let Some(sid) = map_sid_from_entry(&name) {
            map_ids.push(sid.clone());
            if let Some(summary) = bytes.as_deref().and_then(read_map_summary) {
                strawberry_counts.insert(sid.clone(), summary.strawberry_counts);
                strawberry_ids.insert(sid.clone(), summary.strawberry_ids.clone());
                if let Some(difficulty) = summary
                    .map_icon
                    .and_then(|icon| difficulty_from_map_icon(&icon))
                {
                    map_difficulties.insert(sid, difficulty);
                }
            }
        }
        if is_everest_yaml_entry(&name) {
            if let Some(bytes) = bytes.as_deref() {
                yaml_text = String::from_utf8_lossy(bytes).into_owned();
            }
        } else if is_dialog_entry(&name) {
            if let Some(bytes) = bytes.as_deref() {
                dialog_texts.push((name.clone(), String::from_utf8_lossy(bytes).into_owned()));
            }
        } else if let Some(sid) = map_meta_sid_from_entry(&name) {
            if let Some(difficulty) = bytes
                .as_deref()
                .map(String::from_utf8_lossy)
                .and_then(|text| read_meta_yaml_icon(&text))
                .and_then(|icon| difficulty_from_map_icon(&icon))
            {
                map_difficulties.insert(sid, difficulty);
            }
        }
        if is_code_entry(&name) {
            has_code = true;
        }
    }
    let metadata = if yaml_text.trim().is_empty() {
        ModMetadata::default()
    } else {
        parse_metadata_checked(&yaml_text).unwrap_or_else(|error| {
            warnings.push(format!("everest.yaml 解析失败：{error}"));
            ModMetadata::default()
        })
    };
    let mut record = create_mod_record(
        zip_path,
        mods_path,
        true,
        ScannedModData {
            map_ids,
            has_code,
            metadata,
            dialog_titles: read_dialog_titles(dialog_texts),
            strawberry_counts,
            strawberry_ids,
            map_difficulties,
        },
    );
    record.warnings.extend(warnings);
    Some(record)
}

pub(super) fn unreadable_zip_record(
    zip_path: &Path,
    mods_path: &Path,
    warning: String,
) -> ModRecord {
    let mut record = create_mod_record(
        zip_path,
        mods_path,
        true,
        ScannedModData {
            map_ids: vec![],
            has_code: false,
            metadata: ModMetadata::default(),
            dialog_titles: HashMap::new(),
            strawberry_counts: HashMap::new(),
            strawberry_ids: HashMap::new(),
            map_difficulties: HashMap::new(),
        },
    );
    record.warnings.push(warning);
    record
}

pub(super) fn is_zip_entry_read_needed(name: &str) -> bool {
    map_sid_from_entry(name).is_some()
        || is_everest_yaml_entry(name)
        || is_dialog_entry(name)
        || map_meta_sid_from_entry(name).is_some()
}

pub(super) fn read_zip_entry_bytes(
    entry: &mut impl Read,
    name: &str,
    warnings: &mut Vec<String>,
) -> Option<Vec<u8>> {
    let mut bytes = vec![];
    match entry.read_to_end(&mut bytes) {
        Ok(_) => Some(bytes),
        Err(error) => {
            warnings.push(format!("压缩包条目 {name} 无法完整读取：{error}"));
            None
        }
    }
}

pub(super) struct ScannedModData {
    pub(super) map_ids: Vec<String>,
    pub(super) has_code: bool,
    pub(super) metadata: ModMetadata,
    pub(super) dialog_titles: HashMap<String, String>,
    pub(super) strawberry_counts: HashMap<String, StrawberryCounts>,
    pub(super) strawberry_ids: HashMap<String, StrawberryIdSets>,
    pub(super) map_difficulties: HashMap<String, String>,
}

pub(super) fn create_mod_record(
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
        strawberry_ids,
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
        .map(|sid| {
            let counts = strawberry_counts.get(sid).copied().unwrap_or_default();
            let ids = strawberry_ids
                .get(sid)
                .cloned()
                .unwrap_or_else(incomplete_strawberry_ids);
            SubMapInfo {
                id: stable_id(&format!("{}::{sid}", relative_path.to_lowercase())),
                sid: sid.clone(),
                mode_index: None,
                display_name: dialog_title_for_sid(sid, &dialog_titles)
                    .unwrap_or_else(|| sub_map_display_name(sid)),
                chapter: sub_map_chapter(sid),
                file_path: format!("Maps/{sid}.bin"),
                difficulty: map_difficulties.get(sid).cloned().unwrap_or_default(),
                strawberry_count: counts.visible,
                strawberry_total_count: counts.total,
                completion_status: CompletionStatus::Unknown,
                stats: None,
                current_visible_strawberry_ids: ids.visible,
                current_total_strawberry_ids: ids.total,
                current_strawberry_ids_complete: ids.complete,
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

pub(super) fn incomplete_strawberry_ids() -> StrawberryIdSets {
    StrawberryIdSets {
        complete: false,
        ..StrawberryIdSets::default()
    }
}

pub(super) fn map_sid_from_entry(entry: &str) -> Option<String> {
    if starts_with_ignore_ascii_case(entry, "maps/") && ends_with_ignore_ascii_case(entry, ".bin") {
        Some(entry[5..entry.len() - 4].to_string())
    } else {
        None
    }
}

pub(super) fn map_meta_sid_from_entry(entry: &str) -> Option<String> {
    if starts_with_ignore_ascii_case(entry, "maps/")
        && ends_with_ignore_ascii_case(entry, ".meta.yaml")
    {
        Some(entry[5..entry.len() - 10].to_string())
    } else {
        None
    }
}

pub(super) fn read_meta_yaml_icon(text: &str) -> Option<String> {
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

pub(super) fn difficulty_from_map_icon(icon: &str) -> Option<String> {
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

pub(super) fn title_case_difficulty(value: &str) -> String {
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

pub(super) fn is_map_mod_record(
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

pub(super) fn is_code_entry(entry: &str) -> bool {
    ends_with_ignore_ascii_case(entry, ".dll") || ends_with_ignore_ascii_case(entry, ".exe")
}

pub(super) fn is_dialog_entry(entry: &str) -> bool {
    starts_with_ignore_ascii_case(entry, "dialog/") && ends_with_ignore_ascii_case(entry, ".txt")
}

pub(super) fn is_everest_yaml_entry(entry: &str) -> bool {
    let basename = entry.rsplit('/').next().unwrap_or(entry);
    basename.eq_ignore_ascii_case("everest.yaml") || basename.eq_ignore_ascii_case("everest.yml")
}

pub(super) fn starts_with_ignore_ascii_case(value: &str, prefix: &str) -> bool {
    value
        .get(..prefix.len())
        .is_some_and(|head| head.eq_ignore_ascii_case(prefix))
}

pub(super) fn ends_with_ignore_ascii_case(value: &str, suffix: &str) -> bool {
    value
        .get(value.len().saturating_sub(suffix.len())..)
        .is_some_and(|tail| tail.eq_ignore_ascii_case(suffix))
}

pub(super) fn is_helper_like_mod(
    file_name: &str,
    relative_path: &str,
    metadata: &ModMetadata,
) -> bool {
    [
        file_name,
        relative_path,
        metadata.name.as_str(),
        metadata.description.as_str(),
    ]
    .iter()
    .any(|value| value.to_lowercase().contains("helper"))
}

pub(super) fn is_test_map_sid(sid: &str) -> bool {
    let lower = sid.to_lowercase();
    lower.split('/').any(|part| {
        matches!(
            part,
            "test" | "debug" | "sample" | "example" | "preview" | "dev" | "sandbox" | "demo"
        ) || part.ends_with("test")
            || part.contains("testmap")
    })
}

pub(super) fn sub_map_display_name(sid: &str) -> String {
    sid.rsplit('/')
        .next()
        .unwrap_or(sid)
        .replace(['_', '-'], " ")
}

pub(super) fn append_single_sub_map_name(map_name: String, sub_map_name: &str) -> String {
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

pub(super) fn sub_map_chapter(sid: &str) -> String {
    let mut parts = sid.split('/');
    let first = parts.next().unwrap_or_default();
    let second = parts.next().unwrap_or_default();
    if second.is_empty() {
        first.to_string()
    } else {
        format!("{first}/{second}")
    }
}
