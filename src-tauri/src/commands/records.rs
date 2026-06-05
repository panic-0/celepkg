use crate::domain::ScanResult;
use crate::services;
use crate::storage::{load_state, resolve_required_celeste_path_from_state, update_state};
use std::path::{Path, PathBuf};
use std::process::Command;

#[tauri::command]
pub async fn set_record_favorite(
    celeste_path: String,
    record_id: String,
    favorite: bool,
) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        let mut scan = services::scan::full_scan_cached(
            &path,
            state.profiles_state(),
            &state.protected_record_ids,
            &state.selected_save_files,
        );
        services::backup::create_auto_backup_if_enabled(
            &path,
            state.auto_backup_enabled,
            state.auto_backup_cleanup_enabled,
            state.auto_backup_retention_count,
        )?;
        services::scan::write_favorite_state(&path, &record_id, favorite, &scan)?;
        services::scan::set_scan_favorite_state(&mut scan, &record_id, favorite)?;
        services::scan::write_scan_cache(&path, &scan);
        Ok(scan)
    })
    .await
    .map_err(|error| format!("更新 Favorite 任务失败：{error}"))?
}

#[tauri::command]
pub async fn set_record_protected(
    celeste_path: String,
    record_id: String,
    protected: bool,
) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        let mut scan = services::scan::full_scan_cached(
            &path,
            state.profiles_state(),
            &state.protected_record_ids,
            &state.selected_save_files,
        );
        services::scan::set_scan_protected_state(&mut scan, &record_id, protected)?;
        update_state(|state| {
            if protected {
                if !state.protected_record_ids.contains(&record_id) {
                    state.protected_record_ids.push(record_id.clone());
                }
            } else {
                state.protected_record_ids.retain(|id| id != &record_id);
            }
            state.protected_record_ids.sort();
            state.protected_record_ids.dedup();
            Ok(())
        })?;
        services::scan::write_scan_cache(&path, &scan);
        Ok(scan)
    })
    .await
    .map_err(|error| format!("更新始终启用任务失败：{error}"))?
}

#[tauri::command]
pub async fn open_mod_location(absolute_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let location = resolve_mod_location_path(Path::new(&absolute_path))?;
        open_directory(&location)
    })
    .await
    .map_err(|error| format!("打开本地内容位置任务失败：{error}"))?
}

fn resolve_mod_location_path(path: &Path) -> Result<PathBuf, String> {
    if path.is_dir() {
        return Ok(path.to_path_buf());
    }
    if path.is_file() {
        return path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "本地内容位置不存在".to_string());
    }
    Err("本地内容位置不存在".to_string())
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
    use super::resolve_mod_location_path;
    use std::fs;
    use std::time::UNIX_EPOCH;

    #[test]
    fn mod_location_uses_directory_path_directly() {
        let root = temp_dir("mod-location-dir");
        fs::create_dir_all(&root).expect("root dir");

        let location = resolve_mod_location_path(&root).expect("location");

        let _ = fs::remove_dir_all(&root);

        assert_eq!(location, root);
    }

    #[test]
    fn mod_location_uses_parent_for_file_path() {
        let root = temp_dir("mod-location-file");
        fs::create_dir_all(&root).expect("root dir");
        let file = root.join("Helper.zip");
        fs::write(&file, "").expect("mod file");

        let location = resolve_mod_location_path(&file).expect("location");

        let _ = fs::remove_dir_all(&root);

        assert_eq!(location, root);
    }

    #[test]
    fn mod_location_rejects_missing_path() {
        let root = temp_dir("mod-location-missing");

        let error = resolve_mod_location_path(&root).expect_err("missing path");

        assert_eq!(error, "本地内容位置不存在");
    }

    fn temp_dir(label: &str) -> std::path::PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("celepkg-{label}-{stamp}"))
    }
}
