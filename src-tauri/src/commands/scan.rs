use crate::domain::ScanResult;
use crate::services;
use crate::storage::{load_state, resolve_input_path_from_state};

#[tauri::command]
pub async fn scan_celeste(celeste_path: String) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_input_path_from_state(&celeste_path, &state);
        Ok(services::scan::full_scan_cached(
            &path,
            state.profiles_state(),
            &state.protected_record_ids,
            &state.selected_save_files,
        ))
    })
    .await
    .map_err(|error| format!("扫描任务失败：{error}"))?
}

#[tauri::command]
pub async fn rescan_celeste(celeste_path: String) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_input_path_from_state(&celeste_path, &state);
        Ok(services::scan::full_scan_fresh(
            &path,
            state.profiles_state(),
            &state.protected_record_ids,
            &state.selected_save_files,
        ))
    })
    .await
    .map_err(|error| format!("重新扫描任务失败：{error}"))?
}
