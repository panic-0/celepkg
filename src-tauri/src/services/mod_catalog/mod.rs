use crate::dependency_rules::version_too_low;
use crate::domain::{Dependency, ModDownloadPhase, StagedDownload, StagedDownloadKind};
use crate::domain::{
    ModCatalogDependencyResolution, ModCatalogDependencyResolutionResult, ModCatalogEntry,
    ModCatalogSearchResult, ModCatalogSourceKind, ModInstallResult, ModMetadata, ModRecord,
    ModUpdateCandidate, ModUpdateCheckResult, ProfilesState,
};
pub use crate::services::download::ModDownloadReporter;
use crate::services::download::{
    download_url_to_file, emit_progress as emit_download_progress, ensure_not_cancelled,
    resolve_staged_download_path, staged_id_from_path,
    staging_download_path as shared_staging_download_path, StagingDownloadFile,
};
mod hash_cache;
mod loaders;
use crate::utils::{normalize_dependency_name, normalize_slash};
use hash_cache::InstalledModIndex;
use loaders::{load_catalogs, load_catalogs_fresh};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::Duration;
use xxhash_rust::xxh64::Xxh64;
use zip::ZipArchive;

const HTTP_USER_AGENT: &str = concat!("celepkg/", env!("CARGO_PKG_VERSION"));
const DOWNLOAD_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const DOWNLOAD_REQUEST_TIMEOUT: Duration = Duration::from_secs(300);

pub struct ModInstallContext<'a> {
    pub profiles: ProfilesState,
    pub protected_record_ids: &'a [String],
    pub selected_save_files: &'a [String],
    pub reporter: Option<ModDownloadReporter<'a>>,
}

pub fn search_catalog(query: &str, sources: &[ModCatalogSourceKind]) -> ModCatalogSearchResult {
    let sources = normalize_sources(sources);
    let load = load_catalogs(&sources);
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
    let sources = normalize_sources(sources);
    let load = load_catalogs_fresh(&sources);
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
    let sources = normalize_sources(sources);
    let load = load_catalogs(&sources);
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
    let sources = normalize_sources(sources);
    let load = load_catalogs(&sources);
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

fn normalize_sources(sources: &[ModCatalogSourceKind]) -> Vec<ModCatalogSourceKind> {
    if sources.is_empty() {
        return default_sources();
    }
    let mut normalized = vec![];
    for source in sources {
        if !normalized.contains(source) {
            normalized.push(*source);
        }
    }
    normalized
}

fn default_sources() -> Vec<ModCatalogSourceKind> {
    vec![
        ModCatalogSourceKind::EverestMirror,
        ModCatalogSourceKind::Wegfan,
    ]
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
        kind: StagedDownloadKind::Mod,
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
        emit_download_progress(
            reporter,
            &entry.name,
            ModDownloadPhase::Installing,
            0,
            None,
            0.0,
            "",
        );
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
        emit_download_progress(
            reporter,
            &entry.name,
            ModDownloadPhase::Done,
            1,
            Some(1),
            0.0,
            "",
        );
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
        ensure_not_cancelled(reporter)?;
        let _ = fs::remove_file(staging.path());
        match download_url_to_file(
            &client,
            &url,
            staging.path(),
            &entry.name,
            entry.size,
            reporter,
        ) {
            Ok(()) => {
                emit_download_progress(
                    reporter,
                    &entry.name,
                    ModDownloadPhase::Verifying,
                    0,
                    None,
                    0.0,
                    &url,
                );
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
    shared_staging_download_path(celeste_path, &key)
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

#[cfg(test)]
mod tests;
