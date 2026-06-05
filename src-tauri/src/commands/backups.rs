use crate::domain::BackupInfo;
use crate::services;
use crate::storage::{
    load_state, resolve_required_celeste_path, resolve_required_celeste_path_from_state,
};
use std::path::Path;
use std::process::Command;

#[tauri::command]
pub async fn create_backup(celeste_path: String, kind: String) -> Result<BackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_required_celeste_path(&celeste_path)?;
        match kind.as_str() {
            "manual" => services::backup::create_manual_backup(&path),
            "auto" => services::backup::create_auto_backup(&path),
            _ => Err("备份类型无效".to_string()),
        }
    })
    .await
    .map_err(|error| format!("备份任务失败：{error}"))?
}

#[tauri::command]
pub async fn list_backups() -> Result<Vec<BackupInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = resolve_required_celeste_path("")?;
        services::backup::list_backups(&path)
    })
    .await
    .map_err(|error| format!("读取备份任务失败：{error}"))?
}

#[tauri::command]
pub async fn restore_backup(backup_id: String, scope: String) -> Result<BackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_required_celeste_path("")?;
        services::backup::restore_backup(&path, &backup_id, &scope)
    })
    .await
    .map_err(|error| format!("还原任务失败：{error}"))?
}

#[tauri::command]
pub async fn delete_backup(backup_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_required_celeste_path("")?;
        services::backup::delete_backup(&path, &backup_id)
    })
    .await
    .map_err(|error| format!("删除备份任务失败：{error}"))?
}

#[tauri::command]
pub async fn cleanup_auto_backups() -> Result<Vec<BackupInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state("", &state)?;
        if state.auto_backup_cleanup_enabled {
            services::backup::cleanup_auto_backups(&path, state.auto_backup_retention_count)
        } else {
            services::backup::list_backups(&path)
        }
    })
    .await
    .map_err(|error| format!("清理备份任务失败：{error}"))?
}

#[tauri::command]
pub async fn open_backup_folder(celeste_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_required_celeste_path(&celeste_path)?;
        let backups_path = services::backup::backups_dir(&path);
        std::fs::create_dir_all(&backups_path)
            .map_err(|error| format!("创建备份目录失败：{error}"))?;
        open_directory(&backups_path)
    })
    .await
    .map_err(|error| format!("打开备份目录任务失败：{error}"))?
}

#[tauri::command]
pub async fn open_backup_location(backup_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&backup_path);
        if !path.is_dir() {
            return Err("备份目录不存在".to_string());
        }
        open_directory(path)
    })
    .await
    .map_err(|error| format!("打开备份位置任务失败：{error}"))?
}

fn open_directory(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(path);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("打开文件夹失败：{error}"))
}
