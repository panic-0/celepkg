use crate::domain::{
    AppConfig, ConfigResponse, LaunchResult, ProfileInput, ProfilesState, ScanResult,
};
use crate::services;
use crate::storage::{load_state, resolve_input_path, write_state};

#[tauri::command]
pub fn get_config() -> Result<ConfigResponse, String> {
    let state = load_state();
    Ok(ConfigResponse {
        celeste_path: state.celeste_path.clone(),
        profiles: state.profiles_state(),
    })
}

#[tauri::command]
pub fn set_celeste_path(celeste_path: String) -> Result<AppConfig, String> {
    let mut state = load_state();
    state.celeste_path = celeste_path.trim().to_string();
    write_state(&state)?;
    Ok(AppConfig {
        celeste_path: state.celeste_path,
    })
}

#[tauri::command]
pub async fn scan_celeste(celeste_path: String) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state();
        let path = resolve_input_path(&celeste_path);
        Ok(services::scan::full_scan_cached(
            &path,
            state.profiles_state(),
        ))
    })
    .await
    .map_err(|error| format!("扫描任务失败：{error}"))?
}

#[tauri::command]
pub fn save_profile(profile: ProfileInput) -> Result<ProfilesState, String> {
    services::profile::save_profile(profile)
}

#[tauri::command]
pub async fn apply_profile(celeste_path: String, profile_id: String) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        services::profile::apply_profile(celeste_path, profile_id)
    })
    .await
    .map_err(|error| format!("应用 Profile 任务失败：{error}"))?
}

#[tauri::command]
pub async fn launch_profile(
    celeste_path: String,
    profile_id: String,
) -> Result<LaunchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        services::profile::launch_profile(celeste_path, profile_id)
    })
    .await
    .map_err(|error| format!("启动任务失败：{error}"))?
}
