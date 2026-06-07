use crate::dependency_rules::version_too_low;
use crate::domain::{Dependency, StagedDownload};
use crate::domain::{
    InstalledModMatch, ModCatalogDependencyResolution, ModCatalogDependencyResolutionResult,
    ModCatalogEntry, ModCatalogSearchResult, ModCatalogSourceKind, ModDownloadProgress,
    ModInstallResult, ModMetadata, ModRecord, ModUpdateCandidate, ModUpdateCheckResult,
    ProfilesState,
};
use crate::services::mod_catalog_cache::{
    read_catalog_cache, read_valid_catalog_cache, write_catalog_cache,
};
use crate::storage::{installed_mod_hash_cache_path, read_json, write_json};
use crate::utils::{normalize_dependency_name, normalize_slash, stable_id};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, UNIX_EPOCH};
use xxhash_rust::xxh64::Xxh64;
use zip::ZipArchive;

const EVEREST_MIRROR_UPDATE_URL: &str =
    "https://everestapi.github.io/updatermirror/everest_update.yaml";
const EVEREST_UPDATE_POINTER_URL: &str = "https://everestapi.github.io/modupdater.txt";
const WEGFAN_MOD_LIST_URL: &str = "https://celeste.weg.fan/api/v2/mod/list";
const HTTP_USER_AGENT: &str = concat!("celepkg/", env!("CARGO_PKG_VERSION"));
const CATALOG_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const CATALOG_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const DOWNLOAD_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const DOWNLOAD_REQUEST_TIMEOUT: Duration = Duration::from_secs(300);
const DOWNLOAD_PROGRESS_INTERVAL: Duration = Duration::from_millis(120);
const INSTALLED_MOD_HASH_CACHE_VERSION: u32 = 1;

#[derive(Clone, Copy)]
pub struct ModDownloadReporter<'a> {
    pub operation_id: &'a str,
    pub progress: Option<&'a (dyn Fn(ModDownloadProgress) + Send + Sync)>,
    pub cancel_token: Option<&'a AtomicBool>,
    pub task_index: usize,
    pub task_total: usize,
}

pub struct ModInstallContext<'a> {
    pub profiles: ProfilesState,
    pub protected_record_ids: &'a [String],
    pub selected_save_files: &'a [String],
    pub reporter: Option<ModDownloadReporter<'a>>,
}

pub(crate) struct DownloadProgressThrottle {
    total: Option<u64>,
    last_emit: Instant,
    last_downloaded: u64,
    last_percent: Option<u64>,
}

impl DownloadProgressThrottle {
    pub(crate) fn new(total: Option<u64>) -> Self {
        Self {
            total,
            last_emit: Instant::now(),
            last_downloaded: 0,
            last_percent: progress_percent(0, total),
        }
    }

    pub(crate) fn should_emit(&mut self, downloaded: u64) -> bool {
        if downloaded <= self.last_downloaded {
            return false;
        }

        let percent = progress_percent(downloaded, self.total);
        let first_chunk = self.last_downloaded == 0;
        let percent_changed = percent != self.last_percent;
        let interval_elapsed = self.last_emit.elapsed() >= DOWNLOAD_PROGRESS_INTERVAL;
        let completed = self
            .total
            .is_some_and(|total| total > 0 && downloaded >= total);

        if first_chunk || percent_changed || interval_elapsed || completed {
            self.last_emit = Instant::now();
            self.last_downloaded = downloaded;
            self.last_percent = percent;
            return true;
        }

        false
    }
}

fn progress_percent(downloaded: u64, total: Option<u64>) -> Option<u64> {
    let total = total.filter(|total| *total > 0)?;
    Some((((downloaded as u128) * 100 / (total as u128)).min(100)) as u64)
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
    let can_match_page_url = query_looks_like_url_or_domain(query);
    let mut entries = load.entries;
    if !normalized_query.is_empty() {
        entries.retain(|entry| entry_matches_query(entry, &normalized_query, can_match_page_url));
    }
    sort_catalog_entries(&mut entries);
    ModCatalogSearchResult {
        sources: load.sources,
        entries,
        warnings: load.warnings,
    }
}

pub fn refresh_catalog_cache(sources: &[ModCatalogSourceKind]) -> ModCatalogSearchResult {
    let load = load_catalogs_fresh(sources);
    let mut entries = load.entries;
    sort_catalog_entries(&mut entries);
    ModCatalogSearchResult {
        sources: load.sources,
        entries,
        warnings: load.warnings,
    }
}

pub fn resolve_catalog_dependencies(
    dependencies: &[Dependency],
    sources: &[ModCatalogSourceKind],
) -> ModCatalogDependencyResolutionResult {
    let load = load_catalogs(sources);
    let mut entries = load.entries;
    sort_catalog_entries(&mut entries);
    let resolutions = dependencies
        .iter()
        .map(|dependency| ModCatalogDependencyResolution {
            dependency: dependency.clone(),
            entry: find_catalog_entry_for_dependency(&entries, dependency).cloned(),
        })
        .collect();
    ModCatalogDependencyResolutionResult {
        sources: load.sources,
        resolutions,
        warnings: load.warnings,
    }
}

fn sort_catalog_entries(entries: &mut [ModCatalogEntry]) {
    entries.sort_by_key(|entry| entry.name.to_lowercase());
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
            cancel_token: None,
            task_index: 1,
            task_total: 1,
        },
    )?;
    let metadata = read_zip_metadata(&temp_path);
    let _ = fs::remove_file(&temp_path);
    metadata
}

pub fn download_to_staging(
    celeste_path: &Path,
    entry: &ModCatalogEntry,
    reporter: ModDownloadReporter<'_>,
) -> Result<StagedDownload, String> {
    let (temp_path, hash) = download_entry(celeste_path, entry, reporter)?;
    let size = fs::metadata(&temp_path).ok().map(|metadata| metadata.len());
    Ok(StagedDownload {
        staged_id: staged_id_from_path(&temp_path)?,
        name: entry.name.clone(),
        kind: "mod".to_string(),
        size,
        hash: Some(hash),
    })
}

pub fn stage_preview(
    celeste_path: &Path,
    entry: &ModCatalogEntry,
    reporter: ModDownloadReporter<'_>,
) -> Result<crate::domain::ModPreviewStaging, String> {
    let staged = download_to_staging(celeste_path, entry, reporter)?;
    let metadata = match read_staged_metadata(celeste_path, &staged.staged_id) {
        Ok(metadata) => metadata,
        Err(error) => {
            let _ = delete_staged_download(celeste_path, &staged.staged_id);
            return Err(error);
        }
    };
    Ok(crate::domain::ModPreviewStaging { staged, metadata })
}

pub fn read_staged_metadata(celeste_path: &Path, staged_id: &str) -> Result<ModMetadata, String> {
    let path = resolve_staged_download_path(celeste_path, staged_id)?;
    read_zip_metadata(&path)
}

pub fn delete_staged_download(celeste_path: &Path, staged_id: &str) -> Result<bool, String> {
    let path = resolve_staged_download_path(celeste_path, staged_id)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("清理 staged 下载失败：{error}")),
    }
}

pub fn install_staged(
    celeste_path: &Path,
    staged_id: &str,
    entry: ModCatalogEntry,
    replace_path: Option<&Path>,
    context: ModInstallContext<'_>,
) -> Result<ModInstallResult, String> {
    let mods_dir = celeste_path.join("Mods");
    fs::create_dir_all(&mods_dir).map_err(|error| format!("创建 Mods 目录失败：{error}"))?;
    let destination = match replace_path {
        Some(path) => normalize_replace_path(&mods_dir, path)?,
        None => fresh_install_path(&mods_dir, &entry)?,
    };
    let temp_path = resolve_staged_download_path(celeste_path, staged_id)?;
    let hash = xxh64_file(&temp_path)?;
    if !entry.xx_hash.is_empty()
        && !entry
            .xx_hash
            .iter()
            .any(|expected| expected.eq_ignore_ascii_case(&hash))
    {
        return Err(format!(
            "校验失败，目录记录为 {}，实际为 {hash}",
            entry.xx_hash.join("、")
        ));
    }
    if entry.xx_hash.is_empty() {
        validate_zip_full_read(&temp_path)?;
    }
    read_zip_metadata(&temp_path)?;
    if let Some(reporter) = context.reporter {
        emit_download_progress(reporter, &entry.name, "installing", 0, None, 0.0, "");
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建安装目录失败：{error}"))?;
    }
    let replaced_path = install_downloaded_zip(&temp_path, &destination, replace_path.is_some())?;
    let mut timings = vec![];
    let scan = crate::services::scan::full_scan(
        celeste_path,
        context.profiles,
        crate::services::scan::list_available_save_files(celeste_path),
        context.selected_save_files.to_vec(),
        &mut timings,
    );
    let mut scan = scan;
    for record in scan.maps.iter_mut().chain(scan.other_mods.iter_mut()) {
        record.protected = record.read_only || context.protected_record_ids.contains(&record.id);
    }
    crate::services::scan::write_scan_cache(celeste_path, &scan);
    if let Some(reporter) = context.reporter {
        emit_download_progress(reporter, &entry.name, "done", 1, Some(1), 0.0, "");
    }
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
    let mut staging = StagingDownloadFile::new(staging_download_path(
        celeste_path,
        entry,
        reporter.operation_id,
    ));
    if let Some(download_dir) = staging.path().parent() {
        fs::create_dir_all(download_dir).map_err(|error| format!("创建下载目录失败：{error}"))?;
    }
    let client = download_client()?;
    let mut last_error = None;
    for url in mirror_urls(&entry.download_url) {
        ensure_download_not_cancelled(reporter)?;
        let _ = fs::remove_file(staging.path());
        match download_url_to_file(&client, &url, staging.path(), entry, reporter) {
            Ok(()) => {
                emit_download_progress(reporter, &entry.name, "verifying", 0, None, 0.0, &url);
                let hash = xxh64_file(staging.path())?;
                if !entry.xx_hash.is_empty()
                    && !entry
                        .xx_hash
                        .iter()
                        .any(|expected| expected.eq_ignore_ascii_case(&hash))
                {
                    last_error = Some(format!(
                        "{url}: 校验失败，目录记录为 {}，实际为 {hash}",
                        entry.xx_hash.join("、")
                    ));
                    continue;
                }
                if entry.xx_hash.is_empty() {
                    if let Err(error) = validate_zip_full_read(staging.path()) {
                        last_error = Some(format!("{url}: {error}"));
                        continue;
                    }
                }
                if let Err(error) = read_zip_metadata(staging.path()) {
                    last_error = Some(format!("{url}: {error}"));
                    continue;
                }
                return Ok((staging.keep(), hash));
            }
            Err(error) => {
                last_error = Some(format!("{url}: {error}"));
            }
        }
    }
    Err(format!(
        "下载 Mod 失败：{}",
        last_error.unwrap_or_else(|| "没有可用下载地址".to_string())
    ))
}

fn download_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(HTTP_USER_AGENT)
        .connect_timeout(DOWNLOAD_CONNECT_TIMEOUT)
        .timeout(DOWNLOAD_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("初始化下载客户端失败：{error}"))
}

struct StagingDownloadFile {
    path: PathBuf,
    keep: bool,
}

impl StagingDownloadFile {
    fn new(path: PathBuf) -> Self {
        Self { path, keep: false }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn keep(&mut self) -> PathBuf {
        self.keep = true;
        self.path.clone()
    }
}

impl Drop for StagingDownloadFile {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_file(&self.path);
        }
    }
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

fn staged_id_from_path(path: &Path) -> Result<String, String> {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| "生成 staging id 失败".to_string())
}

fn is_staged_download_file_name(staged_id: &str) -> bool {
    staged_id.strip_suffix(".zip.download").is_some_and(|id| {
        id.len() == 16
            && id
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    })
}

fn resolve_staged_download_path(celeste_path: &Path, staged_id: &str) -> Result<PathBuf, String> {
    let mut components = Path::new(staged_id).components();
    let is_single_file_name = matches!(
        components.next(),
        Some(Component::Normal(name)) if name == std::ffi::OsStr::new(staged_id)
    ) && components.next().is_none();

    if staged_id.trim().is_empty()
        || staged_id.contains('/')
        || staged_id.contains('\\')
        || staged_id.contains("..")
        || !is_single_file_name
        || !is_staged_download_file_name(staged_id)
    {
        return Err("无效的 staging id".to_string());
    }
    let staging_dir = celeste_path
        .join(".celepkg")
        .join("downloads")
        .join("staging");
    Ok(staging_dir.join(staged_id))
}

fn download_url_to_file(
    client: &reqwest::blocking::Client,
    url: &str,
    destination: &Path,
    entry: &ModCatalogEntry,
    reporter: ModDownloadReporter<'_>,
) -> Result<(), String> {
    ensure_download_not_cancelled(reporter)?;
    let mut response = client
        .get(url)
        .send()
        .map_err(|error| format!("请求失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("服务器返回错误：{error}"))?;
    let total = response.content_length().or(entry.size);
    emit_download_progress(reporter, &entry.name, "downloading", 0, total, 0.0, url);
    let mut file =
        File::create(destination).map_err(|error| format!("创建下载文件失败：{error}"))?;
    let mut downloaded = 0;
    let mut progress_throttle = DownloadProgressThrottle::new(total);
    let started = Instant::now();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        ensure_download_not_cancelled(reporter)?;
        let read = response
            .read(&mut buffer)
            .map_err(|error| format!("读取下载内容失败：{error}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| format!("写入下载文件失败：{error}"))?;
        downloaded += read as u64;
        if progress_throttle.should_emit(downloaded) {
            emit_download_progress(
                reporter,
                &entry.name,
                "downloading",
                downloaded,
                total,
                download_speed(downloaded, started),
                url,
            );
        }
    }
    emit_download_progress(
        reporter,
        &entry.name,
        "downloading",
        downloaded,
        total,
        download_speed(downloaded, started),
        url,
    );
    Ok(())
}

fn ensure_download_not_cancelled(reporter: ModDownloadReporter<'_>) -> Result<(), String> {
    if reporter
        .cancel_token
        .is_some_and(|token| token.load(Ordering::Relaxed))
    {
        return Err("下载已取消".to_string());
    }
    Ok(())
}

fn download_speed(downloaded: u64, started: Instant) -> f64 {
    downloaded as f64 / started.elapsed().as_secs_f64().max(0.001)
}

fn emit_download_progress(
    reporter: ModDownloadReporter<'_>,
    mod_name: &str,
    phase: &str,
    downloaded: u64,
    total: Option<u64>,
    speed_bytes_per_sec: f64,
    url: &str,
) {
    if let Some(progress) = reporter.progress {
        progress(ModDownloadProgress {
            operation_id: reporter.operation_id.to_string(),
            mod_name: mod_name.to_string(),
            phase: phase.to_string(),
            downloaded,
            total,
            speed_bytes_per_sec,
            task_index: reporter.task_index.max(1),
            task_total: reporter.task_total.max(1),
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
            let metadata = crate::parsers::everest::parse_metadata_checked(&text)
                .map_err(|error| format!("解析 everest.yaml 失败：{error}"))?;
            return Ok(metadata);
        }
    }
    Err("Mod 压缩包缺少 everest.yaml".to_string())
}

fn validate_zip_full_read(path: &Path) -> Result<(), String> {
    let file = File::open(path).map_err(|error| format!("打开下载文件失败：{error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("读取 Mod 压缩包失败：{error}"))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取压缩包条目失败：{error}"))?;
        if file.is_dir() {
            continue;
        }
        io::copy(&mut file, &mut io::sink())
            .map_err(|error| format!("完整读取压缩包失败：{error}"))?;
    }
    Ok(())
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
    let _ = fs::remove_file(&backup_path);
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

fn entry_matches_query(
    entry: &ModCatalogEntry,
    normalized_query: &str,
    can_match_page_url: bool,
) -> bool {
    [entry.name.as_str(), entry.id.as_str()]
        .iter()
        .any(|value| normalize_dependency_name(value).contains(normalized_query))
        || (can_match_page_url
            && normalize_dependency_name(&entry.page_url).contains(normalized_query))
}

fn find_catalog_entry_for_dependency<'a>(
    entries: &'a [ModCatalogEntry],
    dependency: &Dependency,
) -> Option<&'a ModCatalogEntry> {
    let normalized = normalize_dependency_name(&dependency.name);
    if normalized.is_empty() {
        return None;
    }
    entries.iter().find(|entry| {
        normalize_dependency_name(&entry.name) == normalized
            && catalog_entry_satisfies_dependency(entry, dependency)
    })
}

fn catalog_entry_satisfies_dependency(entry: &ModCatalogEntry, dependency: &Dependency) -> bool {
    !entry.download_url.trim().is_empty() && !version_too_low(&entry.version, &dependency.version)
}

fn query_looks_like_url_or_domain(query: &str) -> bool {
    query
        .split_whitespace()
        .map(trim_url_query_token)
        .any(token_looks_like_url_or_domain)
}

fn trim_url_query_token(token: &str) -> &str {
    token.trim_matches(|ch: char| {
        matches!(
            ch,
            '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\'' | ',' | ';'
        )
    })
}

fn token_looks_like_url_or_domain(token: &str) -> bool {
    let token = token.trim();
    if token.is_empty() {
        return false;
    }
    let lower = token.to_ascii_lowercase();
    let without_scheme = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
        .unwrap_or(&lower);
    let without_www = without_scheme
        .strip_prefix("www.")
        .unwrap_or(without_scheme);
    let host = without_www
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default()
        .split(':')
        .next()
        .unwrap_or_default();
    let labels = host.split('.').collect::<Vec<_>>();
    labels.len() >= 2
        && labels.iter().all(|label| {
            !label.is_empty()
                && label
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
                && label
                    .chars()
                    .next()
                    .is_some_and(|ch| ch.is_ascii_alphanumeric())
                && label
                    .chars()
                    .last()
                    .is_some_and(|ch| ch.is_ascii_alphanumeric())
        })
        && labels.last().is_some_and(|label| {
            label.len() >= 2 && label.chars().any(|ch| ch.is_ascii_alphabetic())
        })
}

struct CatalogLoad {
    sources: Vec<ModCatalogSourceKind>,
    entries: Vec<ModCatalogEntry>,
    warnings: Vec<String>,
}

fn load_catalogs(sources: &[ModCatalogSourceKind]) -> CatalogLoad {
    load_catalogs_with_cache_mode(sources, true)
}

fn load_catalogs_fresh(sources: &[ModCatalogSourceKind]) -> CatalogLoad {
    load_catalogs_with_cache_mode(sources, false)
}

fn load_catalogs_with_cache_mode(
    sources: &[ModCatalogSourceKind],
    allow_valid_cache: bool,
) -> CatalogLoad {
    let client = catalog_client();
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
        match load_catalog_cached(&client, *source, allow_valid_cache) {
            Ok((mut source_entries, warning)) => {
                loaded_sources.push(*source);
                entries.append(&mut source_entries);
                if let Some(warning) = warning {
                    warnings.push(warning);
                }
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

fn catalog_client() -> Result<reqwest::blocking::Client, reqwest::Error> {
    reqwest::blocking::Client::builder()
        .user_agent(HTTP_USER_AGENT)
        .connect_timeout(CATALOG_CONNECT_TIMEOUT)
        .timeout(CATALOG_REQUEST_TIMEOUT)
        .build()
}

fn load_catalog_cached(
    client: &reqwest::blocking::Client,
    source: ModCatalogSourceKind,
    allow_valid_cache: bool,
) -> Result<(Vec<ModCatalogEntry>, Option<String>), String> {
    if allow_valid_cache {
        if let Some(cache) = read_valid_catalog_cache(source) {
            return Ok((cache.entries, None));
        }
    }

    match load_catalog(client, source) {
        Ok(entries) => {
            write_catalog_cache(source, &entries);
            Ok((entries, None))
        }
        Err(error) => {
            if let Some(cache) = read_catalog_cache(source) {
                return Ok((
                    cache.entries,
                    Some(format!(
                        "{}，已使用本地缓存目录",
                        error.trim_end_matches('。')
                    )),
                ));
            }
            Err(error)
        }
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
            category_name: String::new(),
            sub_category_name: String::new(),
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
    category_name: Option<String>,
    sub_category_name: Option<String>,
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
            let category_name = submission
                .as_ref()
                .and_then(|submission| submission.category_name.clone())
                .unwrap_or_default();
            let sub_category_name = submission
                .as_ref()
                .and_then(|submission| submission.sub_category_name.clone())
                .unwrap_or_default();
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
                category_name,
                sub_category_name,
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct InstalledModHashCache {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    entries: HashMap<String, InstalledModHashCacheEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct InstalledModHashCacheEntry {
    len: u64,
    modified: u128,
    hash: String,
}

impl InstalledModHashCache {
    fn read(cache_path: &Path) -> Self {
        let Some(cache) = read_json::<InstalledModHashCache>(cache_path) else {
            return Self::current();
        };
        if cache.version == INSTALLED_MOD_HASH_CACHE_VERSION {
            cache
        } else {
            Self::current()
        }
    }

    fn current() -> Self {
        Self {
            version: INSTALLED_MOD_HASH_CACHE_VERSION,
            entries: HashMap::new(),
        }
    }

    fn hash_for_path(&mut self, cache_key: &str, path: &Path) -> Result<String, String> {
        let stamp = file_hash_stamp(path)?;
        if let Some(entry) = self.entries.get(cache_key) {
            if entry.len == stamp.len && entry.modified == stamp.modified {
                return Ok(entry.hash.clone());
            }
        }

        let hash = xxh64_file(path)?;
        self.entries.insert(
            cache_key.to_string(),
            InstalledModHashCacheEntry {
                len: stamp.len,
                modified: stamp.modified,
                hash: hash.clone(),
            },
        );
        Ok(hash)
    }

    fn retain_keys(&mut self, keys: &HashSet<String>) {
        self.entries.retain(|key, _| keys.contains(key));
    }

    fn write_if_changed(&self, cache_path: &Path, previous: &Self) {
        if self != previous {
            let _ = write_json(cache_path, self);
        }
    }
}

struct FileHashStamp {
    len: u64,
    modified: u128,
}

fn file_hash_stamp(path: &Path) -> Result<FileHashStamp, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("读取文件信息失败：{error}"))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    Ok(FileHashStamp {
        len: metadata.len(),
        modified,
    })
}

impl InstalledModIndex {
    fn new(records: &[ModRecord]) -> Self {
        Self::new_with_cache_path(records, &installed_mod_hash_cache_path())
    }

    fn new_with_cache_path(records: &[ModRecord], cache_path: &Path) -> Self {
        let mut hash_cache = InstalledModHashCache::read(cache_path);
        let previous_hash_cache = hash_cache.clone();
        let mut seen_hash_keys = HashSet::new();
        let mut mods = HashMap::new();
        for record in records {
            if !record.is_archive || record.read_only {
                continue;
            }
            let path = Path::new(&record.absolute_path);
            let cache_key = record.absolute_path.clone();
            let Ok(hash) = hash_cache.hash_for_path(&cache_key, path) else {
                continue;
            };
            seen_hash_keys.insert(cache_key);
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
        hash_cache.retain_keys(&seen_hash_keys);
        hash_cache.write_if_changed(cache_path, &previous_hash_cache);
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
    use crate::storage::mod_catalog_cache_path;
    use std::fs;
    use std::io::{Cursor, Write};
    use std::net::TcpListener;
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
            .map(|index| {
                test_catalog_entry(&format!("entry-{index:03}"), &format!("Entry {index:03}"))
            })
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
    fn staged_download_path_rejects_path_traversal_ids() {
        let dir = tempfile::tempdir().unwrap();

        let error = resolve_staged_download_path(dir.path(), "../0123456789abcdef.zip.download")
            .unwrap_err();

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
            &entry,
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
            &entry,
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
            .filter(|event| event.phase == "downloading" && event.downloaded > 0)
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
            "downloading",
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
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, text) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(text.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }

    fn zip_bytes(entries: &[(&str, &str)]) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(cursor);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
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
}
