use super::dependencies::*;
use super::mod_records::*;
use super::official_maps::*;
use super::*;
use crate::domain::{CompletionStatus, Dependency, ModKind, ModMetadata};
use crate::parsers::dialog::read_dialog_titles;
use crate::parsers::map_bin::StrawberryCounts;
use crate::storage::write_json;
use crate::utils::stable_id;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Cursor, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

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
fn classifies_code_mod_with_demo_map_as_other_mod() {
    let map_ids = vec!["bitsbolts/demo".to_string()];

    assert!(!is_map_mod_record(
        "BitsBolts.zip",
        "BitsBolts.zip",
        &metadata("BitsBolts"),
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
            strawberry_ids: HashMap::new(),
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

    write_profile_blacklist(&root, &[], &["mod-id".to_string()], &scan).expect("write blacklist");
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
    let index = DependencyIndex::new(&[helper], HashMap::new());

    let warnings = dependency_warnings_for_test(&[dependency("Helper", "1.2.0")], &index, true).0;

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
    let index = DependencyIndex::new(&[helper], HashMap::new());

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
    let index = DependencyIndex::new(&[helper], HashMap::new());

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
    let index = DependencyIndex::new(&[helper], HashMap::new());

    let warnings =
        dependency_warnings_for_test(&[dependency("Helper Pack", "1.1.0")], &index, true).0;

    assert_eq!(
        warnings,
        vec!["依赖版本可能过低：Helper Pack 需要 1.1.0，本地 1.0.0"]
    );
}

#[test]
fn builtin_dependency_with_unknown_local_version_gets_warning() {
    let index = DependencyIndex::new(&[], builtin_dependency_versions(Path::new("")));

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
    let index = DependencyIndex::new(&[], builtin_dependency_versions(Path::new("")));

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
    let index = DependencyIndex::new(&[], builtin_dependency_versions(&root));

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
    let index = DependencyIndex::new(&[], builtin_dependency_versions(&root));

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
fn unreadable_zip_is_kept_as_visible_warning_record() {
    let root = temp_celeste_root("bad-zip-visible");
    let mods_path = root.join("Mods");
    fs::create_dir_all(&mods_path).expect("mods dir");
    fs::write(mods_path.join("BrokenZip.zip"), b"not a zip").expect("bad zip");
    let cache_file = scan_cache_path(&root);
    let _ = fs::remove_file(&cache_file);

    let scan = full_scan_fresh(&root, empty_profiles(), &[], &[]);

    let _ = fs::remove_file(cache_file);
    let _ = fs::remove_dir_all(root);

    let broken = scan
        .other_mods
        .iter()
        .find(|mod_item| mod_item.file_name == "BrokenZip.zip")
        .expect("broken zip record");
    assert_eq!(broken.name, "BrokenZip");
    assert!(broken.is_archive);
    assert!(broken
        .warnings
        .iter()
        .any(|warning| warning.contains("压缩包无法打开或已损坏")));
}

#[test]
fn zip_with_invalid_everest_yaml_is_kept_with_warning() {
    let root = temp_celeste_root("bad-zip-yaml-visible");
    let mods_path = root.join("Mods");
    fs::create_dir_all(&mods_path).expect("mods dir");
    write_zip_entries(
        &mods_path.join("BadYaml.zip"),
        &[("everest.yaml", "Name: [")],
    );
    let cache_file = scan_cache_path(&root);
    let _ = fs::remove_file(&cache_file);

    let scan = full_scan_fresh(&root, empty_profiles(), &[], &[]);

    let _ = fs::remove_file(cache_file);
    let _ = fs::remove_dir_all(root);

    let bad_yaml = scan
        .other_mods
        .iter()
        .find(|mod_item| mod_item.file_name == "BadYaml.zip")
        .expect("bad yaml record");
    assert_eq!(bad_yaml.name, "BadYaml");
    assert!(bad_yaml
        .warnings
        .iter()
        .any(|warning| warning.contains("everest.yaml 解析失败")));
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

fn write_zip_entries(path: &Path, entries: &[(&str, &str)]) {
    let file = File::create(path).expect("zip file");
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, text) in entries {
        zip.start_file(*name, options).expect("zip entry");
        zip.write_all(text.as_bytes()).expect("write zip entry");
    }
    zip.finish().expect("finish zip");
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
