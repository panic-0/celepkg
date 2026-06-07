use super::common::run_blocking;
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
    run_blocking("应用 Profile 任务失败", move || {
        services::profile::apply_profile(celeste_path, map_profile_id, mod_profile_id)
    })
    .await
}

#[tauri::command]
pub async fn launch_profile(
    celeste_path: String,
    map_profile_id: String,
    mod_profile_id: String,
) -> Result<LaunchResult, String> {
    run_blocking("启动任务失败", move || {
        services::profile::launch_profile(celeste_path, map_profile_id, mod_profile_id)
    })
    .await
}

#[tauri::command]
pub async fn launch_game(
    celeste_path: String,
    launch_args: String,
) -> Result<LaunchResult, String> {
    run_blocking("启动任务失败", move || {
        services::profile::launch_game(celeste_path, launch_args)
    })
    .await
}
