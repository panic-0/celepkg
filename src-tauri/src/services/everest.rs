use crate::domain::{EverestInstallResult, EverestRelease, EverestReleaseList, StagedDownload};
use crate::services::download::{
    download_url_to_file, emit_progress, ensure_not_cancelled, resolve_staged_download_path,
    staged_id_from_path, staging_download_path as shared_staging_download_path,
    ModDownloadReporter, StagingDownloadFile,
};
use serde::Deserialize;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use zip::ZipArchive;

const EVEREST_RELEASES_URL: &str =
    "https://maddie480.ovh/celeste/everest-versions?supportsNativeBuilds=true";
const HTTP_USER_AGENT: &str = concat!("celepkg/", env!("CARGO_PKG_VERSION"));
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
    let staging = staging_download_path(celeste_path, release, reporter.operation_id);
    if let Some(parent) = staging.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建下载目录失败：{error}"))?;
    }
    let client = download_client()?;
    let mut staging_guard = StagingDownloadFile::new(staging);
    download_url_to_file(
        &client,
        &download_url,
        staging_guard.path(),
        "Everest",
        release.main_file_size,
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
        .user_agent(HTTP_USER_AGENT)
        .connect_timeout(DOWNLOAD_CONNECT_TIMEOUT)
        .timeout(DOWNLOAD_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("初始化下载客户端失败：{error}"))
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
    shared_staging_download_path(celeste_path, &key)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_user_agent_uses_package_version() {
        assert_eq!(
            HTTP_USER_AGENT,
            format!("celepkg/{}", env!("CARGO_PKG_VERSION"))
        );
        assert!(HTTP_USER_AGENT.contains(env!("CARGO_PKG_VERSION")));
    }

    #[test]
    fn download_client_keeps_download_timeouts() {
        assert_eq!(DOWNLOAD_CONNECT_TIMEOUT, Duration::from_secs(10));
        assert_eq!(DOWNLOAD_REQUEST_TIMEOUT, Duration::from_secs(300));
        download_client().expect("download client should build");
    }

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

    #[test]
    fn staged_download_path_accepts_missing_file_inside_staging_dir() {
        let root = temp_celeste_root("missing-staged");
        let staged = root
            .join(".celepkg")
            .join("downloads")
            .join("staging")
            .join("0123456789abcdef.zip.download");

        let resolved =
            resolve_staged_download_path(&root, staged.file_name().unwrap().to_str().unwrap())
                .unwrap();

        assert_eq!(resolved, staged);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn staged_download_path_rejects_path_traversal_ids() {
        let root = temp_celeste_root("traversal");

        let error =
            resolve_staged_download_path(&root, "../0123456789abcdef.zip.download").unwrap_err();

        assert_eq!(error, "无效的 staging id");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn staged_download_path_rejects_non_staging_id() {
        let root = temp_celeste_root("non-staging");

        let error = resolve_staged_download_path(&root, "Everest.zip.download").unwrap_err();

        assert_eq!(error, "无效的 staging id");

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
