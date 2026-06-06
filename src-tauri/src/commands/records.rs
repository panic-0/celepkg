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
        let state = load_state()?;
        let celeste_path = resolve_required_celeste_path_from_state("", &state)?;
        let location = resolve_mod_location_path(Path::new(&absolute_path), &celeste_path)?;
        open_directory(&location)
    })
    .await
    .map_err(|error| format!("打开本地内容位置任务失败：{error}"))?
}

fn resolve_mod_location_path(path: &Path, celeste_path: &Path) -> Result<PathBuf, String> {
    let location = if path.is_dir() {
        path.to_path_buf()
    } else if path.is_file() {
        path.parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "本地内容位置不存在".to_string())?
    } else {
        return Err("本地内容位置不存在".to_string());
    };
    ensure_mod_location_allowed(&location, celeste_path)?;
    Ok(location)
}

fn ensure_mod_location_allowed(location: &Path, celeste_path: &Path) -> Result<(), String> {
    let canonical_location = location
        .canonicalize()
        .map_err(|error| format!("读取本地内容位置失败：{error}"))?;
    let allowed_roots = [celeste_path.join("Mods"), celeste_path.join("Content")];
    for root in allowed_roots {
        let Ok(canonical_root) = root.canonicalize() else {
            continue;
        };
        if canonical_location.starts_with(canonical_root) {
            return Ok(());
        }
    }
    Err("只能打开当前 Celeste 目录中的本地内容位置".to_string())
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
    use std::path::Path;
    use std::time::UNIX_EPOCH;

    #[test]
    fn mod_location_uses_mod_directory_path_directly() {
        let root = temp_dir("mod-location-dir");
        let mods = root.join("Mods");
        let helper = mods.join("Helper");
        fs::create_dir_all(&helper).expect("helper dir");

        let location = resolve_mod_location_path(&helper, &root).expect("location");

        let _ = fs::remove_dir_all(&root);

        assert_eq!(location, helper);
    }

    #[test]
    fn mod_location_uses_parent_for_file_path() {
        let root = temp_dir("mod-location-file");
        let mods = root.join("Mods");
        fs::create_dir_all(&mods).expect("mods dir");
        let file = mods.join("Helper.zip");
        fs::write(&file, "").expect("mod file");

        let location = resolve_mod_location_path(&file, &root).expect("location");

        let _ = fs::remove_dir_all(&root);

        assert_eq!(location, mods);
    }

    #[test]
    fn mod_location_accepts_official_content_path() {
        let root = temp_dir("mod-location-content");
        let maps = root.join("Content").join("Maps");
        fs::create_dir_all(&maps).expect("content maps dir");

        let location = resolve_mod_location_path(&maps, &root).expect("location");

        let _ = fs::remove_dir_all(&root);

        assert_eq!(location, maps);
    }

    #[test]
    fn mod_location_rejects_outside_path() {
        let root = temp_dir("mod-location-root");
        let outside = temp_dir("mod-location-outside");
        fs::create_dir_all(root.join("Mods")).expect("mods dir");
        fs::create_dir_all(&outside).expect("outside dir");

        let error = resolve_mod_location_path(&outside, &root).expect_err("outside path");

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);

        assert_eq!(error, "只能打开当前 Celeste 目录中的本地内容位置");
    }

    #[test]
    fn mod_location_rejects_missing_path() {
        let root = temp_dir("mod-location-missing");

        let error =
            resolve_mod_location_path(Path::new("missing"), &root).expect_err("missing path");

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
