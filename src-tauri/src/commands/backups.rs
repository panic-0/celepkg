use crate::domain::BackupInfo;
use crate::services;
use crate::storage::{
    load_state, resolve_required_celeste_path, resolve_required_celeste_path_from_state,
};
use std::path::{Path, PathBuf};
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
        let celeste_path = resolve_required_celeste_path("")?;
        let path = resolve_backup_location_path(&celeste_path, Path::new(&backup_path))?;
        open_directory(&path)
    })
    .await
    .map_err(|error| format!("打开备份位置任务失败：{error}"))?
}

fn resolve_backup_location_path(
    celeste_path: &Path,
    backup_path: &Path,
) -> Result<PathBuf, String> {
    if !backup_path.is_dir() {
        return Err("备份目录不存在".to_string());
    }
    let backups_root = services::backup::backups_dir(celeste_path);
    let canonical_root = backups_root
        .canonicalize()
        .map_err(|error| format!("读取备份根目录失败：{error}"))?;
    let canonical_backup = backup_path
        .canonicalize()
        .map_err(|error| format!("读取备份目录失败：{error}"))?;
    if !canonical_backup.starts_with(&canonical_root)
        || canonical_backup == canonical_root
        || canonical_backup.parent() != Some(canonical_root.as_path())
    {
        return Err("只能打开当前 Celeste 目录下的备份快照目录".to_string());
    }
    if !canonical_backup.join("manifest.json").is_file() {
        return Err("备份快照清单不存在".to_string());
    }
    Ok(canonical_backup)
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

#[cfg(test)]
mod tests {
    use super::resolve_backup_location_path;
    use crate::services;
    use std::fs;
    use std::time::UNIX_EPOCH;

    #[test]
    fn backup_location_accepts_snapshot_directory() {
        let root = temp_dir("backup-location");
        let snapshot = services::backup::backups_dir(&root).join("100");
        fs::create_dir_all(&snapshot).expect("snapshot dir");
        fs::write(snapshot.join("manifest.json"), "{}").expect("manifest");

        let location = resolve_backup_location_path(&root, &snapshot).expect("location");
        let expected = snapshot.canonicalize().expect("canonical snapshot");

        let _ = fs::remove_dir_all(&root);

        assert_eq!(location, expected);
    }

    #[test]
    fn backup_location_rejects_root_directory() {
        let root = temp_dir("backup-root");
        let backups = services::backup::backups_dir(&root);
        fs::create_dir_all(&backups).expect("backups dir");

        let error = resolve_backup_location_path(&root, &backups).expect_err("root dir");

        let _ = fs::remove_dir_all(&root);

        assert_eq!(error, "只能打开当前 Celeste 目录下的备份快照目录");
    }

    #[test]
    fn backup_location_rejects_outside_directory() {
        let root = temp_dir("backup-current");
        let outside = temp_dir("backup-outside");
        fs::create_dir_all(services::backup::backups_dir(&root)).expect("backups dir");
        fs::create_dir_all(&outside).expect("outside dir");

        let error = resolve_backup_location_path(&root, &outside).expect_err("outside dir");

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);

        assert_eq!(error, "只能打开当前 Celeste 目录下的备份快照目录");
    }

    #[test]
    fn backup_location_rejects_missing_manifest() {
        let root = temp_dir("backup-missing-manifest");
        let snapshot = services::backup::backups_dir(&root).join("100");
        fs::create_dir_all(&snapshot).expect("snapshot dir");

        let error = resolve_backup_location_path(&root, &snapshot).expect_err("missing manifest");

        let _ = fs::remove_dir_all(&root);

        assert_eq!(error, "备份快照清单不存在");
    }

    fn temp_dir(label: &str) -> std::path::PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("celepkg-{label}-{stamp}"))
    }
}
