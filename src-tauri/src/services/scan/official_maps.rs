use crate::domain::{CompletionStatus, ModKind, ModMetadata, ModRecord, SubMapInfo};
use crate::parsers::dialog::{dialog_title_for_key, read_dialog_titles};
use crate::parsers::map_bin::read_map_summary;
use crate::services::scan::mod_records::incomplete_strawberry_ids;
use crate::services::scan::state_files::is_favorite;
use crate::utils::stable_id;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub(super) struct OfficialMapFile {
    pub(super) area_name: String,
    area_sort: u16,
    side_sort: u8,
    side_name: String,
    sid: String,
    pub(super) mode_index: u8,
    file_name: String,
    path: PathBuf,
}

pub(super) fn scan_official_maps(
    celeste_path: &Path,
    favorites: &HashSet<String>,
) -> Vec<ModRecord> {
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
            let summary = fs::read(&file.path)
                .ok()
                .and_then(|bytes| read_map_summary(&bytes));
            let strawberry_counts = summary
                .as_ref()
                .map(|summary| summary.strawberry_counts)
                .unwrap_or_default();
            let strawberry_ids = summary
                .map(|summary| summary.strawberry_ids)
                .unwrap_or_else(incomplete_strawberry_ids);
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
                current_visible_strawberry_ids: strawberry_ids.visible,
                current_total_strawberry_ids: strawberry_ids.total,
                current_strawberry_ids_complete: strawberry_ids.complete,
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

pub(super) fn official_map_file_info(
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

pub(super) fn split_leading_digits(value: &str) -> Option<(&str, &str)> {
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

pub(super) fn read_official_dialog_titles(celeste_path: &Path) -> HashMap<String, String> {
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

pub(super) fn official_area_key(number: u16) -> String {
    format!("area_{number}")
}

pub(super) fn official_area_name(
    number: u16,
    fallback: &str,
    titles: &HashMap<String, String>,
) -> String {
    let title = dialog_title_for_key(&official_area_key(number), titles)
        .unwrap_or_else(|| official_area_fallback_name(number, fallback));
    official_numbered_area_name(number, &title)
}

pub(super) fn official_area_fallback_name(number: u16, fallback: &str) -> String {
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

pub(super) fn official_numbered_area_name(number: u16, title: &str) -> String {
    match number {
        1..=7 => format!("{number} - {title}"),
        9 => format!("8 - {title}"),
        10 => format!("9 - {title}"),
        _ => title.to_string(),
    }
}

pub(super) fn official_sub_map_display_name(area_name: &str, mode_index: u8) -> String {
    match mode_index {
        0 => area_name.to_string(),
        1 => format!("{area_name} B-Side"),
        2 => format!("{area_name} C-Side"),
        _ => area_name.to_string(),
    }
}
