use super::common::run_blocking;
use crate::api_contract::{
    ApplyProfilePayload, DeleteProfilePayload, LaunchGamePayload, LaunchProfilePayload,
    SaveProfilePayload,
};
use crate::domain::{LaunchResult, ProfilesState, ScanResult};
use crate::services;

#[tauri::command]
pub fn save_profile(payload: SaveProfilePayload) -> Result<ProfilesState, String> {
    let SaveProfilePayload { profile } = payload;
    services::profile::save_profile(profile)
}

#[tauri::command]
pub fn delete_profile(payload: DeleteProfilePayload) -> Result<ProfilesState, String> {
    let DeleteProfilePayload { profile_id } = payload;
    services::profile::delete_profile(profile_id)
}

#[tauri::command]
pub async fn apply_profile(payload: ApplyProfilePayload) -> Result<ScanResult, String> {
    let ApplyProfilePayload {
        celeste_path,
        map_profile_id,
        mod_profile_id,
    } = payload;
    run_blocking("应用 Profile 任务失败", move || {
        services::profile::apply_profile(celeste_path, map_profile_id, mod_profile_id)
    })
    .await
}

#[tauri::command]
pub async fn launch_profile(payload: LaunchProfilePayload) -> Result<LaunchResult, String> {
    let LaunchProfilePayload {
        celeste_path,
        map_profile_id,
        mod_profile_id,
    } = payload;
    run_blocking("启动任务失败", move || {
        services::profile::launch_profile(celeste_path, map_profile_id, mod_profile_id)
    })
    .await
}

#[tauri::command]
pub async fn launch_game(payload: LaunchGamePayload) -> Result<LaunchResult, String> {
    let LaunchGamePayload {
        celeste_path,
        launch_args,
    } = payload;
    run_blocking("启动任务失败", move || {
        services::profile::launch_game(celeste_path, launch_args)
    })
    .await
}
