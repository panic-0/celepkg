use crate::domain::{CompletionStatus, MapStats, ModRecord, SaveFileInfo, SubMapInfo};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

struct ParsedSaveFile {
    name: String,
    areas: Vec<ParsedAreaStats>,
}

struct ParsedAreaStats {
    haystack: String,
    area_stats: MapStats,
    modes: Vec<ParsedModeStats>,
}

struct ParsedModeStats {
    stats: MapStats,
    berry_ids: HashSet<String>,
    missing_berry_ids: bool,
}

struct SaveStatsAccumulator {
    stats: MapStats,
    berry_ids: HashSet<String>,
    missing_berry_ids: bool,
}

impl SaveStatsAccumulator {
    fn new() -> Self {
        Self {
            stats: MapStats {
                strawberries_known: true,
                ..MapStats::default()
            },
            berry_ids: HashSet::new(),
            missing_berry_ids: false,
        }
    }

    fn finish_for_sub_map(mut self, sub_map: &SubMapInfo) -> MapStats {
        self.stats.strawberries_known = !self.missing_berry_ids;
        if !self.stats.strawberries_known {
            return self.stats;
        }
        if !sub_map.current_strawberry_ids_complete {
            let strawberries = self.berry_ids.len() as u64;
            self.stats.strawberries = strawberries;
            self.stats.total_strawberries = strawberries;
            return self.stats;
        }
        let visible = self
            .berry_ids
            .iter()
            .filter(|key| sub_map.current_visible_strawberry_ids.contains(*key))
            .count() as u64;
        let total = self
            .berry_ids
            .iter()
            .filter(|key| sub_map.current_total_strawberry_ids.contains(*key))
            .count() as u64;
        self.stats.strawberries = visible;
        self.stats.total_strawberries = total;
        self.stats.stale_strawberries = (self.berry_ids.len() as u64).saturating_sub(total);
        self.stats
    }
}

pub fn list_save_files(celeste_path: &Path) -> Vec<SaveFileInfo> {
    let saves_path = celeste_path.join("Saves");
    let mut saves: Vec<SaveFileInfo> = fs::read_dir(saves_path)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| {
                    path.file_name()
                        .map(|name| is_selectable_save_file(&name.to_string_lossy()))
                        .unwrap_or(false)
                })
                .filter_map(|path| read_save_file_info(&path))
                .collect()
        })
        .unwrap_or_default();
    saves.sort_by_key(|save| save_sort_key(&save.name));
    saves
}

pub fn normalize_selected_save_files(
    available: &[SaveFileInfo],
    selected: &[String],
) -> Vec<String> {
    let available_names: HashSet<&str> = available.iter().map(|save| save.name.as_str()).collect();
    let mut normalized: Vec<String> = selected
        .iter()
        .filter(|name| available_names.contains(name.as_str()))
        .cloned()
        .collect();
    normalized.sort_by_key(|left| save_sort_key(left));
    normalized.dedup();
    if normalized.is_empty() && available_names.contains("0.celeste") {
        normalized.push("0.celeste".to_string());
    }
    normalized
}

pub fn read_save_stats(
    celeste_path: &Path,
    maps: Vec<ModRecord>,
    selected_save_files: &[String],
) -> Vec<ModRecord> {
    let saves_path = celeste_path.join("Saves");
    let selected: HashSet<&str> = selected_save_files.iter().map(String::as_str).collect();
    let save_files: Vec<ParsedSaveFile> = fs::read_dir(saves_path)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| {
                    path.file_name()
                        .map(|name| selected.contains(name.to_string_lossy().as_ref()))
                        .unwrap_or(false)
                })
                .filter(|path| {
                    path.extension()
                        .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("celeste"))
                        .unwrap_or(false)
                })
                .filter_map(|path| {
                    let text = fs::read_to_string(&path).ok()?;
                    Some(ParsedSaveFile {
                        name: path.file_name()?.to_string_lossy().to_string(),
                        areas: parse_save_areas(&text),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    maps.into_iter()
        .map(|mut map| {
            map.sub_maps = map
                .sub_maps
                .into_iter()
                .map(|mut sub_map| {
                    let sub_needles = sub_map_needles(&sub_map);
                    sub_map.stats = collect_stats_from_saves(
                        &save_files,
                        &sub_needles,
                        sub_map.mode_index,
                        &sub_map,
                    );
                    sub_map.completion_status = sub_map_completion_status(&sub_map);
                    sub_map
                })
                .collect();
            let mut aggregate = MapStats {
                strawberries_known: true,
                ..MapStats::default()
            };
            for sub_map in &map.sub_maps {
                if let Some(stats) = &sub_map.stats {
                    merge_stats(&mut aggregate, stats);
                }
            }
            let completion_status = map_completion_status(&map.sub_maps);
            aggregate.completed = completion_status == CompletionStatus::Completed;
            aggregate.completion_known = matches!(
                completion_status,
                CompletionStatus::Completed | CompletionStatus::Unfinished
            );
            map.stats = if aggregate.save_files.is_empty() {
                None
            } else {
                Some(aggregate)
            };
            map.completion_status = completion_status;
            map
        })
        .collect()
}

fn collect_stats_from_saves(
    save_files: &[ParsedSaveFile],
    needles: &[String],
    mode_index: Option<u8>,
    sub_map: &SubMapInfo,
) -> Option<MapStats> {
    let mut accumulator = SaveStatsAccumulator::new();
    for file in save_files {
        let before = accumulator.stats.clone();
        let berry_count = accumulator.berry_ids.len();
        let missing_berries = accumulator.missing_berry_ids;
        accumulate_parsed_save_stats(file, needles, mode_index, &mut accumulator);
        if accumulator.stats.deaths != before.deaths
            || accumulator.berry_ids.len() != berry_count
            || accumulator.stats.time_played != before.time_played
            || accumulator.stats.completed != before.completed
            || accumulator.stats.completion_known != before.completion_known
            || accumulator.stats.cassettes != before.cassettes
            || accumulator.stats.hearts != before.hearts
            || accumulator.missing_berry_ids != missing_berries
        {
            accumulator.stats.save_files.push(file.name.clone());
        }
    }
    let mut stats = accumulator.finish_for_sub_map(sub_map);
    stats.save_files.sort();
    stats.save_files.dedup();
    if stats.save_files.is_empty() {
        None
    } else {
        Some(stats)
    }
}

fn accumulate_parsed_save_stats(
    file: &ParsedSaveFile,
    needles: &[String],
    mode_index: Option<u8>,
    accumulator: &mut SaveStatsAccumulator,
) {
    for area in &file.areas {
        if !needles
            .iter()
            .any(|needle| !needle.is_empty() && area.haystack.contains(needle))
        {
            continue;
        }
        if mode_index.is_none() || mode_index == Some(0) {
            add_basic_stats(&area.area_stats, &mut accumulator.stats);
        }
        for (index, mode) in area.modes.iter().enumerate() {
            if mode_index
                .map(|selected| selected as usize == index)
                .unwrap_or(true)
            {
                add_basic_stats(&mode.stats, &mut accumulator.stats);
                accumulator.berry_ids.extend(mode.berry_ids.iter().cloned());
                accumulator.missing_berry_ids =
                    accumulator.missing_berry_ids || mode.missing_berry_ids;
            }
        }
    }
}

fn parse_save_areas(xml: &str) -> Vec<ParsedAreaStats> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut areas = vec![];
    let mut current_area: Option<ParsedAreaStats> = None;
    let mut current_mode: Option<ParsedModeStats> = None;
    let mut area_depth: Option<usize> = None;
    let mut area_mode_depth: Option<usize> = None;
    let mut strawberry_depth: Option<usize> = None;
    let mut area_mode_total_strawberries = 0u64;
    let mut area_mode_berry_ids_seen = 0usize;
    let mut depth = 0usize;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                depth += 1;
                if is_area_stats_event(&event) {
                    let mut area_stats = MapStats::default();
                    add_area_event_stats(&event, &mut area_stats);
                    current_area = Some(ParsedAreaStats {
                        haystack: event_haystack(&event),
                        area_stats,
                        modes: vec![],
                    });
                    area_depth = Some(depth);
                } else if current_area.is_some() && is_area_mode_stats_event(&event) {
                    let mut stats = MapStats::default();
                    area_mode_total_strawberries = add_event_stats(&event, &mut stats);
                    area_mode_berry_ids_seen = 0;
                    current_mode = Some(ParsedModeStats {
                        stats,
                        berry_ids: HashSet::new(),
                        missing_berry_ids: false,
                    });
                    area_mode_depth = Some(depth);
                } else if area_mode_depth.is_some()
                    && event.name().as_ref().eq_ignore_ascii_case(b"Strawberries")
                {
                    strawberry_depth = Some(depth);
                } else if strawberry_depth.is_some()
                    && event.name().as_ref().eq_ignore_ascii_case(b"EntityID")
                    && add_berry_id_to_mode(&event, &mut current_mode)
                {
                    area_mode_berry_ids_seen += 1;
                }
            }
            Ok(Event::Empty(event)) => {
                if current_area.is_some() && is_area_mode_stats_event(&event) {
                    let mut stats = MapStats::default();
                    let total = add_event_stats(&event, &mut stats);
                    if let Some(area) = current_area.as_mut() {
                        area.modes.push(ParsedModeStats {
                            stats,
                            berry_ids: HashSet::new(),
                            missing_berry_ids: total > 0,
                        });
                    }
                } else if strawberry_depth.is_some()
                    && event.name().as_ref().eq_ignore_ascii_case(b"EntityID")
                    && add_berry_id_to_mode(&event, &mut current_mode)
                {
                    area_mode_berry_ids_seen += 1;
                }
            }
            Ok(Event::End(event)) => {
                if area_mode_depth == Some(depth) {
                    if let Some(mut mode) = current_mode.take() {
                        if area_mode_total_strawberries > 0 && area_mode_berry_ids_seen == 0 {
                            mode.missing_berry_ids = true;
                        }
                        if let Some(area) = current_area.as_mut() {
                            area.modes.push(mode);
                        }
                    }
                    area_mode_depth = None;
                    area_mode_total_strawberries = 0;
                    area_mode_berry_ids_seen = 0;
                }
                if strawberry_depth == Some(depth) {
                    strawberry_depth = None;
                }
                if area_depth == Some(depth)
                    || event.name().as_ref().eq_ignore_ascii_case(b"AreaStats")
                {
                    if let Some(area) = current_area.take() {
                        areas.push(area);
                    }
                    area_depth = None;
                }
                depth = depth.saturating_sub(1);
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    areas
}

fn add_basic_stats(source: &MapStats, target: &mut MapStats) {
    target.deaths = target.deaths.saturating_add(source.deaths);
    target.time_played = target.time_played.saturating_add(source.time_played);
    target.completed = target.completed || source.completed;
    target.completion_known = target.completion_known || source.completion_known;
    target.cassettes = target.cassettes.saturating_add(source.cassettes);
    target.hearts = target.hearts.saturating_add(source.hearts);
}

pub fn is_selectable_save_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower
        .strip_suffix(".celeste")
        .map(|stem| !stem.is_empty() && stem.chars().all(|ch| ch.is_ascii_digit()))
        .unwrap_or(false)
}

fn merge_stats(target: &mut MapStats, source: &MapStats) {
    target.deaths = target.deaths.saturating_add(source.deaths);
    target.strawberries_known = target.strawberries_known && source.strawberries_known;
    if target.strawberries_known {
        target.strawberries = target.strawberries.saturating_add(source.strawberries);
        target.total_strawberries = target
            .total_strawberries
            .saturating_add(source.total_strawberries);
        target.stale_strawberries = target
            .stale_strawberries
            .saturating_add(source.stale_strawberries);
    }
    target.time_played = target.time_played.saturating_add(source.time_played);
    target.completed = target.completed || source.completed;
    target.completion_known = target.completion_known || source.completion_known;
    target.cassettes = target.cassettes.saturating_add(source.cassettes);
    target.hearts = target.hearts.saturating_add(source.hearts);
    target.save_files.extend(source.save_files.iter().cloned());
    target.save_files.sort();
    target.save_files.dedup();
}

fn sub_map_completion_status(sub_map: &SubMapInfo) -> CompletionStatus {
    match &sub_map.stats {
        _ if is_non_completable_sub_map(&sub_map.sid) => CompletionStatus::NotApplicable,
        Some(stats) if stats.completion_known && stats.completed => CompletionStatus::Completed,
        Some(stats) if stats.completion_known => CompletionStatus::Unfinished,
        Some(_) => CompletionStatus::Unknown,
        None => CompletionStatus::Unfinished,
    }
}

fn map_completion_status(sub_maps: &[SubMapInfo]) -> CompletionStatus {
    let finishable: Vec<&SubMapInfo> = sub_maps
        .iter()
        .filter(|sub_map| sub_map.completion_status != CompletionStatus::NotApplicable)
        .collect();
    if finishable.is_empty() {
        return CompletionStatus::NotApplicable;
    }
    if finishable
        .iter()
        .all(|sub_map| sub_map.completion_status == CompletionStatus::Completed)
    {
        return CompletionStatus::Completed;
    }
    if finishable
        .iter()
        .any(|sub_map| sub_map.completion_status == CompletionStatus::Unfinished)
    {
        return CompletionStatus::Unfinished;
    }
    CompletionStatus::Unknown
}

fn is_non_completable_sub_map(sid: &str) -> bool {
    sid.split('/').any(|part| {
        let lower = part.to_lowercase();
        lower == "gym"
            || lower == "gyms"
            || lower.ends_with("-gym")
            || lower.ends_with("-gyms")
            || lower.ends_with("_gym")
            || lower.ends_with("_gyms")
            || lower.contains("training")
    })
}

fn sub_map_needles(sub_map: &SubMapInfo) -> Vec<String> {
    let sid_with_underscores = sub_map.sid.replace('/', "_");
    let official_area_sid = official_area_sid(sub_map);
    let mut values = vec![
        sub_map.sid.clone(),
        sub_map.file_path.clone(),
        sid_with_underscores,
    ];
    if let Some(sid) = official_area_sid {
        values.push(sid);
    }
    values
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_lowercase())
        .collect()
}

fn official_area_sid(sub_map: &SubMapInfo) -> Option<String> {
    let segments: Vec<&str> = sub_map
        .sid
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    if sub_map.mode_index.is_some()
        && segments.len() >= 3
        && segments[0].eq_ignore_ascii_case("Celeste")
    {
        Some(format!("{}/{}", segments[0], segments[1]))
    } else {
        None
    }
}

fn is_area_stats_event(event: &BytesStart<'_>) -> bool {
    event.name().as_ref().eq_ignore_ascii_case(b"AreaStats")
}

fn is_area_mode_stats_event(event: &BytesStart<'_>) -> bool {
    event.name().as_ref().eq_ignore_ascii_case(b"AreaModeStats")
}

fn event_haystack(event: &BytesStart<'_>) -> String {
    let mut haystack = String::from_utf8_lossy(event.name().as_ref()).to_lowercase();
    for attr in event.attributes().flatten() {
        haystack.push(' ');
        haystack.push_str(&String::from_utf8_lossy(attr.key.as_ref()).to_lowercase());
        haystack.push('=');
        haystack.push_str(&String::from_utf8_lossy(attr.value.as_ref()).to_lowercase());
    }
    haystack
}

fn add_area_event_stats(event: &BytesStart<'_>, stats: &mut MapStats) {
    for attr in event.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_lowercase();
        let value = String::from_utf8_lossy(attr.value.as_ref());
        if key == "cassette" && value.eq_ignore_ascii_case("true") {
            stats.cassettes = stats.cassettes.saturating_add(1);
        }
    }
}

fn add_event_stats(event: &BytesStart<'_>, stats: &mut MapStats) -> u64 {
    let mut total_strawberries = 0u64;
    for attr in event.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_lowercase();
        let value = String::from_utf8_lossy(attr.value.as_ref());
        let number = value.parse::<u64>().unwrap_or(0);
        match key.as_str() {
            "deaths" | "totaldeaths" => stats.deaths = stats.deaths.saturating_add(number),
            "strawberries" | "totalstrawberries" | "strawberriescollected" => {
                total_strawberries = total_strawberries.saturating_add(number)
            }
            "timeplayed" | "time" => stats.time_played = stats.time_played.saturating_add(number),
            "cassettes" | "cassette" => {
                if value.eq_ignore_ascii_case("true") {
                    stats.cassettes = stats.cassettes.saturating_add(1);
                } else {
                    stats.cassettes = stats.cassettes.saturating_add(number);
                }
            }
            "heartgems" | "heartgem" | "hearts" | "heart" => {
                if value.eq_ignore_ascii_case("true") {
                    stats.hearts = stats.hearts.saturating_add(1);
                } else {
                    stats.hearts = stats.hearts.saturating_add(number);
                }
            }
            "completed" | "complete" => {
                stats.completion_known = true;
                stats.completed = stats.completed || value.eq_ignore_ascii_case("true");
            }
            _ => {}
        }
    }
    total_strawberries
}

fn add_berry_id_to_mode(event: &BytesStart<'_>, mode: &mut Option<ParsedModeStats>) -> bool {
    let Some(mode) = mode.as_mut() else {
        return false;
    };
    if let Some(key) = attr_value(event, b"Key") {
        mode.berry_ids.insert(key);
        true
    } else {
        mode.missing_berry_ids = true;
        false
    }
}

fn attr_value(event: &BytesStart<'_>, name: &[u8]) -> Option<String> {
    event
        .attributes()
        .flatten()
        .find(|attr| attr.key.as_ref().eq_ignore_ascii_case(name))
        .map(|attr| String::from_utf8_lossy(attr.value.as_ref()).to_string())
}

fn read_save_file_info(path: &Path) -> Option<SaveFileInfo> {
    let text = fs::read_to_string(path).ok()?;
    let mut reader = Reader::from_str(&text);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut depth = 0usize;
    let mut reading_name = false;
    let mut player_name = String::new();
    let mut current_map = String::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                depth += 1;
                if depth == 2 && event.name().as_ref().eq_ignore_ascii_case(b"Name") {
                    reading_name = true;
                } else if depth == 2
                    && event
                        .name()
                        .as_ref()
                        .eq_ignore_ascii_case(b"CurrentSession_Safe")
                {
                    current_map = attr_value(&event, b"Level").unwrap_or_default();
                } else if depth == 2
                    && current_map.is_empty()
                    && (event.name().as_ref().eq_ignore_ascii_case(b"LastArea_Safe")
                        || event.name().as_ref().eq_ignore_ascii_case(b"LastArea"))
                {
                    current_map = attr_value(&event, b"SID").unwrap_or_default();
                }
            }
            Ok(Event::Empty(event)) => {
                if depth == 1
                    && event
                        .name()
                        .as_ref()
                        .eq_ignore_ascii_case(b"CurrentSession_Safe")
                {
                    current_map = attr_value(&event, b"Level").unwrap_or_default();
                } else if depth == 1
                    && current_map.is_empty()
                    && (event.name().as_ref().eq_ignore_ascii_case(b"LastArea_Safe")
                        || event.name().as_ref().eq_ignore_ascii_case(b"LastArea"))
                {
                    current_map = attr_value(&event, b"SID").unwrap_or_default();
                }
            }
            Ok(Event::Text(event)) if reading_name => {
                player_name = String::from_utf8_lossy(event.as_ref()).to_string();
            }
            Ok(Event::End(_)) => {
                if reading_name {
                    reading_name = false;
                }
                depth = depth.saturating_sub(1);
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        if !player_name.is_empty() && !current_map.is_empty() {
            break;
        }
        buf.clear();
    }
    Some(SaveFileInfo {
        name: path.file_name()?.to_string_lossy().to_string(),
        player_name,
        current_map,
        last_modified: file_modified_nanos(path).to_string(),
    })
}

fn file_modified_nanos(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn save_sort_key(name: &str) -> (u8, u64, String) {
    let lower = name.to_lowercase();
    let number = lower
        .strip_suffix(".celeste")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(u64::MAX);
    (0, number, lower)
}

#[cfg(test)]
#[path = "save_stats_tests.rs"]
mod tests;
