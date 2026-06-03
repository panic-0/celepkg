use crate::domain::{
    InstalledModMatch, ModCatalogEntry, ModCatalogSearchResult, ModCatalogSourceKind,
    ModDownloadProgress, ModInstallResult, ModMetadata, ModRecord, ModUpdateCandidate,
    ModUpdateCheckResult, ProfilesState,
};
use crate::utils::{normalize_dependency_name, normalize_slash, stable_id};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use xxhash_rust::xxh64::Xxh64;
use zip::ZipArchive;

const EVEREST_MIRROR_UPDATE_URL: &str =
    "https://everestapi.github.io/updatermirror/everest_update.yaml";
const EVEREST_UPDATE_POINTER_URL: &str = "https://everestapi.github.io/modupdater.txt";
const WEGFAN_MOD_LIST_URL: &str = "https://celeste.weg.fan/api/v2/mod/list";

#[derive(Clone, Copy)]
pub struct ModDownloadReporter<'a> {
    pub operation_id: &'a str,
    pub progress: Option<&'a (dyn Fn(ModDownloadProgress) + Send + Sync)>,
}

pub fn parse_sources(sources: &[String]) -> Vec<ModCatalogSourceKind> {
    if sources.is_empty() {
        return vec![
            ModCatalogSourceKind::EverestMirror,
            ModCatalogSourceKind::Wegfan,
        ];
    }
    let mut parsed = vec![];
    for source in sources {
        let kind = match source.trim().to_ascii_lowercase().as_str() {
            "everest" | "official" => Some(ModCatalogSourceKind::Everest),
            "everestmirror" | "everest-mirror" | "mirror" => {
                Some(ModCatalogSourceKind::EverestMirror)
            }
            "wegfan" | "weg-fan" => Some(ModCatalogSourceKind::Wegfan),
            _ => None,
        };
        if let Some(kind) = kind {
            if !parsed.contains(&kind) {
                parsed.push(kind);
            }
        }
    }
    parsed
}

pub fn search_catalog(query: &str, sources: &[ModCatalogSourceKind]) -> ModCatalogSearchResult {
    let load = load_catalogs(sources);
    let normalized_query = normalize_dependency_name(query);
    let mut entries = load.entries;
    if !normalized_query.is_empty() {
        entries.retain(|entry| entry_matches_query(entry, &normalized_query));
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    entries.truncate(200);
    ModCatalogSearchResult {
        sources: load.sources,
        entries,
        warnings: load.warnings,
    }
}

pub fn check_updates(
    records: &[ModRecord],
    sources: &[ModCatalogSourceKind],
) -> ModUpdateCheckResult {
    let load = load_catalogs(sources);
    let installed = InstalledModIndex::new(records);
    let mut matched = vec![];
    let mut seen_installed_paths = HashSet::new();

    for entry in load.entries {
        let Some(installed_match) = installed.find(&entry) else {
            continue;
        };
        if !seen_installed_paths.insert(installed_match.absolute_path.clone()) {
            continue;
        }
        let local_hash = installed_match.hash.to_ascii_lowercase();
        let update_available = !entry.xx_hash.is_empty()
            && !entry
                .xx_hash
                .iter()
                .any(|hash| hash.eq_ignore_ascii_case(&local_hash));
        let reason = if update_available {
            format!("本地文件哈希 {local_hash} 不在目录记录的最新哈希中")
        } else {
            "本地文件哈希已在目录记录中".to_string()
        };
        matched.push(ModUpdateCandidate {
            entry,
            installed: installed_match,
            update_available,
            reason,
        });
    }

    matched.sort_by(|a, b| {
        a.entry
            .name
            .to_lowercase()
            .cmp(&b.entry.name.to_lowercase())
    });
    let updates = matched
        .iter()
        .filter(|candidate| candidate.update_available)
        .cloned()
        .collect();

    ModUpdateCheckResult {
        sources: load.sources,
        updates,
        matched,
        warnings: load.warnings,
    }
}

pub fn xxh64_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("打开文件失败：{error}"))?;
    let mut hasher = Xxh64::new(0);
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("读取文件失败：{error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:016x}", hasher.digest()))
}

pub fn preview_update_metadata(
    celeste_path: &Path,
    entry: &ModCatalogEntry,
) -> Result<ModMetadata, String> {
    let (temp_path, _) = download_entry(
        celeste_path,
        entry,
        ModDownloadReporter {
            operation_id: "",
            progress: None,
        },
    )?;
    let metadata = read_zip_metadata(&temp_path);
    let _ = fs::remove_file(&temp_path);
    metadata
}

pub fn download_and_install(
    celeste_path: &Path,
    entry: ModCatalogEntry,
    replace_path: Option<&Path>,
    profiles: ProfilesState,
    protected_record_ids: &[String],
    selected_save_files: &[String],
    reporter: ModDownloadReporter<'_>,
) -> Result<ModInstallResult, String> {
    let mods_dir = celeste_path.join("Mods");
    fs::create_dir_all(&mods_dir).map_err(|error| format!("创建 Mods 目录失败：{error}"))?;
    let destination = match replace_path {
        Some(path) => normalize_replace_path(&mods_dir, path)?,
        None => fresh_install_path(&mods_dir, &entry)?,
    };
    let (temp_path, hash) = download_entry(celeste_path, &entry, reporter)?;
    emit_download_progress(reporter, &entry.name, "installing", 0, None, "");

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建安装目录失败：{error}"))?;
    }
    let replaced_path = install_downloaded_zip(&temp_path, &destination, replace_path.is_some())?;
    let mut timings = vec![];
    let scan = crate::services::scan::full_scan(
        celeste_path,
        profiles,
        crate::services::scan::list_available_save_files(celeste_path),
        selected_save_files.to_vec(),
        &mut timings,
    );
    let mut scan = scan;
    for record in scan.maps.iter_mut().chain(scan.other_mods.iter_mut()) {
        record.protected = record.read_only || protected_record_ids.contains(&record.id);
    }
    crate::services::scan::write_scan_cache(celeste_path, &scan);
    emit_download_progress(reporter, &entry.name, "done", 1, Some(1), "");
    Ok(ModInstallResult {
        entry,
        destination_path: destination.to_string_lossy().to_string(),
        replaced_path: replaced_path.map(|path| path.to_string_lossy().to_string()),
        hash,
        scan,
    })
}

fn download_entry(
    celeste_path: &Path,
    entry: &ModCatalogEntry,
    reporter: ModDownloadReporter<'_>,
) -> Result<(PathBuf, String), String> {
    if entry.download_url.trim().is_empty() {
        return Err("目录条目没有下载地址".to_string());
    }
    let temp_path = staging_download_path(celeste_path, entry, reporter.operation_id);
    if let Some(download_dir) = temp_path.parent() {
        fs::create_dir_all(download_dir).map_err(|error| format!("创建下载目录失败：{error}"))?;
    }
    let client = reqwest::blocking::Client::builder()
        .user_agent("celepkg/0.2")
        .build()
        .map_err(|error| format!("初始化下载客户端失败：{error}"))?;
    let mut last_error = None;
    for url in mirror_urls(&entry.download_url) {
        let _ = fs::remove_file(&temp_path);
        match download_url_to_file(&client, &url, &temp_path, entry, reporter) {
            Ok(()) => {
                emit_download_progress(reporter, &entry.name, "verifying", 0, None, &url);
                let hash = xxh64_file(&temp_path)?;
                if entry.xx_hash.is_empty()
                    || entry
                        .xx_hash
                        .iter()
                        .any(|expected| expected.eq_ignore_ascii_case(&hash))
                {
                    return Ok((temp_path, hash));
                }
                last_error = Some(format!(
                    "{url}: 校验失败，目录记录为 {}，实际为 {hash}",
                    entry.xx_hash.join("、")
                ));
            }
            Err(error) => {
                last_error = Some(format!("{url}: {error}"));
            }
        }
    }
    let _ = fs::remove_file(&temp_path);
    Err(format!(
        "下载 Mod 失败：{}",
        last_error.unwrap_or_else(|| "没有可用下载地址".to_string())
    ))
}

fn staging_download_path(
    celeste_path: &Path,
    entry: &ModCatalogEntry,
    operation_id: &str,
) -> PathBuf {
    let key = if operation_id.trim().is_empty() {
        entry.id.clone()
    } else {
        format!("{}-{operation_id}", entry.id)
    };
    celeste_path
        .join(".celepkg")
        .join("downloads")
        .join("staging")
        .join(format!("{}.zip.download", stable_id(&key)))
}

fn download_url_to_file(
    client: &reqwest::blocking::Client,
    url: &str,
    destination: &Path,
    entry: &ModCatalogEntry,
    reporter: ModDownloadReporter<'_>,
) -> Result<(), String> {
    let mut response = client
        .get(url)
        .send()
        .map_err(|error| format!("请求失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("服务器返回错误：{error}"))?;
    let total = response.content_length().or(entry.size);
    emit_download_progress(reporter, &entry.name, "downloading", 0, total, url);
    let mut file =
        File::create(destination).map_err(|error| format!("创建下载文件失败：{error}"))?;
    let mut downloaded = 0;
    let mut last_emit = Instant::now();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|error| format!("读取下载内容失败：{error}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| format!("写入下载文件失败：{error}"))?;
        downloaded += read as u64;
        let should_emit = last_emit.elapsed() >= Duration::from_millis(120)
            || total.is_some_and(|total| downloaded >= total);
        if should_emit {
            emit_download_progress(reporter, &entry.name, "downloading", downloaded, total, url);
            last_emit = Instant::now();
        }
    }
    emit_download_progress(reporter, &entry.name, "downloading", downloaded, total, url);
    Ok(())
}

fn emit_download_progress(
    reporter: ModDownloadReporter<'_>,
    mod_name: &str,
    phase: &str,
    downloaded: u64,
    total: Option<u64>,
    url: &str,
) {
    if let Some(progress) = reporter.progress {
        progress(ModDownloadProgress {
            operation_id: reporter.operation_id.to_string(),
            mod_name: mod_name.to_string(),
            phase: phase.to_string(),
            downloaded,
            total,
            url: url.to_string(),
        });
    }
}

fn read_zip_metadata(path: &Path) -> Result<ModMetadata, String> {
    let file = File::open(path).map_err(|error| format!("打开下载文件失败：{error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("读取 Mod 压缩包失败：{error}"))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取压缩包条目失败：{error}"))?;
        if is_everest_yaml_entry(&normalize_slash(file.name())) {
            let mut text = String::new();
            file.read_to_string(&mut text)
                .map_err(|error| format!("读取 everest.yaml 失败：{error}"))?;
            return Ok(crate::parsers::everest::parse_metadata(&text));
        }
    }
    Ok(ModMetadata::default())
}

fn is_everest_yaml_entry(entry: &str) -> bool {
    let basename = entry.rsplit('/').next().unwrap_or(entry);
    basename.eq_ignore_ascii_case("everest.yaml") || basename.eq_ignore_ascii_case("everest.yml")
}

fn mirror_urls(url: &str) -> Vec<String> {
    let Some(game_banana_file_id) = game_banana_file_id(url) else {
        return vec![url.to_string()];
    };
    vec![
        url.to_string(),
        format!("https://celeste.weg.fan/api/v2/download/gamebanana-files/{game_banana_file_id}"),
        format!("https://banana-mirror-mods.celestemods.com/{game_banana_file_id}.zip"),
        format!("https://celestemodupdater.0x0a.de/banana-mirror/{game_banana_file_id}.zip"),
    ]
}

fn game_banana_file_id(url: &str) -> Option<u64> {
    for prefix in [
        "http://gamebanana.com/dl/",
        "https://gamebanana.com/dl/",
        "http://gamebanana.com/mmdl/",
        "https://gamebanana.com/mmdl/",
    ] {
        if let Some(rest) = url.strip_prefix(prefix) {
            return rest.parse().ok();
        }
    }
    None
}

fn fresh_install_path(mods_dir: &Path, entry: &ModCatalogEntry) -> Result<PathBuf, String> {
    let destination = mods_dir.join(safe_zip_file_name(&entry.name));
    if destination.exists() {
        return Err(format!(
            "目标 Mod 文件已存在：{}",
            destination.to_string_lossy()
        ));
    }
    Ok(destination)
}

fn normalize_replace_path(mods_dir: &Path, replace_path: &Path) -> Result<PathBuf, String> {
    let canonical_mods = mods_dir
        .canonicalize()
        .map_err(|error| format!("读取 Mods 目录失败：{error}"))?;
    let canonical_target = replace_path
        .canonicalize()
        .map_err(|error| format!("读取待更新 Mod 文件失败：{error}"))?;
    if !canonical_target.starts_with(&canonical_mods) {
        return Err("只能更新 Mods 目录下的文件".to_string());
    }
    if !canonical_target.is_file()
        || !canonical_target
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        return Err("只能更新 zip 格式的 Mod 文件".to_string());
    }
    Ok(canonical_target)
}

fn install_downloaded_zip(
    temp_path: &Path,
    destination: &Path,
    replace_existing: bool,
) -> Result<Option<PathBuf>, String> {
    if !replace_existing {
        fs::rename(temp_path, destination).map_err(|error| format!("安装 Mod 失败：{error}"))?;
        return Ok(None);
    }

    let backup_path = replacement_backup_path(destination);
    let _ = fs::remove_file(&backup_path);
    fs::rename(destination, &backup_path).map_err(|error| format!("暂存旧 Mod 失败：{error}"))?;
    if let Err(error) = fs::rename(temp_path, destination) {
        let restore_result = fs::rename(&backup_path, destination);
        return Err(match restore_result {
            Ok(()) => format!("安装更新失败，旧文件已恢复：{error}"),
            Err(restore_error) => {
                format!("安装更新失败，且旧文件恢复失败：{error}；{restore_error}")
            }
        });
    }
    fs::remove_file(&backup_path).map_err(|error| format!("移除旧 Mod 暂存文件失败：{error}"))?;
    Ok(Some(destination.to_path_buf()))
}

fn replacement_backup_path(destination: &Path) -> PathBuf {
    let file_name = destination
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "mod.zip".to_string());
    destination.with_file_name(format!("{file_name}.celepkg-old"))
}

fn safe_zip_file_name(name: &str) -> String {
    let mut safe = name
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    if safe.is_empty() {
        safe = "Mod".to_string();
    }
    if !safe.to_ascii_lowercase().ends_with(".zip") {
        safe.push_str(".zip");
    }
    safe
}

fn entry_matches_query(entry: &ModCatalogEntry, normalized_query: &str) -> bool {
    let haystack = [
        entry.name.as_str(),
        entry.version.as_str(),
        entry.game_banana_type.as_str(),
        entry.page_url.as_str(),
    ]
    .join(" ");
    normalize_dependency_name(&haystack).contains(normalized_query)
}

struct CatalogLoad {
    sources: Vec<ModCatalogSourceKind>,
    entries: Vec<ModCatalogEntry>,
    warnings: Vec<String>,
}

fn load_catalogs(sources: &[ModCatalogSourceKind]) -> CatalogLoad {
    let client = reqwest::blocking::Client::builder()
        .user_agent("celepkg/0.2")
        .build();
    let mut entries = vec![];
    let mut loaded_sources = vec![];
    let mut warnings = vec![];

    let Ok(client) = client else {
        return CatalogLoad {
            sources: vec![],
            entries,
            warnings: vec!["初始化下载客户端失败".to_string()],
        };
    };

    for source in sources {
        match load_catalog(&client, *source) {
            Ok(mut source_entries) => {
                loaded_sources.push(*source);
                entries.append(&mut source_entries);
            }
            Err(error) => warnings.push(error),
        }
    }
    dedupe_catalog_entries(&mut entries);
    CatalogLoad {
        sources: loaded_sources,
        entries,
        warnings,
    }
}

fn load_catalog(
    client: &reqwest::blocking::Client,
    source: ModCatalogSourceKind,
) -> Result<Vec<ModCatalogEntry>, String> {
    match source {
        ModCatalogSourceKind::Everest => {
            let url = client
                .get(EVEREST_UPDATE_POINTER_URL)
                .send()
                .map_err(|error| format!("读取 Everest 更新目录地址失败：{error}"))?
                .error_for_status()
                .map_err(|error| format!("读取 Everest 更新目录地址失败：{error}"))?
                .text()
                .map_err(|error| format!("读取 Everest 更新目录地址失败：{error}"))?;
            load_everest_catalog(client, source, url.trim())
        }
        ModCatalogSourceKind::EverestMirror => {
            load_everest_catalog(client, source, EVEREST_MIRROR_UPDATE_URL)
        }
        ModCatalogSourceKind::Wegfan => {
            let text = client
                .get(WEGFAN_MOD_LIST_URL)
                .send()
                .map_err(|error| format!("读取 WEGFan Mod 目录失败：{error}"))?
                .error_for_status()
                .map_err(|error| format!("读取 WEGFan Mod 目录失败：{error}"))?
                .text()
                .map_err(|error| format!("读取 WEGFan Mod 目录失败：{error}"))?;
            parse_wegfan_catalog(&text)
        }
    }
}

fn load_everest_catalog(
    client: &reqwest::blocking::Client,
    source: ModCatalogSourceKind,
    url: &str,
) -> Result<Vec<ModCatalogEntry>, String> {
    let text = client
        .get(url)
        .send()
        .map_err(|error| format!("读取 Everest 更新目录失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("读取 Everest 更新目录失败：{error}"))?
        .text()
        .map_err(|error| format!("读取 Everest 更新目录失败：{error}"))?;
    parse_everest_catalog(&text, source)
}

fn dedupe_catalog_entries(entries: &mut Vec<ModCatalogEntry>) {
    let mut seen = HashSet::new();
    entries.retain(|entry| {
        seen.insert(format!(
            "{:?}:{}:{}",
            entry.source,
            normalize_dependency_name(&entry.name),
            entry.download_url
        ))
    });
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EverestCatalogEntry {
    version: Option<String>,
    last_update: Option<i64>,
    size: Option<u64>,
    #[serde(rename = "URL")]
    url: Option<String>,
    #[serde(rename = "xxHash", default)]
    xx_hash: Vec<String>,
    game_banana_type: Option<String>,
    game_banana_id: Option<u64>,
    game_banana_file_id: Option<u64>,
}

fn parse_everest_catalog(
    text: &str,
    source: ModCatalogSourceKind,
) -> Result<Vec<ModCatalogEntry>, String> {
    let catalog: HashMap<String, EverestCatalogEntry> = serde_yaml::from_str(text)
        .map_err(|error| format!("解析 Everest 更新目录失败：{error}"))?;
    Ok(catalog
        .into_iter()
        .map(|(name, item)| ModCatalogEntry {
            source,
            id: stable_id(&format!("{source:?}:{name}")),
            name,
            version: item.version.unwrap_or_default(),
            download_url: item.url.unwrap_or_default(),
            page_url: item
                .game_banana_id
                .map(|id| format!("https://gamebanana.com/mods/{id}"))
                .unwrap_or_default(),
            game_banana_type: item.game_banana_type.unwrap_or_default(),
            game_banana_id: item.game_banana_id,
            game_banana_file_id: item.game_banana_file_id,
            size: item.size,
            last_update: item.last_update,
            xx_hash: normalize_hashes(item.xx_hash),
        })
        .collect())
}

#[derive(Debug, Deserialize)]
struct WegfanCatalog {
    #[serde(default)]
    data: Vec<WegfanModFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WegfanModFile {
    id: String,
    name: String,
    version: Option<String>,
    #[serde(default)]
    xx_hash: Vec<String>,
    submission_file: WegfanSubmissionFile,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WegfanSubmissionFile {
    url: String,
    size: Option<u64>,
    game_banana_id: Option<u64>,
    submission: Option<WegfanSubmission>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WegfanSubmission {
    name: String,
    page_url: Option<String>,
    game_banana_section: Option<String>,
    game_banana_id: Option<u64>,
    latest_update_added_time: Option<String>,
}

fn parse_wegfan_catalog(text: &str) -> Result<Vec<ModCatalogEntry>, String> {
    let catalog: WegfanCatalog =
        serde_json::from_str(text).map_err(|error| format!("解析 WEGFan Mod 目录失败：{error}"))?;
    Ok(catalog
        .data
        .into_iter()
        .map(|item| {
            let submission = item.submission_file.submission;
            let page_url = submission
                .as_ref()
                .and_then(|submission| submission.page_url.clone())
                .unwrap_or_default();
            let game_banana_type = submission
                .as_ref()
                .and_then(|submission| submission.game_banana_section.clone())
                .unwrap_or_default();
            let game_banana_id = submission
                .as_ref()
                .and_then(|submission| submission.game_banana_id)
                .or(item.submission_file.game_banana_id);
            let name = submission
                .as_ref()
                .map(|submission| submission.name.clone())
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(item.name);
            let last_update = submission.as_ref().and_then(|submission| {
                parse_rfc3339_seconds(submission.latest_update_added_time.as_deref())
            });
            ModCatalogEntry {
                source: ModCatalogSourceKind::Wegfan,
                id: item.id,
                name,
                version: item.version.unwrap_or_default(),
                download_url: item.submission_file.url,
                page_url,
                game_banana_type,
                game_banana_id,
                game_banana_file_id: item.submission_file.game_banana_id,
                size: item.submission_file.size,
                last_update,
                xx_hash: normalize_hashes(item.xx_hash),
            }
        })
        .collect())
}

fn parse_rfc3339_seconds(value: Option<&str>) -> Option<i64> {
    let value = value?;
    let date_time =
        time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339).ok()?;
    Some(date_time.unix_timestamp())
}

fn normalize_hashes(hashes: Vec<String>) -> Vec<String> {
    hashes
        .into_iter()
        .map(|hash| hash.trim().to_ascii_lowercase())
        .filter(|hash| !hash.is_empty())
        .collect()
}

struct InstalledModIndex {
    mods: HashMap<String, InstalledModMatch>,
}

impl InstalledModIndex {
    fn new(records: &[ModRecord]) -> Self {
        let mut mods = HashMap::new();
        for record in records {
            if !record.is_archive || record.read_only {
                continue;
            }
            let path = Path::new(&record.absolute_path);
            let Ok(hash) = xxh64_file(path) else {
                continue;
            };
            let installed = InstalledModMatch {
                record_id: record.id.clone(),
                name: record.name.clone(),
                file_name: record.file_name.clone(),
                relative_path: record.relative_path.clone(),
                absolute_path: record.absolute_path.clone(),
                version: record.metadata.version.clone(),
                hash,
            };
            for key in installed_keys(record) {
                mods.entry(key).or_insert_with(|| installed.clone());
            }
        }
        Self { mods }
    }

    fn find(&self, entry: &ModCatalogEntry) -> Option<InstalledModMatch> {
        catalog_keys(entry).find_map(|key| self.mods.get(&key).cloned())
    }
}

fn installed_keys(record: &ModRecord) -> Vec<String> {
    [
        record.name.as_str(),
        record.metadata.name.as_str(),
        record.file_name.as_str(),
        record
            .file_name
            .trim_end_matches(".zip")
            .trim_end_matches(".ZIP"),
        record.relative_path.as_str(),
    ]
    .into_iter()
    .map(normalize_dependency_name)
    .filter(|key| !key.is_empty())
    .collect()
}

fn catalog_keys(entry: &ModCatalogEntry) -> impl Iterator<Item = String> + '_ {
    [entry.name.as_str()]
        .into_iter()
        .map(normalize_dependency_name)
        .filter(|key| !key.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{CompletionStatus, ModKind, ModMetadata};
    use std::fs;

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
        assert_eq!(entries[0].last_update, Some(1712873770));
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
    fn game_banana_downloads_expand_to_known_mirrors() {
        let urls = mirror_urls("https://gamebanana.com/mmdl/12345");
        assert_eq!(urls[0], "https://gamebanana.com/mmdl/12345");
        assert!(urls.contains(
            &"https://celeste.weg.fan/api/v2/download/gamebanana-files/12345".to_string()
        ));
        assert!(urls.contains(&"https://banana-mirror-mods.celestemods.com/12345.zip".to_string()));
        assert!(
            urls.contains(&"https://celestemodupdater.0x0a.de/banana-mirror/12345.zip".to_string())
        );
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
            game_banana_id: None,
            game_banana_file_id: None,
            size: None,
            last_update: None,
            xx_hash: vec![],
        }
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
}
