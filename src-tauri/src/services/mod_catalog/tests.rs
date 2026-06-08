use super::hash_cache::{file_hash_stamp, InstalledModHashCache, InstalledModHashCacheEntry};
use super::loaders::{
    catalog_client, parse_everest_catalog, parse_wegfan_catalog, CATALOG_CONNECT_TIMEOUT,
    CATALOG_REQUEST_TIMEOUT,
};
use super::*;
use crate::domain::{
    CompletionStatus, GameBananaCatalogStats, ModDownloadPhase, ModDownloadProgress, ModKind,
    ModMetadata,
};
use crate::services::download::DownloadProgressThrottle;
use crate::services::mod_catalog_cache::{
    game_banana_catalog_stats_cache_entry, read_game_banana_catalog_stats_cache,
    read_valid_catalog_cache, write_catalog_cache, write_game_banana_catalog_stats_cache,
};
use crate::storage::{game_banana_catalog_stats_cache_path, mod_catalog_cache_path};
use crate::storage::{read_json, write_json};
use crate::utils::stable_id;
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Write};
use std::net::TcpListener;
use std::sync::atomic::AtomicBool;
use std::sync::{LazyLock, Mutex};
use std::thread;
use zip::write::SimpleFileOptions;

static CATALOG_CACHE_TEST_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[test]
fn http_user_agent_uses_package_version() {
    assert_eq!(
        HTTP_USER_AGENT,
        format!("celepkg/{}", env!("CARGO_PKG_VERSION"))
    );
    assert!(HTTP_USER_AGENT.contains(env!("CARGO_PKG_VERSION")));
}

#[test]
fn catalog_client_builds_with_catalog_timeouts() {
    assert_eq!(CATALOG_CONNECT_TIMEOUT, Duration::from_secs(10));
    assert_eq!(CATALOG_REQUEST_TIMEOUT, Duration::from_secs(60));
    catalog_client().expect("catalog client should build");
}

#[test]
fn download_client_keeps_download_timeouts() {
    assert_eq!(DOWNLOAD_CONNECT_TIMEOUT, Duration::from_secs(10));
    assert_eq!(DOWNLOAD_REQUEST_TIMEOUT, Duration::from_secs(300));
    download_client().expect("download client should build");
}

#[test]
fn parses_everest_catalog_entries() {
    let text = r#"
Helper:
  GameBananaType: Mod
  Version: 1.2.3
  LastUpdate: 1700000000
  Size: 42
  GameBananaId: 123
  GameBananaFileId: 456
  xxHash:
  - ABCDEF0123456789
  URL: https://gamebanana.com/mmdl/456
"#;
    let entries = parse_everest_catalog(text, ModCatalogSourceKind::EverestMirror).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "Helper");
    assert_eq!(entries[0].version, "1.2.3");
    assert_eq!(entries[0].download_url, "https://gamebanana.com/mmdl/456");
    assert_eq!(entries[0].xx_hash, vec!["abcdef0123456789"]);
    assert_eq!(entries[0].game_banana_file_id, Some(456));
}

#[test]
fn parses_wegfan_catalog_entries() {
    let text = r#"{
      "data": [{
        "id": "file-1",
        "name": "Fallback",
        "version": "2.0.0",
        "xxHash": ["001122"],
        "submissionFile": {
          "url": "https://example.test/file.zip",
          "size": 99,
          "gameBananaId": 777,
          "submission": {
            "name": "Pretty Name",
            "pageUrl": "https://gamebanana.com/mods/555",
            "gameBananaSection": "Map",
            "gameBananaId": 555,
            "categoryName": "Maps",
            "subCategoryName": "Standalone",
            "latestUpdateAddedTime": "2024-04-11T22:16:10Z"
          }
        }
      }]
    }"#;
    let entries = parse_wegfan_catalog(text).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].source, ModCatalogSourceKind::Wegfan);
    assert_eq!(entries[0].name, "Pretty Name");
    assert_eq!(entries[0].download_url, "https://example.test/file.zip");
    assert_eq!(entries[0].game_banana_type, "Map");
    assert_eq!(entries[0].category_name, "Maps");
    assert_eq!(entries[0].sub_category_name, "Standalone");
    assert_eq!(entries[0].last_update, Some(1712873770));
}

#[test]
fn parses_game_banana_catalog_stats_response() {
    let stats = parse_game_banana_catalog_stats_response(504505, "[4263,5]").unwrap();

    assert_eq!(stats.game_banana_id, 504505);
    assert_eq!(stats.view_count, 4263);
    assert_eq!(stats.like_count, 5);
    assert!(
        parse_game_banana_catalog_stats_response(504505, r#"{"error":"missing"}"#)
            .unwrap_err()
            .contains("响应不是数组")
    );
}

#[test]
fn game_banana_catalog_stats_ids_are_deduped_and_sorted() {
    assert_eq!(
        normalize_game_banana_ids(&[30, 0, 10, 30, 20]),
        vec![10, 20, 30]
    );
}

#[test]
fn valid_catalog_cache_round_trips_entries() {
    let _guard = CATALOG_CACHE_TEST_LOCK.lock().unwrap();
    let entry = test_catalog_entry("helper", "Helper");
    let cache_path = mod_catalog_cache_path(ModCatalogSourceKind::Wegfan);
    let previous = fs::read(&cache_path).ok();

    write_catalog_cache(ModCatalogSourceKind::Wegfan, std::slice::from_ref(&entry));
    let cached = read_valid_catalog_cache(ModCatalogSourceKind::Wegfan).expect("valid cache");

    assert_eq!(cached.entries.len(), 1);
    assert_eq!(cached.entries[0].name, "Helper");

    if let Some(previous) = previous {
        fs::write(cache_path, previous).expect("restore previous catalog cache");
    } else {
        let _ = fs::remove_file(cache_path);
    }
}

#[test]
fn game_banana_catalog_stats_cache_round_trips_entries() {
    let _guard = CATALOG_CACHE_TEST_LOCK.lock().unwrap();
    let cache_path = game_banana_catalog_stats_cache_path();
    let previous = fs::read(&cache_path).ok();
    let mut entries = HashMap::new();
    entries.insert(
        504505,
        game_banana_catalog_stats_cache_entry(GameBananaCatalogStats {
            game_banana_id: 504505,
            view_count: 4263,
            like_count: 5,
        }),
    );

    write_game_banana_catalog_stats_cache(&entries);
    let cached = read_game_banana_catalog_stats_cache();

    if let Some(previous) = previous {
        fs::write(cache_path, previous).expect("restore previous stats cache");
    } else {
        let _ = fs::remove_file(cache_path);
    }

    assert_eq!(cached[&504505].stats.view_count, 4263);
    assert_eq!(cached[&504505].stats.like_count, 5);
}

#[test]
fn resolves_catalog_dependencies_from_loaded_catalog_once() {
    let _guard = CATALOG_CACHE_TEST_LOCK.lock().unwrap();
    let cache_path = mod_catalog_cache_path(ModCatalogSourceKind::Wegfan);
    let previous = fs::read(&cache_path).ok();
    let mut helper = test_catalog_entry("helper", "Helper");
    helper.version = "2.0.0".to_string();
    helper.download_url = "https://example.test/helper.zip".to_string();
    let mut old_helper = test_catalog_entry("old-helper", "OldHelper");
    old_helper.version = "1.0.0".to_string();
    old_helper.download_url = "https://example.test/old.zip".to_string();
    let mut no_download = test_catalog_entry("no-download", "NoDownload");
    no_download.version = "9.0.0".to_string();
    write_catalog_cache(
        ModCatalogSourceKind::Wegfan,
        &[old_helper, helper, no_download],
    );

    let result = resolve_catalog_dependencies(
        &[
            Dependency {
                name: "Helper".to_string(),
                version: "1.5.0".to_string(),
            },
            Dependency {
                name: "OldHelper".to_string(),
                version: "2.0.0".to_string(),
            },
            Dependency {
                name: "NoDownload".to_string(),
                version: "1.0.0".to_string(),
            },
        ],
        &[ModCatalogSourceKind::Wegfan],
    );

    if let Some(previous) = previous {
        fs::write(cache_path, previous).expect("restore previous catalog cache");
    } else {
        let _ = fs::remove_file(cache_path);
    }

    assert_eq!(result.sources, vec![ModCatalogSourceKind::Wegfan]);
    assert_eq!(result.resolutions.len(), 3);
    assert_eq!(
        result.resolutions[0]
            .entry
            .as_ref()
            .map(|entry| entry.id.as_str()),
        Some("helper")
    );
    assert!(result.resolutions[1].entry.is_none());
    assert!(result.resolutions[2].entry.is_none());
}

#[test]
fn catalog_query_ignores_version_type_and_page_url_for_plain_terms() {
    let mut entry = test_catalog_entry("helper", "Visible Name");
    entry.version = "1.2.3".to_string();
    entry.game_banana_type = "Map".to_string();
    entry.page_url = "https://gamebanana.com/mods/555/only-page-hit".to_string();

    assert!(!catalog_entry_matches_query(&entry, "1.2.3"));
    assert!(!catalog_entry_matches_query(&entry, "map"));
    assert!(!catalog_entry_matches_query(&entry, "only-page-hit"));
}

#[test]
fn catalog_query_matches_name_and_id() {
    let entry = test_catalog_entry("hidden-helper", "Visible Name");

    assert!(catalog_entry_matches_query(&entry, "visible"));
    assert!(catalog_entry_matches_query(&entry, "hidden helper"));
}

#[test]
fn catalog_url_query_matches_page_url() {
    let mut entry = test_catalog_entry("helper", "Helper");
    entry.page_url = "https://gamebanana.com/mods/555".to_string();

    assert!(catalog_entry_matches_query(
        &entry,
        "https://gamebanana.com/mods/555"
    ));
    assert!(catalog_entry_matches_query(&entry, "gamebanana.com"));
}

#[test]
fn catalog_sorting_keeps_more_than_legacy_limit() {
    let mut entries = (0..250)
        .rev()
        .map(|index| test_catalog_entry(&format!("entry-{index:03}"), &format!("Entry {index:03}")))
        .collect::<Vec<_>>();

    sort_catalog_entries(&mut entries);

    assert_eq!(entries.len(), 250);
    assert_eq!(entries[0].name, "Entry 000");
    assert_eq!(entries[249].name, "Entry 249");
}

#[test]
fn update_check_uses_xxhash_not_version() {
    let dir = tempfile::tempdir().unwrap();
    let mod_path = dir.path().join("Helper.zip");
    fs::write(&mod_path, b"local zip bytes").unwrap();
    let local_hash = xxh64_file(&mod_path).unwrap();
    let mut record = test_record(&mod_path, "Helper", "1.0.0");
    record.metadata.version = "999.0.0".to_string();
    let entry = ModCatalogEntry {
        source: ModCatalogSourceKind::EverestMirror,
        id: "helper".to_string(),
        name: "Helper".to_string(),
        version: "1.0.0".to_string(),
        download_url: "https://example.test/helper.zip".to_string(),
        page_url: String::new(),
        game_banana_type: "Mod".to_string(),
        category_name: String::new(),
        sub_category_name: String::new(),
        game_banana_id: None,
        game_banana_file_id: None,
        size: None,
        last_update: None,
        xx_hash: vec![local_hash],
    };
    let installed = InstalledModIndex::new(&[record]);
    let matched = installed.find(&entry).unwrap();
    assert_eq!(matched.name, "Helper");
}

#[test]
fn update_check_matches_filename_variants() {
    let dir = tempfile::tempdir().unwrap();
    let mod_path = dir.path().join("Fancy-Helper.zip");
    fs::write(&mod_path, b"local zip bytes").unwrap();
    let record = test_record(&mod_path, "", "1.0.0");
    let entry = ModCatalogEntry {
        source: ModCatalogSourceKind::EverestMirror,
        id: "helper".to_string(),
        name: "Fancy Helper".to_string(),
        version: "2.0.0".to_string(),
        download_url: String::new(),
        page_url: String::new(),
        game_banana_type: "Mod".to_string(),
        category_name: String::new(),
        sub_category_name: String::new(),
        game_banana_id: None,
        game_banana_file_id: None,
        size: None,
        last_update: None,
        xx_hash: vec!["different".to_string()],
    };
    let installed = InstalledModIndex::new(&[record]);
    assert!(installed.find(&entry).is_some());
}

#[test]
fn installed_mod_index_uses_cached_hash_when_file_stamp_matches() {
    let dir = tempfile::tempdir().unwrap();
    let mod_path = dir.path().join("CachedHelper.zip");
    fs::write(&mod_path, b"cached zip bytes").unwrap();
    let cache_path = dir.path().join("hash-cache.json");
    let record = test_record(&mod_path, "CachedHelper", "1.0.0");
    let cache_key = record.absolute_path.clone();
    let stamp = file_hash_stamp(&mod_path).unwrap();
    let cached_hash = "0123456789abcdef".to_string();
    let mut cache = InstalledModHashCache::current();
    cache.entries.insert(
        cache_key,
        InstalledModHashCacheEntry {
            len: stamp.len,
            modified: stamp.modified,
            hash: cached_hash.clone(),
        },
    );
    write_json(&cache_path, &cache).unwrap();

    let entry = test_catalog_entry("cached-helper", "CachedHelper");
    let installed = InstalledModIndex::new_with_cache_path(&[record], &cache_path);
    let matched = installed.find(&entry).unwrap();

    assert_eq!(matched.hash, cached_hash);
}

#[test]
fn installed_mod_index_rehashes_when_cached_file_stamp_changes() {
    let dir = tempfile::tempdir().unwrap();
    let mod_path = dir.path().join("ChangedHelper.zip");
    fs::write(&mod_path, b"changed zip bytes").unwrap();
    let cache_path = dir.path().join("hash-cache.json");
    let record = test_record(&mod_path, "ChangedHelper", "1.0.0");
    let cache_key = record.absolute_path.clone();
    let stamp = file_hash_stamp(&mod_path).unwrap();
    let mut cache = InstalledModHashCache::current();
    cache.entries.insert(
        cache_key.clone(),
        InstalledModHashCacheEntry {
            len: stamp.len + 1,
            modified: stamp.modified,
            hash: "stale".to_string(),
        },
    );
    write_json(&cache_path, &cache).unwrap();

    let entry = test_catalog_entry("changed-helper", "ChangedHelper");
    let actual_hash = xxh64_file(&mod_path).unwrap();
    let installed = InstalledModIndex::new_with_cache_path(&[record], &cache_path);
    let matched = installed.find(&entry).unwrap();
    let written_cache = read_json::<InstalledModHashCache>(&cache_path).unwrap();

    assert_eq!(matched.hash, actual_hash);
    assert_eq!(written_cache.entries[&cache_key].hash, actual_hash);
    assert_eq!(written_cache.entries[&cache_key].len, stamp.len);
}

#[test]
fn game_banana_downloads_expand_to_known_mirrors() {
    let urls = mirror_urls("https://gamebanana.com/mmdl/12345");
    assert_eq!(urls[0], "https://gamebanana.com/mmdl/12345");
    assert!(urls
        .contains(&"https://celeste.weg.fan/api/v2/download/gamebanana-files/12345".to_string()));
    assert!(urls.contains(&"https://banana-mirror-mods.celestemods.com/12345.zip".to_string()));
    assert!(urls.contains(&"https://celestemodupdater.0x0a.de/banana-mirror/12345.zip".to_string()));
}

#[test]
fn fresh_install_path_sanitizes_file_name_and_rejects_existing_zip() {
    let dir = tempfile::tempdir().unwrap();
    let entry = test_catalog_entry("entry", "Bad:/Name?");
    let path = fresh_install_path(dir.path(), &entry).unwrap();
    assert_eq!(
        path.file_name().unwrap().to_string_lossy(),
        "Bad__Name_.zip"
    );
    fs::write(&path, b"already here").unwrap();
    assert!(fresh_install_path(dir.path(), &entry).is_err());
}

#[test]
fn staging_download_path_lives_outside_mods_and_uses_operation_id() {
    let dir = tempfile::tempdir().unwrap();
    let entry = test_catalog_entry("helper", "Helper");

    let first = staging_download_path(dir.path(), &entry, "install-1");
    let second = staging_download_path(dir.path(), &entry, "install-2");

    assert!(first.starts_with(
        dir.path()
            .join(".celepkg")
            .join("downloads")
            .join("staging")
    ));
    assert_ne!(first, second);
    assert!(!first.starts_with(dir.path().join("Mods")));
    assert_eq!(first.extension().unwrap().to_string_lossy(), "download");
}

#[test]
fn fresh_install_moves_staged_zip_into_destination() {
    let dir = tempfile::tempdir().unwrap();
    let staged = dir
        .path()
        .join(".celepkg")
        .join("downloads")
        .join("staging")
        .join("Helper.zip.download");
    fs::create_dir_all(staged.parent().unwrap()).unwrap();
    fs::write(&staged, b"new zip").unwrap();
    let destination = dir.path().join("Mods").join("Helper.zip");
    fs::create_dir_all(destination.parent().unwrap()).unwrap();

    let replaced = install_downloaded_zip(&staged, &destination, false).unwrap();

    assert!(replaced.is_none());
    assert!(!staged.exists());
    assert_eq!(fs::read(&destination).unwrap(), b"new zip");
}

#[test]
fn staged_download_path_rejects_path_traversal_ids() {
    let dir = tempfile::tempdir().unwrap();

    let error =
        resolve_staged_download_path(dir.path(), "../0123456789abcdef.zip.download").unwrap_err();

    assert_eq!(error, "无效的 staging id");
}

#[test]
fn staged_download_path_accepts_missing_file_inside_staging_dir() {
    let dir = tempfile::tempdir().unwrap();
    let staged = dir
        .path()
        .join(".celepkg")
        .join("downloads")
        .join("staging")
        .join("0123456789abcdef.zip.download");

    let resolved =
        resolve_staged_download_path(dir.path(), staged.file_name().unwrap().to_str().unwrap())
            .unwrap();

    assert_eq!(resolved, staged);
}

#[test]
fn staged_download_path_rejects_non_staging_id() {
    let dir = tempfile::tempdir().unwrap();

    let error = resolve_staged_download_path(dir.path(), "Helper.zip.download").unwrap_err();

    assert_eq!(error, "无效的 staging id");
}

#[test]
fn delete_staged_download_removes_only_valid_staging_file() {
    let dir = tempfile::tempdir().unwrap();
    let staged_id = "0123456789abcdef.zip.download";
    let staged = dir
        .path()
        .join(".celepkg")
        .join("downloads")
        .join("staging")
        .join(staged_id);
    fs::create_dir_all(staged.parent().unwrap()).unwrap();
    fs::write(&staged, b"staged").unwrap();

    assert!(delete_staged_download(dir.path(), staged_id).unwrap());
    assert!(!staged.exists());
    assert!(!delete_staged_download(dir.path(), staged_id).unwrap());
    assert!(delete_staged_download(dir.path(), "../0123456789abcdef.zip.download").is_err());
}

#[test]
fn read_zip_metadata_requires_valid_everest_yaml() {
    let dir = tempfile::tempdir().unwrap();
    let valid = dir.path().join("Valid.zip");
    write_zip(
        &valid,
        &[("everest.yaml", "Name: Helper\nVersion: 1.2.3\n")],
    );

    let metadata = read_zip_metadata(&valid).unwrap();

    assert_eq!(metadata.name, "Helper");
    assert_eq!(metadata.version, "1.2.3");

    let missing_yaml = dir.path().join("MissingYaml.zip");
    write_zip(&missing_yaml, &[("readme.txt", "hello")]);
    assert!(read_zip_metadata(&missing_yaml)
        .unwrap_err()
        .contains("缺少 everest.yaml"));

    let bad_yaml = dir.path().join("BadYaml.zip");
    write_zip(&bad_yaml, &[("everest.yaml", "Name: [")]);
    assert!(read_zip_metadata(&bad_yaml)
        .unwrap_err()
        .contains("解析 everest.yaml 失败"));

    let not_zip = dir.path().join("NotZip.zip");
    fs::write(&not_zip, b"not a zip").unwrap();
    assert!(read_zip_metadata(&not_zip)
        .unwrap_err()
        .contains("读取 Mod 压缩包失败"));
}

#[test]
fn reads_metadata_from_valid_staged_download() {
    let dir = tempfile::tempdir().unwrap();
    let entry = test_catalog_entry("helper", "Helper");
    let staged_path = staging_download_path(dir.path(), &entry, "metadata-read");
    fs::create_dir_all(staged_path.parent().unwrap()).unwrap();
    write_zip(
        &staged_path,
        &[("everest.yaml", "Name: Helper\nVersion: 1.2.3\n")],
    );
    let staged_id = staged_id_from_path(&staged_path).unwrap();

    let metadata = read_staged_metadata(dir.path(), &staged_id).unwrap();

    assert_eq!(metadata.name, "Helper");
    assert_eq!(metadata.version, "1.2.3");
    assert_eq!(
        read_staged_metadata(dir.path(), "../Helper.zip").unwrap_err(),
        "无效的 staging id"
    );
}

#[test]
fn read_zip_metadata_accepts_bom_prefixed_everest_list() {
    let dir = tempfile::tempdir().unwrap();
    let zip = dir.path().join("BomList.zip");
    write_zip(
        &zip,
        &[(
            "everest.yaml",
            "\u{feff}- Name: ExtendedCameraDynamics\r\n  Version: 1.2.0\r\n",
        )],
    );

    let metadata = read_zip_metadata(&zip).unwrap();

    assert_eq!(metadata.name, "ExtendedCameraDynamics");
    assert_eq!(metadata.version, "1.2.0");
}

#[test]
fn full_zip_read_detects_corrupt_non_metadata_entries() {
    let dir = tempfile::tempdir().unwrap();
    let valid = dir.path().join("Valid.zip");
    write_zip(
        &valid,
        &[
            ("everest.yaml", "Name: Helper\nVersion: 1.2.3\n"),
            ("payload.txt", "unchanged payload"),
        ],
    );
    let corrupt = dir.path().join("Corrupt.zip");
    fs::copy(&valid, &corrupt).unwrap();
    corrupt_zip_payload(&corrupt, b"unchanged payload", b"changed!! payload");

    let metadata = read_zip_metadata(&corrupt).unwrap();
    assert_eq!(metadata.name, "Helper");
    assert!(validate_zip_full_read(&corrupt).is_err());
}

#[test]
fn download_url_to_file_stops_before_request_when_cancelled() {
    let dir = tempfile::tempdir().unwrap();
    let entry = test_catalog_entry("helper", "Helper");
    let client = reqwest::blocking::Client::new();
    let cancel = AtomicBool::new(true);

    let error = download_url_to_file(
        &client,
        "http://127.0.0.1:1/never-requested.zip",
        &dir.path().join("Helper.zip.download"),
        &entry.name,
        entry.size,
        ModDownloadReporter {
            operation_id: "cancel-test",
            progress: None,
            cancel_token: Some(&cancel),
            task_index: 1,
            task_total: 3,
        },
    )
    .unwrap_err();

    assert_eq!(error, "下载已取消");
}

#[test]
fn download_url_to_file_emits_progress_during_local_slow_download() {
    let dir = tempfile::tempdir().unwrap();
    let mut entry = test_catalog_entry("helper", "Helper");
    let payload = zip_bytes(&[
        ("everest.yaml", "Name: Helper\nVersion: 1.2.3\n"),
        ("payload.bin", &"x".repeat(256 * 1024)),
    ]);
    entry.size = Some(payload.len() as u64);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/Helper.zip", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0u8; 1024];
        let _ = std::io::Read::read(&mut stream, &mut request);
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/zip\r\n\r\n",
            payload.len()
        )
        .unwrap();
        for chunk in payload.chunks(16 * 1024) {
            stream.write_all(chunk).unwrap();
            stream.flush().unwrap();
            thread::sleep(Duration::from_millis(15));
        }
    });
    let events = Mutex::new(Vec::new());
    let emit = |progress: ModDownloadProgress| events.lock().unwrap().push(progress);

    download_url_to_file(
        &reqwest::blocking::Client::new(),
        &url,
        &dir.path().join("Helper.zip.download"),
        &entry.name,
        entry.size,
        ModDownloadReporter {
            operation_id: "local-progress",
            progress: Some(&emit),
            cancel_token: None,
            task_index: 1,
            task_total: 1,
        },
    )
    .unwrap();
    server.join().unwrap();

    let events = events.lock().unwrap();
    let downloading_events = events
        .iter()
        .filter(|event| event.phase == ModDownloadPhase::Downloading && event.downloaded > 0)
        .collect::<Vec<_>>();
    assert!(downloading_events.len() > 3);
    assert!(downloading_events
        .windows(2)
        .all(|pair| pair[0].downloaded <= pair[1].downloaded));
    assert_eq!(
        downloading_events.last().unwrap().downloaded,
        entry.size.unwrap()
    );
}

#[test]
fn download_entry_cleans_staging_file_when_cancelled_between_mirrors() {
    let dir = tempfile::tempdir().unwrap();
    let mut entry = test_catalog_entry("helper", "Helper");
    entry.download_url = "https://gamebanana.com/mmdl/12345".to_string();
    let operation_id = "cancel-cleanup";
    let staged = staging_download_path(dir.path(), &entry, operation_id);
    fs::create_dir_all(staged.parent().unwrap()).unwrap();
    fs::write(&staged, b"partial").unwrap();
    let cancel = AtomicBool::new(true);

    let error = download_entry(
        dir.path(),
        &entry,
        ModDownloadReporter {
            operation_id,
            progress: None,
            cancel_token: Some(&cancel),
            task_index: 1,
            task_total: 1,
        },
    )
    .unwrap_err();

    assert_eq!(error, "下载已取消");
    assert!(!staged.exists());
}

#[test]
fn progress_event_includes_speed_and_task_position() {
    let events = Mutex::new(Vec::new());
    let emit = |progress: ModDownloadProgress| events.lock().unwrap().push(progress);

    emit_download_progress(
        ModDownloadReporter {
            operation_id: "progress-test",
            progress: Some(&emit),
            cancel_token: None,
            task_index: 2,
            task_total: 4,
        },
        "Helper",
        ModDownloadPhase::Downloading,
        512,
        Some(1024),
        2048.0,
        "https://example.test/helper.zip",
    );

    let events = events.lock().unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].speed_bytes_per_sec, 2048.0);
    assert_eq!(events[0].task_index, 2);
    assert_eq!(events[0].task_total, 4);
}

#[test]
fn progress_throttle_emits_when_percent_changes() {
    let mut throttle = DownloadProgressThrottle::new(Some(1000));

    assert!(throttle.should_emit(1));
    assert!(!throttle.should_emit(5));
    assert!(throttle.should_emit(10));
    assert!(throttle.should_emit(20));
}

#[test]
fn replacing_zip_installs_new_file_and_cleans_backup() {
    let dir = tempfile::tempdir().unwrap();
    let destination = dir.path().join("Helper.zip");
    let staged = dir.path().join("Helper.zip.download");
    fs::write(&destination, b"old").unwrap();
    fs::write(&staged, b"new").unwrap();

    let replaced = install_downloaded_zip(&staged, &destination, true).unwrap();

    assert_eq!(replaced.as_deref(), Some(destination.as_path()));
    assert_eq!(fs::read(&destination).unwrap(), b"new");
    assert!(!staged.exists());
    assert!(!replacement_backup_path(&destination).exists());
}

#[test]
fn replacing_zip_restores_old_file_when_new_file_move_fails() {
    let dir = tempfile::tempdir().unwrap();
    let destination = dir.path().join("Helper.zip");
    fs::write(&destination, b"old").unwrap();
    let missing_temp = dir.path().join("missing.zip");
    let error = install_downloaded_zip(&missing_temp, &destination, true).unwrap_err();
    assert!(error.contains("旧文件已恢复"));
    assert_eq!(fs::read(&destination).unwrap(), b"old");
}

fn test_catalog_entry(id: &str, name: &str) -> ModCatalogEntry {
    ModCatalogEntry {
        source: ModCatalogSourceKind::Wegfan,
        id: id.to_string(),
        name: name.to_string(),
        version: String::new(),
        download_url: String::new(),
        page_url: String::new(),
        game_banana_type: String::new(),
        category_name: String::new(),
        sub_category_name: String::new(),
        game_banana_id: None,
        game_banana_file_id: None,
        size: None,
        last_update: None,
        xx_hash: vec![],
    }
}

fn catalog_entry_matches_query(entry: &ModCatalogEntry, query: &str) -> bool {
    entry_matches_query(
        entry,
        &normalize_dependency_name(query),
        query_looks_like_url_or_domain(query),
    )
}

fn write_zip(path: &Path, entries: &[(&str, &str)]) {
    let file = File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, text) in entries {
        zip.start_file(*name, options).unwrap();
        zip.write_all(text.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
}

fn zip_bytes(entries: &[(&str, &str)]) -> Vec<u8> {
    let cursor = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(cursor);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, text) in entries {
        zip.start_file(*name, options).unwrap();
        zip.write_all(text.as_bytes()).unwrap();
    }
    zip.finish().unwrap().into_inner()
}

fn corrupt_zip_payload(path: &Path, needle: &[u8], replacement: &[u8]) {
    assert_eq!(needle.len(), replacement.len());
    let mut bytes = fs::read(path).unwrap();
    let offset = bytes
        .windows(needle.len())
        .position(|window| window == needle)
        .expect("payload should be stored in test zip");
    bytes[offset..offset + replacement.len()].copy_from_slice(replacement);
    fs::write(path, bytes).unwrap();
}

fn test_record(path: &Path, metadata_name: &str, version: &str) -> ModRecord {
    let file_name = path.file_name().unwrap().to_string_lossy().to_string();
    ModRecord {
        id: stable_id(&file_name),
        name: if metadata_name.is_empty() {
            file_name.trim_end_matches(".zip").replace('-', " ")
        } else {
            metadata_name.to_string()
        },
        file_name: file_name.clone(),
        relative_path: file_name,
        absolute_path: path.to_string_lossy().to_string(),
        is_archive: true,
        kind: ModKind::Mod,
        enabled: true,
        favorite: false,
        protected: false,
        read_only: false,
        metadata: ModMetadata {
            name: metadata_name.to_string(),
            version: version.to_string(),
            ..ModMetadata::default()
        },
        map_ids: vec![],
        sub_maps: vec![],
        map_count: 0,
        strawberry_count: 0,
        strawberry_total_count: 0,
        completion_status: CompletionStatus::Unknown,
        dependencies: vec![],
        optional_dependencies: vec![],
        stats: None,
        warnings: vec![],
    }
}
