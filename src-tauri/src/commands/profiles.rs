use crate::domain::{LaunchResult, ProfileInput, ProfilesState, ScanResult};
use crate::services;

#[tauri::command]
pub fn save_profile(profile: ProfileInput) -> Result<ProfilesState, String> {
    services::profile::save_profile(profile)
}

#[tauri::command]
pub fn delete_profile(profile_id: String) -> Result<ProfilesState, String> {
    services::profile::delete_profile(profile_id)
}

#[tauri::command]
pub async fn apply_profile(
    celeste_path: String,
    map_profile_id: String,
    mod_profile_id: String,
) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        services::profile::apply_profile(celeste_path, map_profile_id, mod_profile_id)
    })
    .await
    .map_err(|error| format!("应用 Profile 任务失败：{error}"))?
}

#[tauri::command]
pub async fn launch_profile(
    celeste_path: String,
    map_profile_id: String,
    mod_profile_id: String,
) -> Result<LaunchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        services::profile::launch_profile(celeste_path, map_profile_id, mod_profile_id)
    })
    .await
    .map_err(|error| format!("启动任务失败：{error}"))?
}

#[tauri::command]
pub async fn launch_game(
    celeste_path: String,
    launch_args: String,
) -> Result<LaunchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        services::profile::launch_game(celeste_path, launch_args)
    })
    .await
    .map_err(|error| format!("启动任务失败：{error}"))?
}
