use crate::domain::{MapStats, ModRecord, SaveFileInfo, SubMapInfo};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

struct SaveFileSnapshot {
    name: String,
    text: String,
    lower_text: String,
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

    fn finish(mut self) -> MapStats {
        self.stats.strawberries = self.berry_ids.len() as u64;
        self.stats.strawberries_known = !self.missing_berry_ids;
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
    saves.sort_by(|left, right| save_sort_key(&left.name).cmp(&save_sort_key(&right.name)));
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
    normalized.sort_by(|left, right| save_sort_key(left).cmp(&save_sort_key(right)));
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
    let save_files: Vec<SaveFileSnapshot> = fs::read_dir(saves_path)
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
                    Some(SaveFileSnapshot {
                        name: path.file_name()?.to_string_lossy().to_string(),
                        lower_text: text.to_lowercase(),
                        text,
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
                    sub_map.stats =
                        collect_stats_from_saves(&save_files, &sub_needles, sub_map.mode_index);
                    sub_map.completion_status = sub_map_completion_status(&sub_map).to_string();
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
            aggregate.completed = completion_status == "completed";
            aggregate.completion_known =
                matches!(completion_status.as_str(), "completed" | "unfinished");
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
    save_files: &[SaveFileSnapshot],
    needles: &[String],
    mode_index: Option<u8>,
) -> Option<MapStats> {
    let mut accumulator = SaveStatsAccumulator::new();
    for file in save_files {
        if !needles
            .iter()
            .any(|needle| !needle.is_empty() && file.lower_text.contains(needle))
        {
            continue;
        }
        let before = accumulator.stats.clone();
        let berry_count = accumulator.berry_ids.len();
        let missing_berries = accumulator.missing_berry_ids;
        accumulate_save_stats(&file.text, needles, mode_index, &mut accumulator);
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
    let mut stats = accumulator.finish();
    stats.save_files.sort();
    stats.save_files.dedup();
    if stats.save_files.is_empty() {
        None
    } else {
        Some(stats)
    }
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

fn sub_map_completion_status(sub_map: &SubMapInfo) -> &'static str {
    match &sub_map.stats {
        Some(stats) if stats.completion_known && stats.completed => "completed",
        Some(stats) if stats.completion_known => "unfinished",
        _ if is_non_completable_sub_map(&sub_map.sid) => "notApplicable",
        Some(_) => "unknown",
        None => "unfinished",
    }
}

fn map_completion_status(sub_maps: &[SubMapInfo]) -> String {
    let finishable: Vec<&SubMapInfo> = sub_maps
        .iter()
        .filter(|sub_map| sub_map.completion_status != "notApplicable")
        .collect();
    if finishable.is_empty() {
        return "notApplicable".to_string();
    }
    if finishable
        .iter()
        .all(|sub_map| sub_map.completion_status == "completed")
    {
        return "completed".to_string();
    }
    if finishable
        .iter()
        .any(|sub_map| sub_map.completion_status == "unfinished")
    {
        return "unfinished".to_string();
    }
    "unknown".to_string()
}

fn is_non_completable_sub_map(sid: &str) -> bool {
    sid.split('/').any(|part| {
        let lower = part.to_lowercase();
        lower == "gym"
            || lower == "gyms"
            || lower.ends_with("-gym")
            || lower.ends_with("_gym")
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

fn accumulate_save_stats(
    xml: &str,
    needles: &[String],
    mode_index: Option<u8>,
    accumulator: &mut SaveStatsAccumulator,
) {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut area_depth: Option<usize> = None;
    let mut area_sid = String::new();
    let mut area_mode_depth: Option<usize> = None;
    let mut strawberry_depth: Option<usize> = None;
    let mut area_mode_total_strawberries = 0u64;
    let mut area_mode_berry_ids_seen = 0usize;
    let mut next_area_mode_index = 0usize;
    let mut depth = 0usize;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                depth += 1;
                if is_area_stats_event(&event) && event_matches(&event, needles) {
                    area_depth = Some(depth);
                    area_sid = attr_value(&event, b"SID").unwrap_or_default();
                    next_area_mode_index = 0;
                    if mode_index.is_none() || mode_index == Some(0) {
                        add_area_event_stats(&event, &mut accumulator.stats);
                    }
                } else if area_depth.is_some() && is_area_mode_stats_event(&event) {
                    let current_mode_index = next_area_mode_index;
                    next_area_mode_index += 1;
                    if mode_index
                        .map(|selected| selected as usize == current_mode_index)
                        .unwrap_or(true)
                    {
                        area_mode_depth = Some(depth);
                        area_mode_total_strawberries =
                            add_event_stats(&event, &mut accumulator.stats);
                        area_mode_berry_ids_seen = 0;
                    }
                } else if area_mode_depth.is_some()
                    && event.name().as_ref().eq_ignore_ascii_case(b"Strawberries")
                {
                    strawberry_depth = Some(depth);
                } else if strawberry_depth.is_some()
                    && event.name().as_ref().eq_ignore_ascii_case(b"EntityID")
                {
                    if add_berry_id(&event, &area_sid, accumulator) {
                        area_mode_berry_ids_seen += 1;
                    }
                }
            }
            Ok(Event::Empty(event)) => {
                if area_depth.is_some() && is_area_mode_stats_event(&event) {
                    let current_mode_index = next_area_mode_index;
                    next_area_mode_index += 1;
                    if mode_index
                        .map(|selected| selected as usize == current_mode_index)
                        .unwrap_or(true)
                    {
                        let total = add_event_stats(&event, &mut accumulator.stats);
                        if total > 0 {
                            accumulator.missing_berry_ids = true;
                        }
                    }
                } else if strawberry_depth.is_some()
                    && event.name().as_ref().eq_ignore_ascii_case(b"EntityID")
                {
                    if add_berry_id(&event, &area_sid, accumulator) {
                        area_mode_berry_ids_seen += 1;
                    }
                }
            }
            Ok(Event::End(event)) => {
                if area_mode_depth == Some(depth) {
                    if area_mode_total_strawberries > 0 && area_mode_berry_ids_seen == 0 {
                        accumulator.missing_berry_ids = true;
                    }
                    area_mode_depth = None;
                    area_mode_total_strawberries = 0;
                    area_mode_berry_ids_seen = 0;
                }
                if strawberry_depth == Some(depth) {
                    strawberry_depth = None;
                }
                if area_depth == Some(depth) {
                    area_depth = None;
                    area_sid.clear();
                    next_area_mode_index = 0;
                } else if event.name().as_ref().eq_ignore_ascii_case(b"AreaStats") {
                    area_depth = None;
                    area_sid.clear();
                    next_area_mode_index = 0;
                }
                depth = depth.saturating_sub(1);
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
}

fn is_area_stats_event(event: &BytesStart<'_>) -> bool {
    event.name().as_ref().eq_ignore_ascii_case(b"AreaStats")
}

fn is_area_mode_stats_event(event: &BytesStart<'_>) -> bool {
    event.name().as_ref().eq_ignore_ascii_case(b"AreaModeStats")
}

fn event_matches(event: &BytesStart<'_>, needles: &[String]) -> bool {
    let mut haystack = String::from_utf8_lossy(event.name().as_ref()).to_lowercase();
    for attr in event.attributes().flatten() {
        haystack.push(' ');
        haystack.push_str(&String::from_utf8_lossy(attr.key.as_ref()).to_lowercase());
        haystack.push('=');
        haystack.push_str(&String::from_utf8_lossy(attr.value.as_ref()).to_lowercase());
    }
    needles
        .iter()
        .any(|needle| !needle.is_empty() && haystack.contains(needle))
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

fn add_berry_id(
    event: &BytesStart<'_>,
    area_sid: &str,
    accumulator: &mut SaveStatsAccumulator,
) -> bool {
    if let Some(key) = attr_value(event, b"Key") {
        accumulator.berry_ids.insert(format!("{area_sid}:{key}"));
        true
    } else {
        accumulator.missing_berry_ids = true;
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
mod tests {
    use super::*;

    #[test]
    fn only_primary_save_names_are_read() {
        assert!(is_selectable_save_file("0.celeste"));
        assert!(is_selectable_save_file("12.celeste"));
        assert!(!is_selectable_save_file("debug.celeste"));
        assert!(!is_selectable_save_file("0-modsavedata.celeste"));
        assert!(!is_selectable_save_file("0-modsave-CollabUtils2.celeste"));
    }

    #[test]
    fn ignores_old_stats_outside_area_stats() {
        let mut accumulator = SaveStatsAccumulator::new();
        accumulate_save_stats(
            r#"<Save><OldStats SID="Map"><AreaModeStats Deaths="99" /></OldStats><AreaStats SID="Map"><AreaModeStats Deaths="3" TimePlayed="20" Completed="true" /></AreaStats></Save>"#,
            &["map".to_string()],
            None,
            &mut accumulator,
        );
        let stats = accumulator.finish();

        assert_eq!(stats.deaths, 3);
        assert_eq!(stats.time_played, 20);
        assert!(stats.completed);
    }

    #[test]
    fn records_explicit_incomplete_state() {
        let mut accumulator = SaveStatsAccumulator::new();
        accumulate_save_stats(
            r#"<Save><AreaStats SID="Map"><AreaModeStats Deaths="3" Completed="false" /></AreaStats></Save>"#,
            &["map".to_string()],
            None,
            &mut accumulator,
        );
        let stats = accumulator.finish();

        assert!(stats.completion_known);
        assert!(!stats.completed);
    }

    #[test]
    fn strawberries_use_entity_id_union() {
        let mut accumulator = SaveStatsAccumulator::new();
        accumulate_save_stats(
            r#"<Save><AreaStats SID="Map"><AreaModeStats TotalStrawberries="2"><Strawberries><EntityID Key="a:1" /><EntityID Key="a:2" /></Strawberries></AreaModeStats></AreaStats></Save>"#,
            &["map".to_string()],
            None,
            &mut accumulator,
        );
        accumulate_save_stats(
            r#"<Save><AreaStats SID="Map"><AreaModeStats TotalStrawberries="2"><Strawberries><EntityID Key="a:2" /><EntityID Key="a:3" /></Strawberries></AreaModeStats></AreaStats></Save>"#,
            &["map".to_string()],
            None,
            &mut accumulator,
        );
        let stats = accumulator.finish();

        assert!(stats.strawberries_known);
        assert_eq!(stats.strawberries, 3);
    }

    #[test]
    fn duplicate_strawberries_across_saves_stay_known() {
        let mut accumulator = SaveStatsAccumulator::new();
        let save = r#"<Save><AreaStats SID="Map"><AreaModeStats TotalStrawberries="1"><Strawberries><EntityID Key="a:1" /></Strawberries></AreaModeStats></AreaStats></Save>"#;
        accumulate_save_stats(save, &["map".to_string()], None, &mut accumulator);
        accumulate_save_stats(save, &["map".to_string()], None, &mut accumulator);
        let stats = accumulator.finish();

        assert!(stats.strawberries_known);
        assert_eq!(stats.strawberries, 1);
    }

    #[test]
    fn strawberries_are_unknown_when_only_totals_exist() {
        let mut accumulator = SaveStatsAccumulator::new();
        accumulate_save_stats(
            r#"<Save><AreaStats SID="Map"><AreaModeStats TotalStrawberries="2" /></AreaStats></Save>"#,
            &["map".to_string()],
            None,
            &mut accumulator,
        );
        let stats = accumulator.finish();

        assert!(!stats.strawberries_known);
        assert_eq!(stats.strawberries, 0);
    }

    #[test]
    fn mode_index_selects_official_side_stats() {
        let mut accumulator = SaveStatsAccumulator::new();
        accumulate_save_stats(
            r#"<Save><AreaStats SID="Celeste/1-ForsakenCity" Cassette="true"><Modes><AreaModeStats Deaths="1" Completed="true" HeartGem="true" /><AreaModeStats Deaths="2" Completed="false" HeartGem="true" /><AreaModeStats Deaths="3" Completed="true" HeartGem="true" /></Modes></AreaStats></Save>"#,
            &["celeste/1-forsakencity".to_string()],
            Some(1),
            &mut accumulator,
        );
        let stats = accumulator.finish();

        assert_eq!(stats.deaths, 2);
        assert_eq!(stats.hearts, 1);
        assert_eq!(stats.cassettes, 0);
        assert!(stats.completion_known);
        assert!(!stats.completed);
    }

    #[test]
    fn map_completion_requires_all_finishable_sub_maps() {
        let sub_maps = vec![
            sub_map("Pack/MapA", "completed"),
            sub_map("Pack/MapB", "unfinished"),
            sub_map("Pack/Gym", "notApplicable"),
        ];

        assert_eq!(map_completion_status(&sub_maps), "unfinished");
    }

    #[test]
    fn gyms_do_not_count_against_pack_completion() {
        let sub_maps = vec![
            sub_map("Pack/MapA", "completed"),
            sub_map("Pack/Gym", "notApplicable"),
        ];

        assert_eq!(map_completion_status(&sub_maps), "completed");
        assert_eq!(
            sub_map_completion_status(&sub_map("StrawberryJam2021/5-Grandmaster/Gym", "unknown")),
            "notApplicable"
        );
    }

    #[test]
    fn explicit_completion_beats_gym_heuristic() {
        let mut sub_map = sub_map("Pack/Gym", "unknown");
        sub_map.stats = Some(MapStats {
            completion_known: true,
            completed: true,
            ..MapStats::default()
        });

        assert_eq!(sub_map_completion_status(&sub_map), "completed");
    }

    fn sub_map(sid: &str, completion_status: &str) -> SubMapInfo {
        SubMapInfo {
            id: sid.to_string(),
            sid: sid.to_string(),
            mode_index: None,
            display_name: sid.to_string(),
            chapter: String::new(),
            file_path: format!("Maps/{sid}.bin"),
            strawberry_count: 0,
            completion_status: completion_status.to_string(),
            stats: None,
        }
    }
}
