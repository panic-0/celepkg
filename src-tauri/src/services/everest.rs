use crate::domain::{
    EverestInstallResult, EverestRelease, EverestReleaseList, ModDownloadProgress, StagedDownload,
};
use crate::services::mod_catalog::{DownloadProgressThrottle, ModDownloadReporter};
use crate::utils::stable_id;
use serde::Deserialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use zip::ZipArchive;

const EVEREST_RELEASES_URL: &str =
    "https://maddie480.ovh/celeste/everest-versions?supportsNativeBuilds=true";
const DOWNLOAD_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const DOWNLOAD_REQUEST_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EverestReleaseResponse {
    date: String,
    main_file_size: Option<u64>,
    main_download: String,
    commit: String,
    branch: String,
    version: u64,
    is_native: bool,
}

pub fn list_releases() -> EverestReleaseList {
    match fetch_releases() {
        Ok(mut releases) => {
            releases.sort_by(|left, right| {
                branch_rank(&left.branch)
                    .cmp(&branch_rank(&right.branch))
                    .then_with(|| right.version.cmp(&left.version))
            });
            EverestReleaseList {
                releases,
                warnings: vec![],
            }
        }
        Err(error) => EverestReleaseList {
            releases: vec![],
            warnings: vec![error],
        },
    }
}

pub fn download_to_staging(
    celeste_path: &Path,
    release: &EverestRelease,
    reporter: ModDownloadReporter<'_>,
) -> Result<StagedDownload, String> {
    let download_url = if release.mirror_download.trim().is_empty() {
        release.main_download.clone()
    } else {
        release.mirror_download.clone()
    };
    let staging = staging_download_path(celeste_path, &release, reporter.operation_id);
    if let Some(parent) = staging.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建下载目录失败：{error}"))?;
    }
    let client = download_client()?;
    let mut staging_guard = StagingFile::new(staging);
    download_url_to_file(
        &client,
        &download_url,
        staging_guard.path(),
        &release,
        reporter,
    )?;
    emit_progress(
        reporter,
        "Everest",
        "verifying",
        0,
        None,
        0.0,
        &download_url,
    );
    validate_everest_zip(staging_guard.path())?;
    let size = fs::metadata(staging_guard.path())
        .ok()
        .map(|metadata| metadata.len());
    let staged_id = staged_id_from_path(staging_guard.path())?;
    staging_guard.keep();
    Ok(StagedDownload {
        staged_id,
        name: "Everest".to_string(),
        kind: "everest".to_string(),
        size,
        hash: None,
    })
}

pub fn install_staged_release(
    celeste_path: &Path,
    staged_id: &str,
    release: EverestRelease,
    profiles: crate::domain::ProfilesState,
    protected_record_ids: &[String],
    selected_save_files: &[String],
    reporter: Option<ModDownloadReporter<'_>>,
) -> Result<EverestInstallResult, String> {
    let staging = resolve_staged_download_path(celeste_path, staged_id)?;
    emit_progress(
        reporter.unwrap_or(ModDownloadReporter {
            operation_id: "",
            progress: None,
            cancel_token: None,
            task_index: 1,
            task_total: 1,
        }),
        "Everest",
        "installing",
        0,
        None,
        0.0,
        "",
    );
    validate_everest_zip(&staging)?;
    ensure_install_targets_available(celeste_path)?;
    let install_reporter = reporter.unwrap_or(ModDownloadReporter {
        operation_id: "",
        progress: None,
        cancel_token: None,
        task_index: 1,
        task_total: 1,
    });
    extract_everest_zip(&staging, celeste_path, install_reporter)?;
    run_mini_installer(celeste_path, install_reporter)?;
    let _ = fs::remove_file(&staging);

    let mut timings = vec![];
    let mut scan = crate::services::scan::full_scan(
        celeste_path,
        profiles,
        crate::services::scan::list_available_save_files(celeste_path),
        selected_save_files.to_vec(),
        &mut timings,
    );
    for record in scan.maps.iter_mut().chain(scan.other_mods.iter_mut()) {
        record.protected = record.read_only || protected_record_ids.contains(&record.id);
    }
    crate::services::scan::write_scan_cache(celeste_path, &scan);
    if let Some(reporter) = reporter {
        emit_progress(reporter, "Everest", "done", 1, Some(1), 0.0, "");
    }
    Ok(EverestInstallResult { release, scan })
}

fn fetch_releases() -> Result<Vec<EverestRelease>, String> {
    let client = download_client()?;
    let releases = client
        .get(EVEREST_RELEASES_URL)
        .send()
        .map_err(|error| format!("请求 Everest 版本列表失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("Everest 版本列表返回错误：{error}"))?
        .json::<Vec<EverestReleaseResponse>>()
        .map_err(|error| format!("解析 Everest 版本列表失败：{error}"))?;
    Ok(releases
        .into_iter()
        .map(|release| EverestRelease {
            branch: release.branch,
            version: release.version,
            date: release.date,
            commit: release.commit,
            main_file_size: release.main_file_size,
            mirror_download: format!(
                "https://celeste.weg.fan/api/v2/download/everest/{}",
                release.version
            ),
            main_download: release.main_download,
            is_native: release.is_native,
        })
        .collect())
}

fn branch_rank(branch: &str) -> u8 {
    match branch.to_ascii_lowercase().as_str() {
        "stable" => 0,
        "beta" => 1,
        "dev" => 2,
        _ => 3,
    }
}

fn download_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("celepkg/0.2")
        .connect_timeout(DOWNLOAD_CONNECT_TIMEOUT)
        .timeout(DOWNLOAD_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("初始化下载客户端失败：{error}"))
}

struct StagingFile {
    path: PathBuf,
    keep: bool,
}

impl StagingFile {
    fn new(path: PathBuf) -> Self {
        Self { path, keep: false }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn keep(&mut self) {
        self.keep = true;
    }
}

impl Drop for StagingFile {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn staging_download_path(
    celeste_path: &Path,
    release: &EverestRelease,
    operation_id: &str,
) -> PathBuf {
    let key = if operation_id.trim().is_empty() {
        format!("everest-{}-{}", release.branch, release.version)
    } else {
        format!(
            "everest-{}-{}-{operation_id}",
            release.branch, release.version
        )
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

fn resolve_staged_download_path(celeste_path: &Path, staged_id: &str) -> Result<PathBuf, String> {
    if staged_id.trim().is_empty()
        || staged_id.contains('/')
        || staged_id.contains('\\')
        || staged_id.contains("..")
    {
        return Err("无效的 staging id".to_string());
    }
    let staging_dir = celeste_path
        .join(".celepkg")
        .join("downloads")
        .join("staging");
    let path = staging_dir.join(staged_id);
    let canonical_dir = staging_dir
        .canonicalize()
        .map_err(|error| format!("读取 staging 目录失败：{error}"))?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("读取 staging 文件失败：{error}"))?;
    if !canonical_path.starts_with(&canonical_dir) {
        return Err("staging 文件不在下载目录中".to_string());
    }
    Ok(canonical_path)
}

fn download_url_to_file(
    client: &reqwest::blocking::Client,
    url: &str,
    destination: &Path,
    release: &EverestRelease,
    reporter: ModDownloadReporter<'_>,
) -> Result<(), String> {
    ensure_not_cancelled(reporter)?;
    let mut response = client
        .get(url)
        .send()
        .map_err(|error| format!("请求失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("服务器返回错误：{error}"))?;
    let total = response.content_length().or(release.main_file_size);
    emit_progress(reporter, "Everest", "downloading", 0, total, 0.0, url);
    let mut file =
        File::create(destination).map_err(|error| format!("创建下载文件失败：{error}"))?;
    let mut downloaded = 0;
    let mut progress_throttle = DownloadProgressThrottle::new(total);
    let started = Instant::now();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        ensure_not_cancelled(reporter)?;
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
            emit_progress(
                reporter,
                "Everest",
                "downloading",
                downloaded,
                total,
                download_speed(downloaded, started),
                url,
            );
        }
    }
    emit_progress(
        reporter,
        "Everest",
        "downloading",
        downloaded,
        total,
        download_speed(downloaded, started),
        url,
    );
    Ok(())
}

fn validate_everest_zip(path: &Path) -> Result<(), String> {
    let file = File::open(path).map_err(|error| format!("打开 Everest 压缩包失败：{error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("读取 Everest 压缩包失败：{error}"))?;
    let has_main = (0..archive.len()).any(|index| {
        archive
            .by_index(index)
            .map(|file| file.name().starts_with("main/"))
            .unwrap_or(false)
    });
    if !has_main {
        return Err("Everest 压缩包缺少 main/ 目录".to_string());
    }
    Ok(())
}

fn ensure_install_targets_available(celeste_path: &Path) -> Result<(), String> {
    for file_name in ["Celeste.exe", "Celeste.dll"] {
        let path = celeste_path.join(file_name);
        if path.exists() {
            ensure_file_writable_for_install(&path)?;
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn ensure_file_writable_for_install(path: &Path) -> Result<(), String> {
    use std::os::windows::fs::OpenOptionsExt;

    match fs::OpenOptions::new()
        .read(true)
        .write(true)
        .share_mode(0)
        .open(path)
    {
        Ok(_) => Ok(()),
        Err(error) if matches!(error.raw_os_error(), Some(32 | 33)) => Err(format!(
            "Celeste 似乎仍在运行，安装 Everest 前请先关闭游戏后重试。被占用文件：{}",
            path.display()
        )),
        Err(error) => Err(format!(
            "无法写入关键游戏文件：{}（{error}）。请关闭 Celeste、检查目录权限后重试。",
            path.display()
        )),
    }
}

#[cfg(not(target_os = "windows"))]
fn ensure_file_writable_for_install(path: &Path) -> Result<(), String> {
    fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map(|_| ())
        .map_err(|error| {
            format!(
                "无法写入关键游戏文件：{}（{error}）。请关闭 Celeste、检查目录权限后重试。",
                path.display()
            )
        })
}

fn extract_everest_zip(
    path: &Path,
    celeste_path: &Path,
    reporter: ModDownloadReporter<'_>,
) -> Result<(), String> {
    let file = File::open(path).map_err(|error| format!("打开 Everest 压缩包失败：{error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("读取 Everest 压缩包失败：{error}"))?;
    let total = archive.len().max(1);
    for index in 0..archive.len() {
        ensure_not_cancelled(reporter)?;
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取 Everest 压缩包条目失败：{error}"))?;
        let dist_name = file.mangled_name();
        let Ok(relative) = dist_name.strip_prefix("main") else {
            continue;
        };
        if relative.as_os_str().is_empty() {
            continue;
        }
        let outpath = celeste_path.join(relative);
        emit_progress(
            reporter,
            "Everest",
            "installing",
            index as u64,
            Some(total as u64),
            0.0,
            "",
        );
        if file.is_dir() {
            fs::create_dir_all(&outpath).map_err(|error| format!("创建目录失败：{error}"))?;
            continue;
        }
        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建目录失败：{error}"))?;
        }
        let mut output =
            File::create(&outpath).map_err(|error| format!("写入 Everest 文件失败：{error}"))?;
        std::io::copy(&mut file, &mut output)
            .map_err(|error| format!("写入 Everest 文件失败：{error}"))?;
        output
            .flush()
            .map_err(|error| format!("刷新 Everest 文件失败：{error}"))?;
    }
    Ok(())
}

fn run_mini_installer(
    celeste_path: &Path,
    reporter: ModDownloadReporter<'_>,
) -> Result<(), String> {
    ensure_not_cancelled(reporter)?;
    let installer_path = celeste_path.join(installer_name()?);
    let mut command = Command::new(&installer_path);
    command.current_dir(celeste_path);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = fs::metadata(&installer_path)
            .map_err(|error| format!("读取 MiniInstaller 权限失败：{error}"))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(permissions.mode() | 0o755);
        fs::set_permissions(&installer_path, permissions)
            .map_err(|error| format!("设置 MiniInstaller 权限失败：{error}"))?;
    }
    let output = command
        .output()
        .map_err(|error| format!("运行 MiniInstaller 失败：{error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(
            format!("MiniInstaller 失败：{}\n{}", stderr.trim(), stdout.trim())
                .trim()
                .to_string(),
        );
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn installer_name() -> Result<&'static str, String> {
    match std::env::consts::ARCH {
        "x86_64" => Ok("MiniInstaller-win64.exe"),
        "x86" => Ok("MiniInstaller-win.exe"),
        arch => Err(format!("不支持的 Windows 架构：{arch}")),
    }
}

#[cfg(target_os = "macos")]
fn installer_name() -> Result<&'static str, String> {
    Ok("MiniInstaller-osx")
}

#[cfg(target_os = "linux")]
fn installer_name() -> Result<&'static str, String> {
    Ok("MiniInstaller-linux")
}

fn ensure_not_cancelled(reporter: ModDownloadReporter<'_>) -> Result<(), String> {
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

fn emit_progress(
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_celeste_root(label: &str) -> PathBuf {
        let stamp = time::OffsetDateTime::now_utc()
            .unix_timestamp_nanos()
            .to_string();
        let root = std::env::temp_dir().join(format!(
            "celepkg-everest-{label}-{}-{stamp}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("create temp celeste root");
        root
    }

    #[test]
    fn install_target_preflight_accepts_writable_game_files() {
        let root = temp_celeste_root("writable");
        fs::write(root.join("Celeste.exe"), b"game").expect("write celeste exe");
        fs::write(root.join("Celeste.dll"), b"core").expect("write celeste dll");

        ensure_install_targets_available(&root).expect("preflight should pass");

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn install_target_preflight_reports_locked_game_file() {
        use std::os::windows::fs::OpenOptionsExt;

        let root = temp_celeste_root("locked");
        let exe = root.join("Celeste.exe");
        fs::write(&exe, b"game").expect("write celeste exe");
        let _lock = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(&exe)
            .expect("lock celeste exe");

        let error = ensure_install_targets_available(&root).expect_err("preflight should fail");

        assert!(error.contains("Celeste 似乎仍在运行"));
        assert!(error.contains("Celeste.exe"));

        let _ = fs::remove_dir_all(root);
    }
}
