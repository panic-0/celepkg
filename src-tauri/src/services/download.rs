use crate::domain::{ModDownloadPhase, ModDownloadProgress};
use crate::utils::stable_id;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const DOWNLOAD_PROGRESS_INTERVAL: Duration = Duration::from_millis(120);

#[derive(Clone, Copy)]
pub struct ModDownloadReporter<'a> {
    pub operation_id: &'a str,
    pub progress: Option<&'a (dyn Fn(ModDownloadProgress) + Send + Sync)>,
    pub cancel_token: Option<&'a AtomicBool>,
    pub task_index: usize,
    pub task_total: usize,
}

pub struct StagingDownloadFile {
    path: PathBuf,
    keep: bool,
}

impl StagingDownloadFile {
    pub fn new(path: PathBuf) -> Self {
        Self { path, keep: false }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn keep(&mut self) -> PathBuf {
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

pub fn staging_download_path(celeste_path: &Path, key: &str) -> PathBuf {
    celeste_path
        .join(".celepkg")
        .join("downloads")
        .join("staging")
        .join(format!("{}.zip.download", stable_id(key)))
}

pub fn staged_id_from_path(path: &Path) -> Result<String, String> {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| "生成 staging id 失败".to_string())
}

pub fn resolve_staged_download_path(
    celeste_path: &Path,
    staged_id: &str,
) -> Result<PathBuf, String> {
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
    Ok(staging_dir(celeste_path).join(staged_id))
}

pub fn download_url_to_file(
    client: &reqwest::blocking::Client,
    url: &str,
    destination: &Path,
    item_name: &str,
    fallback_total: Option<u64>,
    reporter: ModDownloadReporter<'_>,
) -> Result<(), String> {
    ensure_not_cancelled(reporter)?;
    let mut response = client
        .get(url)
        .send()
        .map_err(|error| format!("请求失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("服务器返回错误：{error}"))?;
    let total = response.content_length().or(fallback_total);
    emit_progress(
        reporter,
        item_name,
        ModDownloadPhase::Downloading,
        0,
        total,
        0.0,
        url,
    );
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
                item_name,
                ModDownloadPhase::Downloading,
                downloaded,
                total,
                download_speed(downloaded, started),
                url,
            );
        }
    }
    emit_progress(
        reporter,
        item_name,
        ModDownloadPhase::Downloading,
        downloaded,
        total,
        download_speed(downloaded, started),
        url,
    );
    Ok(())
}

pub fn ensure_not_cancelled(reporter: ModDownloadReporter<'_>) -> Result<(), String> {
    if reporter
        .cancel_token
        .is_some_and(|token| token.load(Ordering::Relaxed))
    {
        return Err("下载已取消".to_string());
    }
    Ok(())
}

pub fn emit_progress(
    reporter: ModDownloadReporter<'_>,
    mod_name: &str,
    phase: ModDownloadPhase,
    downloaded: u64,
    total: Option<u64>,
    speed_bytes_per_sec: f64,
    url: &str,
) {
    if let Some(progress) = reporter.progress {
        progress(ModDownloadProgress {
            operation_id: reporter.operation_id.to_string(),
            mod_name: mod_name.to_string(),
            phase,
            downloaded,
            total,
            speed_bytes_per_sec,
            task_index: reporter.task_index.max(1),
            task_total: reporter.task_total.max(1),
            url: url.to_string(),
        });
    }
}

fn progress_percent(downloaded: u64, total: Option<u64>) -> Option<u64> {
    let total = total.filter(|total| *total > 0)?;
    Some((((downloaded as u128) * 100 / (total as u128)).min(100)) as u64)
}

fn is_staged_download_file_name(staged_id: &str) -> bool {
    staged_id.strip_suffix(".zip.download").is_some_and(|id| {
        id.len() == 16
            && id
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    })
}

fn staging_dir(celeste_path: &Path) -> PathBuf {
    celeste_path
        .join(".celepkg")
        .join("downloads")
        .join("staging")
}

fn download_speed(downloaded: u64, started: Instant) -> f64 {
    downloaded as f64 / started.elapsed().as_secs_f64().max(0.001)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn staged_download_path_accepts_missing_file_inside_staging_dir() {
        let root = tempfile::tempdir().unwrap();
        let staged = root
            .path()
            .join(".celepkg")
            .join("downloads")
            .join("staging")
            .join("0123456789abcdef.zip.download");

        let resolved = resolve_staged_download_path(
            root.path(),
            staged.file_name().unwrap().to_str().unwrap(),
        )
        .unwrap();

        assert_eq!(resolved, staged);
    }

    #[test]
    fn staged_download_path_rejects_path_traversal_ids() {
        let root = tempfile::tempdir().unwrap();

        let error = resolve_staged_download_path(root.path(), "../0123456789abcdef.zip.download")
            .unwrap_err();

        assert_eq!(error, "无效的 staging id");
    }

    #[test]
    fn staged_download_path_rejects_non_staging_id() {
        let root = tempfile::tempdir().unwrap();

        let error = resolve_staged_download_path(root.path(), "Helper.zip.download").unwrap_err();

        assert_eq!(error, "无效的 staging id");
    }

    #[test]
    fn progress_throttle_emits_when_percent_changes() {
        let mut throttle = DownloadProgressThrottle::new(Some(1000));

        assert!(throttle.should_emit(1));
        assert!(!throttle.should_emit(5));
        assert!(throttle.should_emit(10));
        assert!(throttle.should_emit(20));
    }
}
