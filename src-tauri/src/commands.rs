use crate::domain::{
    AppConfig, BackupInfo, ConfigResponse, LaunchResult, ProfileInput, ProfilesState, ScanResult,
};
use crate::services;
use crate::storage::{load_state, resolve_input_path, resolve_input_path_from_state, write_state};
use std::path::Path;
use std::process::Command;

#[tauri::command]
pub fn get_config() -> Result<ConfigResponse, String> {
    let state = load_state();
    Ok(ConfigResponse {
        celeste_path: state.celeste_path.clone(),
        auto_backup_enabled: state.auto_backup_enabled,
        selected_save_files: state.selected_save_files.clone(),
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
pub fn set_auto_backup_enabled(auto_backup_enabled: bool) -> Result<ConfigResponse, String> {
    let mut state = load_state();
    state.auto_backup_enabled = auto_backup_enabled;
    write_state(&state)?;
    Ok(ConfigResponse {
        celeste_path: state.celeste_path.clone(),
        auto_backup_enabled: state.auto_backup_enabled,
        selected_save_files: state.selected_save_files.clone(),
        profiles: state.profiles_state(),
    })
}

#[tauri::command]
pub fn set_selected_save_files(save_files: Vec<String>) -> Result<ConfigResponse, String> {
    let mut state = load_state();
    let path = resolve_input_path_from_state("", &state);
    let available = services::scan::list_available_save_files(&path);
    state.selected_save_files =
        crate::parsers::save_stats::normalize_selected_save_files(&available, &save_files);
    write_state(&state)?;
    Ok(ConfigResponse {
        celeste_path: state.celeste_path.clone(),
        auto_backup_enabled: state.auto_backup_enabled,
        selected_save_files: state.selected_save_files.clone(),
        profiles: state.profiles_state(),
    })
}

#[tauri::command]
pub async fn scan_celeste(celeste_path: String) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state();
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
        let state = load_state();
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

#[tauri::command]
pub async fn set_record_favorite(
    celeste_path: String,
    record_id: String,
    favorite: bool,
) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state();
        let path = resolve_input_path_from_state(&celeste_path, &state);
        let mut scan = services::scan::full_scan_cached(
            &path,
            state.profiles_state(),
            &state.protected_record_ids,
            &state.selected_save_files,
        );
        services::backup::create_auto_backup_if_enabled(&path, state.auto_backup_enabled)?;
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
        let mut state = load_state();
        let path = resolve_input_path_from_state(&celeste_path, &state);
        let mut scan = services::scan::full_scan_cached(
            &path,
            state.profiles_state(),
            &state.protected_record_ids,
            &state.selected_save_files,
        );
        services::scan::set_scan_protected_state(&mut scan, &record_id, protected)?;
        if protected {
            if !state.protected_record_ids.contains(&record_id) {
                state.protected_record_ids.push(record_id);
            }
        } else {
            state.protected_record_ids.retain(|id| id != &record_id);
        }
        state.protected_record_ids.sort();
        state.protected_record_ids.dedup();
        write_state(&state)?;
        services::scan::write_scan_cache(&path, &scan);
        Ok(scan)
    })
    .await
    .map_err(|error| format!("更新 Protected 任务失败：{error}"))?
}

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

#[tauri::command]
pub async fn create_backup(celeste_path: String, kind: String) -> Result<BackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_input_path(&celeste_path);
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
        let path = resolve_input_path("");
        services::backup::list_backups(&path)
    })
    .await
    .map_err(|error| format!("读取备份任务失败：{error}"))?
}

#[tauri::command]
pub async fn restore_backup(backup_id: String, scope: String) -> Result<BackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_input_path("");
        services::backup::restore_backup(&path, &backup_id, &scope)
    })
    .await
    .map_err(|error| format!("还原任务失败：{error}"))?
}

#[tauri::command]
pub async fn open_backup_folder(celeste_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_input_path(&celeste_path);
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
        let path = Path::new(&backup_path);
        if !path.is_dir() {
            return Err("备份目录不存在".to_string());
        }
        open_directory(path)
    })
    .await
    .map_err(|error| format!("打开备份位置任务失败：{error}"))?
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
