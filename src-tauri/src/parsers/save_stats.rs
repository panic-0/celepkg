use crate::domain::{MapStats, ModRecord, SubMapInfo};
use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use std::fs;
use std::path::Path;

struct SaveFileSnapshot {
    name: String,
    text: String,
    lower_text: String,
}

pub fn read_save_stats(celeste_path: &Path, maps: Vec<ModRecord>) -> Vec<ModRecord> {
    let saves_path = celeste_path.join("Saves");
    if !saves_path.exists() {
        return maps;
    }
    let save_files: Vec<SaveFileSnapshot> = fs::read_dir(saves_path)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| {
                    path.file_name()
                        .map(|name| is_primary_save_file(&name.to_string_lossy()))
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
                    sub_map.stats = collect_stats_from_saves(&save_files, &sub_needles);
                    sub_map
                })
                .collect();
            let mut aggregate = MapStats::default();
            for sub_map in &map.sub_maps {
                if let Some(stats) = &sub_map.stats {
                    merge_stats(&mut aggregate, stats);
                }
            }
            map.stats = if aggregate.save_files.is_empty() {
                None
            } else {
                Some(aggregate)
            };
            map
        })
        .collect()
}

fn collect_stats_from_saves(save_files: &[SaveFileSnapshot], needles: &[String]) -> Option<MapStats> {
    let mut stats = MapStats::default();
    for file in save_files {
        if !needles.iter().any(|needle| !needle.is_empty() && file.lower_text.contains(needle)) {
            continue;
        }
        let before = stats.clone();
        accumulate_save_stats(&file.text, needles, &mut stats);
        if stats.deaths != before.deaths
            || stats.strawberries != before.strawberries
            || stats.time_played != before.time_played
            || stats.completed != before.completed
            || stats.cassettes != before.cassettes
            || stats.hearts != before.hearts
        {
            stats.save_files.push(file.name.clone());
        }
    }
    stats.save_files.sort();
    stats.save_files.dedup();
    if stats.save_files.is_empty() {
        None
    } else {
        Some(stats)
    }
}

fn is_primary_save_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower == "debug.celeste" {
        return true;
    }
    lower
        .strip_suffix(".celeste")
        .map(|stem| !stem.is_empty() && stem.chars().all(|ch| ch.is_ascii_digit()))
        .unwrap_or(false)
}

fn merge_stats(target: &mut MapStats, source: &MapStats) {
    target.deaths = target.deaths.saturating_add(source.deaths);
    target.strawberries = target.strawberries.saturating_add(source.strawberries);
    target.time_played = target.time_played.saturating_add(source.time_played);
    target.completed = target.completed || source.completed;
    target.cassettes = target.cassettes.saturating_add(source.cassettes);
    target.hearts = target.hearts.saturating_add(source.hearts);
    target.save_files.extend(source.save_files.iter().cloned());
    target.save_files.sort();
    target.save_files.dedup();
}

fn sub_map_needles(sub_map: &SubMapInfo) -> Vec<String> {
    let sid_with_underscores = sub_map.sid.replace('/', "_");
    [
        sub_map.sid.clone(),
        sub_map.file_path.clone(),
        sid_with_underscores,
    ]
    .into_iter()
    .filter(|value| !value.trim().is_empty())
    .map(|value| value.to_lowercase())
    .collect()
}

fn accumulate_save_stats(xml: &str, needles: &[String], stats: &mut MapStats) {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut area_depth: Option<usize> = None;
    let mut depth = 0usize;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                depth += 1;
                if is_area_stats_event(&event) && event_matches(&event, needles) {
                    area_depth = Some(depth);
                } else if area_depth.is_some() && is_area_mode_stats_event(&event) {
                    add_event_stats(&event, stats);
                }
            }
            Ok(Event::Empty(event)) => {
                if area_depth.is_some() && is_area_mode_stats_event(&event) {
                    add_event_stats(&event, stats);
                }
            }
            Ok(Event::End(_)) => {
                if area_depth == Some(depth) {
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
    needles.iter().any(|needle| !needle.is_empty() && haystack.contains(needle))
}

fn add_event_stats(event: &BytesStart<'_>, stats: &mut MapStats) {
    for attr in event.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_lowercase();
        let value = String::from_utf8_lossy(attr.value.as_ref());
        let number = value.parse::<u64>().unwrap_or(0);
        match key.as_str() {
            "deaths" | "totaldeaths" => stats.deaths = stats.deaths.saturating_add(number),
            "strawberries" | "totalstrawberries" | "strawberriescollected" => {
                stats.strawberries = stats.strawberries.saturating_add(number)
            }
            "timeplayed" | "time" => stats.time_played = stats.time_played.saturating_add(number),
            "cassettes" | "cassette" => {
                if value.eq_ignore_ascii_case("true") {
                    stats.cassettes = stats.cassettes.saturating_add(1);
                } else {
                    stats.cassettes = stats.cassettes.saturating_add(number);
                }
            }
            "heartgems" | "hearts" | "heart" => stats.hearts = stats.hearts.saturating_add(number),
            "completed" | "complete" => stats.completed = stats.completed || value.eq_ignore_ascii_case("true"),
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_primary_save_names_are_read() {
        assert!(is_primary_save_file("0.celeste"));
        assert!(is_primary_save_file("debug.celeste"));
        assert!(!is_primary_save_file("0-modsavedata.celeste"));
        assert!(!is_primary_save_file("0-modsave-CollabUtils2.celeste"));
    }

    #[test]
    fn ignores_old_stats_outside_area_stats() {
        let mut stats = MapStats::default();
        accumulate_save_stats(
            r#"<Save><OldStats SID="Map"><AreaModeStats Deaths="99" /></OldStats><AreaStats SID="Map"><AreaModeStats Deaths="3" TimePlayed="20" Completed="true" /></AreaStats></Save>"#,
            &["map".to_string()],
            &mut stats,
        );

        assert_eq!(stats.deaths, 3);
        assert_eq!(stats.time_played, 20);
        assert!(stats.completed);
    }
}
