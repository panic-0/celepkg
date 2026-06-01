use crate::domain::{LaunchResult, Profile, ProfileInput, ProfilesState, ScanResult};
use crate::services::game::{resolve_game_executable, split_launch_args};
use crate::services::scan::{full_scan_cached, write_profile_blacklist};
use crate::storage::{load_state, resolve_input_path, write_state};
use crate::utils::{now_string, stable_id};
use std::path::PathBuf;
use std::process::Command;

pub fn save_profile(profile: ProfileInput) -> Result<ProfilesState, String> {
    let mut state = load_state();
    let mut data = state.profiles_state();
    let now = now_string();
    let id = profile
        .id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| stable_id(&format!("{}-{now}", profile.name)));
    let normalized = Profile {
        id: id.clone(),
        name: if profile.name.trim().is_empty() {
            "未命名地图组".to_string()
        } else {
            profile.name.trim().to_string()
        },
        enabled_map_ids: profile.enabled_map_ids,
        enabled_mod_ids: profile.enabled_mod_ids,
        launch_args: profile.launch_args.unwrap_or_default(),
        created_at: profile.created_at.unwrap_or_else(|| now.clone()),
        updated_at: now,
    };
    if let Some(index) = data.profiles.iter().position(|item| item.id == id) {
        data.profiles[index] = normalized;
    } else {
        data.profiles.push(normalized);
    }
    data.active_profile_id = id;
    state.set_profiles_state(data.clone());
    write_state(&state)?;
    Ok(data)
}

pub fn apply_profile(celeste_path: String, profile_id: String) -> Result<ScanResult, String> {
    let applied = apply_profile_to_blacklist(celeste_path, profile_id)?;
    Ok(full_scan_cached(&applied.path, applied.profiles))
}

pub fn launch_profile(celeste_path: String, profile_id: String) -> Result<LaunchResult, String> {
    let applied = apply_profile_to_blacklist(celeste_path, profile_id)?;
    let executable = resolve_game_executable(&applied.path);
    if executable.is_empty() {
        return Err("没有找到 Celeste 可执行文件".to_string());
    }
    let args = split_launch_args(&applied.profile.launch_args);
    Command::new(&executable)
        .args(args)
        .current_dir(&applied.path)
        .spawn()
        .map_err(|error| format!("启动失败：{error}"))?;
    Ok(LaunchResult {
        launched: true,
        executable,
        profile_id: applied.profile.id,
    })
}

struct AppliedProfile {
    path: PathBuf,
    profile: Profile,
    profiles: ProfilesState,
}

fn apply_profile_to_blacklist(
    celeste_path: String,
    profile_id: String,
) -> Result<AppliedProfile, String> {
    let path = resolve_input_path(&celeste_path);
    let mut state = load_state();
    let mut profiles = state.profiles_state();
    let profile = profiles
        .profiles
        .iter()
        .find(|item| item.id == profile_id)
        .cloned()
        .ok_or_else(|| "Profile 不存在".to_string())?;
    let scan = full_scan_cached(&path, profiles.clone());
    let enabled_map_ids = profile.enabled_map_ids.clone().unwrap_or_else(|| {
        scan.maps
            .iter()
            .filter(|map| map.enabled)
            .map(|map| map.id.clone())
            .collect()
    });
    let enabled_mod_ids = profile.enabled_mod_ids.clone().unwrap_or_else(|| {
        scan.other_mods
            .iter()
            .filter(|mod_item| mod_item.enabled)
            .map(|mod_item| mod_item.id.clone())
            .collect()
    });
    write_profile_blacklist(&path, &enabled_map_ids, &enabled_mod_ids, &scan)?;
    profiles.active_profile_id = profile.id.clone();
    state.set_profiles_state(profiles.clone());
    write_state(&state)?;
    Ok(AppliedProfile {
        path,
        profile,
        profiles,
    })
}
