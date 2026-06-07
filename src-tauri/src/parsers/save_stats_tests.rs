use super::*;
use quick_xml::{
    events::{BytesStart, Event},
    Reader,
};

impl SaveStatsAccumulator {
    fn finish(mut self) -> MapStats {
        let strawberries = self.berry_ids.len() as u64;
        self.stats.strawberries = strawberries;
        self.stats.total_strawberries = strawberries;
        self.stats.strawberries_known = !self.missing_berry_ids;
        self.stats
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
                    && add_berry_id(&event, &area_sid, accumulator)
                {
                    area_mode_berry_ids_seen += 1;
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
                    && add_berry_id(&event, &area_sid, accumulator)
                {
                    area_mode_berry_ids_seen += 1;
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
                if area_depth == Some(depth)
                    || event.name().as_ref().eq_ignore_ascii_case(b"AreaStats")
                {
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

fn event_matches(event: &BytesStart<'_>, needles: &[String]) -> bool {
    let haystack = event_haystack(event);
    needles
        .iter()
        .any(|needle| !needle.is_empty() && haystack.contains(needle))
}

fn add_berry_id(
    event: &BytesStart<'_>,
    _area_sid: &str,
    accumulator: &mut SaveStatsAccumulator,
) -> bool {
    if let Some(key) = attr_value(event, b"Key") {
        accumulator.berry_ids.insert(key);
        true
    } else {
        accumulator.missing_berry_ids = true;
        false
    }
}

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
fn strawberries_are_filtered_to_current_map_ids() {
    let mut accumulator = SaveStatsAccumulator::new();
    accumulate_save_stats(
        r#"<Save><AreaStats SID="Map"><AreaModeStats TotalStrawberries="3"><Strawberries><EntityID Key="a:1" /><EntityID Key="a:2" /><EntityID Key="a:3" /></Strawberries></AreaModeStats></AreaStats></Save>"#,
        &["map".to_string()],
        None,
        &mut accumulator,
    );
    let sub_map = sub_map_with_ids("Map", ["a:1", "a:2"], ["a:1", "a:2"], true);

    let stats = accumulator.finish_for_sub_map(&sub_map);

    assert!(stats.strawberries_known);
    assert_eq!(stats.strawberries, 2);
    assert_eq!(stats.total_strawberries, 2);
    assert_eq!(stats.stale_strawberries, 1);
}

#[test]
fn total_strawberries_include_current_total_only_ids() {
    let mut accumulator = SaveStatsAccumulator::new();
    accumulate_save_stats(
        r#"<Save><AreaStats SID="Map"><AreaModeStats TotalStrawberries="2"><Strawberries><EntityID Key="a:1" /><EntityID Key="a:2" /></Strawberries></AreaModeStats></AreaStats></Save>"#,
        &["map".to_string()],
        None,
        &mut accumulator,
    );
    let sub_map = sub_map_with_ids("Map", ["a:1"], ["a:1", "a:2"], true);

    let stats = accumulator.finish_for_sub_map(&sub_map);

    assert_eq!(stats.strawberries, 1);
    assert_eq!(stats.total_strawberries, 2);
    assert_eq!(stats.stale_strawberries, 0);
}

#[test]
fn incomplete_current_ids_keep_legacy_strawberry_count() {
    let mut accumulator = SaveStatsAccumulator::new();
    accumulate_save_stats(
        r#"<Save><AreaStats SID="Map"><AreaModeStats TotalStrawberries="3"><Strawberries><EntityID Key="a:1" /><EntityID Key="a:2" /><EntityID Key="a:3" /></Strawberries></AreaModeStats></AreaStats></Save>"#,
        &["map".to_string()],
        None,
        &mut accumulator,
    );
    let sub_map = sub_map_with_ids("Map", [], [], false);

    let stats = accumulator.finish_for_sub_map(&sub_map);

    assert_eq!(stats.strawberries, 3);
    assert_eq!(stats.total_strawberries, 3);
    assert_eq!(stats.stale_strawberries, 0);
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
        sub_map("Pack/MapA", CompletionStatus::Completed),
        sub_map("Pack/MapB", CompletionStatus::Unfinished),
        sub_map("Pack/Gym", CompletionStatus::NotApplicable),
    ];

    assert_eq!(
        map_completion_status(&sub_maps),
        CompletionStatus::Unfinished
    );
}

#[test]
fn gyms_do_not_count_against_pack_completion() {
    let sub_maps = vec![
        sub_map("Pack/MapA", CompletionStatus::Completed),
        sub_map("Pack/Gym", CompletionStatus::NotApplicable),
    ];

    assert_eq!(
        map_completion_status(&sub_maps),
        CompletionStatus::Completed
    );
    assert_eq!(
        sub_map_completion_status(&sub_map(
            "StrawberryJam2021/5-Grandmaster/Gym",
            CompletionStatus::Unknown
        )),
        CompletionStatus::NotApplicable
    );
}

#[test]
fn explicit_completion_beats_gym_heuristic() {
    let mut sub_map = sub_map("Pack/Gym", CompletionStatus::Unknown);
    sub_map.stats = Some(MapStats {
        completion_known: true,
        completed: true,
        ..MapStats::default()
    });

    assert_eq!(
        sub_map_completion_status(&sub_map),
        CompletionStatus::Completed
    );
}

fn sub_map(sid: &str, completion_status: CompletionStatus) -> SubMapInfo {
    SubMapInfo {
        id: sid.to_string(),
        sid: sid.to_string(),
        mode_index: None,
        display_name: sid.to_string(),
        chapter: String::new(),
        file_path: format!("Maps/{sid}.bin"),
        difficulty: String::new(),
        strawberry_count: 0,
        strawberry_total_count: 0,
        completion_status,
        stats: None,
        current_visible_strawberry_ids: HashSet::new(),
        current_total_strawberry_ids: HashSet::new(),
        current_strawberry_ids_complete: true,
    }
}

fn sub_map_with_ids<const V: usize, const T: usize>(
    sid: &str,
    visible: [&str; V],
    total: [&str; T],
    complete: bool,
) -> SubMapInfo {
    let mut sub_map = sub_map(sid, CompletionStatus::Unknown);
    sub_map.current_visible_strawberry_ids = visible.into_iter().map(ToString::to_string).collect();
    sub_map.current_total_strawberry_ids = total.into_iter().map(ToString::to_string).collect();
    sub_map.current_strawberry_ids_complete = complete;
    sub_map
}
