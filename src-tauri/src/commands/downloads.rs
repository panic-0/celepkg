use crate::domain::{
    EverestInstallResult, EverestRelease, ModDownloadProgress, ModInstallResult, ModMetadata,
    ModPreviewStaging, StagedDownload,
};
use crate::services;
use crate::storage::{load_state, resolve_required_celeste_path_from_state};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, LazyLock, Mutex,
};
use tauri::Emitter;

static MOD_DOWNLOAD_CANCEL_FLAGS: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn download_everest_to_staging(
    app: tauri::AppHandle,
    celeste_path: String,
    release: EverestRelease,
    operation_id: String,
) -> Result<StagedDownload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        let app_for_progress = app.clone();
        let emit_progress = move |progress: ModDownloadProgress| {
            let _ = app_for_progress.emit("mod-download-progress", progress);
        };
        let download_guard = register_mod_download(&operation_id);
        let result = services::everest::download_to_staging(
            &path,
            &release,
            services::mod_catalog::ModDownloadReporter {
                operation_id: &operation_id,
                progress: Some(&emit_progress),
                cancel_token: Some(download_guard.cancel_flag()),
                task_index: 1,
                task_total: 1,
            },
        );
        if result.is_err() {
            emit_download_error(&app, operation_id, "Everest".to_string(), 1, 1);
        }
        result
    })
    .await
    .map_err(|error| format!("下载 Everest 任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_staged_everest(
    celeste_path: String,
    staged_id: String,
    release: EverestRelease,
) -> Result<EverestInstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        services::everest::install_staged_release(
            &path,
            &staged_id,
            release,
            state.profiles_state(),
            &state.protected_record_ids,
            &state.selected_save_files,
            None,
        )
    })
    .await
    .map_err(|error| format!("安装 staged Everest 任务失败：{error}"))?
}

#[tauri::command]
pub async fn download_mod_to_staging(
    app: tauri::AppHandle,
    celeste_path: String,
    entry: crate::domain::ModCatalogEntry,
    operation_id: String,
    task_index: usize,
    task_total: usize,
) -> Result<StagedDownload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        let app_for_progress = app.clone();
        let emit_progress = move |progress: ModDownloadProgress| {
            let _ = app_for_progress.emit("mod-download-progress", progress);
        };
        let download_guard = register_mod_download(&operation_id);
        let result = services::mod_catalog::download_to_staging(
            &path,
            &entry,
            services::mod_catalog::ModDownloadReporter {
                operation_id: &operation_id,
                progress: Some(&emit_progress),
                cancel_token: Some(download_guard.cancel_flag()),
                task_index,
                task_total,
            },
        );
        if result.is_err() {
            emit_download_error(&app, operation_id, entry.name, task_index, task_total);
        }
        result
    })
    .await
    .map_err(|error| format!("下载 Mod 任务失败：{error}"))?
}

#[tauri::command]
pub async fn stage_mod_preview(
    app: tauri::AppHandle,
    celeste_path: String,
    entry: crate::domain::ModCatalogEntry,
    operation_id: String,
) -> Result<ModPreviewStaging, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        let app_for_progress = app.clone();
        let emit_progress = move |progress: ModDownloadProgress| {
            let _ = app_for_progress.emit("mod-download-progress", progress);
        };
        let download_guard = register_mod_download(&operation_id);
        let result = services::mod_catalog::stage_preview(
            &path,
            &entry,
            services::mod_catalog::ModDownloadReporter {
                operation_id: &operation_id,
                progress: Some(&emit_progress),
                cancel_token: Some(download_guard.cancel_flag()),
                task_index: 1,
                task_total: 1,
            },
        );
        if result.is_err() {
            emit_download_error(&app, operation_id, entry.name, 1, 1);
        }
        result
    })
    .await
    .map_err(|error| format!("预览 Mod 依赖任务失败：{error}"))?
}

#[tauri::command]
pub async fn read_staged_mod_metadata(
    celeste_path: String,
    staged_id: String,
) -> Result<ModMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        services::mod_catalog::read_staged_metadata(&path, &staged_id)
    })
    .await
    .map_err(|error| format!("读取 staged Mod 元数据任务失败：{error}"))?
}

#[tauri::command]
pub async fn delete_staged_download(
    celeste_path: String,
    staged_id: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        services::mod_catalog::delete_staged_download(&path, &staged_id)
    })
    .await
    .map_err(|error| format!("清理 staged 下载任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_staged_mod(
    celeste_path: String,
    staged_id: String,
    entry: crate::domain::ModCatalogEntry,
    installed_path: Option<String>,
) -> Result<ModInstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        services::mod_catalog::install_staged(
            &path,
            &staged_id,
            entry,
            installed_path.as_deref().map(Path::new),
            services::mod_catalog::ModInstallContext {
                profiles: state.profiles_state(),
                protected_record_ids: &state.protected_record_ids,
                selected_save_files: &state.selected_save_files,
                reporter: None,
            },
        )
    })
    .await
    .map_err(|error| format!("安装 staged Mod 任务失败：{error}"))?
}

#[tauri::command]
pub fn cancel_mod_download(operation_id: String) -> Result<bool, String> {
    let flags = MOD_DOWNLOAD_CANCEL_FLAGS
        .lock()
        .map_err(|_| "取消下载状态不可用".to_string())?;
    let Some(flag) = flags.get(&operation_id) else {
        return Ok(false);
    };
    flag.store(true, Ordering::Relaxed);
    Ok(true)
}

fn emit_download_error(
    app: &tauri::AppHandle,
    operation_id: String,
    mod_name: String,
    task_index: usize,
    task_total: usize,
) {
    let _ = app.emit(
        "mod-download-progress",
        ModDownloadProgress {
            operation_id,
            mod_name,
            phase: "error".to_string(),
            downloaded: 0,
            total: None,
            speed_bytes_per_sec: 0.0,
            task_index,
            task_total,
            url: String::new(),
        },
    );
}

struct ModDownloadGuard {
    operation_id: String,
    cancel_flag: Arc<AtomicBool>,
}

impl ModDownloadGuard {
    fn cancel_flag(&self) -> &Arc<AtomicBool> {
        &self.cancel_flag
    }
}

impl Drop for ModDownloadGuard {
    fn drop(&mut self) {
        if let Ok(mut flags) = MOD_DOWNLOAD_CANCEL_FLAGS.lock() {
            if flags
                .get(&self.operation_id)
                .is_some_and(|flag| Arc::ptr_eq(flag, &self.cancel_flag))
            {
                flags.remove(&self.operation_id);
            }
        }
    }
}

fn register_mod_download(operation_id: &str) -> ModDownloadGuard {
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut flags) = MOD_DOWNLOAD_CANCEL_FLAGS.lock() {
        flags.insert(operation_id.to_string(), Arc::clone(&flag));
    }
    ModDownloadGuard {
        operation_id: operation_id.to_string(),
        cancel_flag: flag,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_operation_id(label: &str) -> String {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        format!("download-{label}-{}-{stamp}", std::process::id())
    }

    fn fail_after_download_registration(operation_id: &str) -> Result<(), String> {
        let download_guard = register_mod_download(operation_id);
        assert!(cancel_mod_download(operation_id.to_string()).unwrap());
        assert!(download_guard.cancel_flag().load(Ordering::Relaxed));
        Err("提前失败".to_string())
    }

    #[test]
    fn mod_download_registration_cleans_flag_when_scope_ends() {
        let operation_id = unique_operation_id("scope");

        {
            let download_guard = register_mod_download(&operation_id);
            assert!(cancel_mod_download(operation_id.clone()).unwrap());
            assert!(download_guard.cancel_flag().load(Ordering::Relaxed));
        }

        assert!(!cancel_mod_download(operation_id).unwrap());
    }

    #[test]
    fn mod_download_registration_cleans_flag_after_early_error() {
        let operation_id = unique_operation_id("error");

        let error = fail_after_download_registration(&operation_id).unwrap_err();

        assert_eq!(error, "提前失败");
        assert!(!cancel_mod_download(operation_id).unwrap());
    }
}
