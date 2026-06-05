use crate::domain::ScanResult;
use crate::services;
use crate::storage::{load_state, resolve_required_celeste_path_from_state, update_state};

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
