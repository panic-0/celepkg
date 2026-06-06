use crate::domain::{AppConfig, ConfigResponse, ModCatalogSourceKind};
use crate::services;
use crate::storage::{
    load_state, normalize_configured_celeste_path, normalize_mod_catalog_source_settings,
    resolve_input_path_from_state, resolve_required_celeste_path_from_state, update_state,
};

#[tauri::command]
pub fn get_config() -> Result<ConfigResponse, String> {
    update_state(|state| {
        let warnings = normalize_configured_celeste_path(state)?;
        Ok(config_response(state, warnings))
    })
}

#[tauri::command]
pub fn set_celeste_path(celeste_path: String) -> Result<AppConfig, String> {
    update_state(|state| {
        let path = resolve_required_celeste_path_from_state(&celeste_path, state)?;
        state.celeste_path = path.to_string_lossy().to_string();
        Ok(AppConfig {
            celeste_path: state.celeste_path.clone(),
        })
    })
}

#[tauri::command]
pub fn set_auto_backup_enabled(auto_backup_enabled: bool) -> Result<ConfigResponse, String> {
    update_state(|state| {
        state.auto_backup_enabled = auto_backup_enabled;
        Ok(config_response(state, vec![]))
    })
}

#[tauri::command]
pub fn set_auto_backup_cleanup_enabled(
    auto_backup_cleanup_enabled: bool,
) -> Result<ConfigResponse, String> {
    update_state(|state| {
        state.auto_backup_cleanup_enabled = auto_backup_cleanup_enabled;
        Ok(config_response(state, vec![]))
    })
}

#[tauri::command]
pub fn set_auto_backup_retention_count(
    auto_backup_retention_count: usize,
) -> Result<ConfigResponse, String> {
    if !(1..=100).contains(&auto_backup_retention_count) {
        return Err("自动备份保留数量必须在 1 到 100 之间".to_string());
    }
    update_state(|state| {
        state.auto_backup_retention_count = auto_backup_retention_count;
        Ok(config_response(state, vec![]))
    })
}

#[tauri::command]
pub fn set_mod_catalog_sources(
    mod_catalog_source_order: Vec<ModCatalogSourceKind>,
    mod_catalog_source_enabled_count: usize,
) -> Result<ConfigResponse, String> {
    if mod_catalog_source_order.is_empty() {
        return Err("至少保留一个 Mod 数据源".to_string());
    }
    let (order, enabled_count) = normalize_mod_catalog_source_settings(
        mod_catalog_source_order,
        mod_catalog_source_enabled_count,
    );
    update_state(|state| {
        state.mod_catalog_source_order = order;
        state.mod_catalog_source_enabled_count = enabled_count;
        Ok(config_response(state, vec![]))
    })
}

#[tauri::command]
pub fn set_auto_check_mod_updates_on_startup(
    auto_check_mod_updates_on_startup: bool,
) -> Result<ConfigResponse, String> {
    update_state(|state| {
        state.auto_check_mod_updates_on_startup = auto_check_mod_updates_on_startup;
        Ok(config_response(state, vec![]))
    })
}

#[tauri::command]
pub fn set_auto_check_app_updates_on_startup(
    auto_check_app_updates_on_startup: bool,
) -> Result<ConfigResponse, String> {
    update_state(|state| {
        state.auto_check_app_updates_on_startup = auto_check_app_updates_on_startup;
        Ok(config_response(state, vec![]))
    })
}

#[tauri::command]
pub fn set_auto_refresh_mod_catalog_cache_on_startup(
    auto_refresh_mod_catalog_cache_on_startup: bool,
) -> Result<ConfigResponse, String> {
    update_state(|state| {
        state.auto_refresh_mod_catalog_cache_on_startup = auto_refresh_mod_catalog_cache_on_startup;
        Ok(config_response(state, vec![]))
    })
}

#[tauri::command]
pub fn set_selected_save_files(save_files: Vec<String>) -> Result<ConfigResponse, String> {
    let snapshot = load_state()?;
    let path = resolve_input_path_from_state("", &snapshot);
    let available = services::scan::list_available_save_files(&path);
    let selected_save_files =
        crate::parsers::save_stats::normalize_selected_save_files(&available, &save_files);
    update_state(|state| {
        state.selected_save_files = selected_save_files;
        Ok(config_response(state, vec![]))
    })
}

#[tauri::command]
pub async fn select_celeste_directory() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        Ok(rfd::FileDialog::new()
            .set_title("选择 Celeste 安装目录")
            .pick_folder()
            .map(|path| path.to_string_lossy().to_string()))
    })
    .await
    .map_err(|error| format!("选择目录任务失败：{error}"))?
}

fn config_response(state: &crate::storage::AppState, warnings: Vec<String>) -> ConfigResponse {
    ConfigResponse {
        celeste_path: state.celeste_path.clone(),
        auto_backup_enabled: state.auto_backup_enabled,
        auto_backup_cleanup_enabled: state.auto_backup_cleanup_enabled,
        auto_backup_retention_count: state.auto_backup_retention_count,
        mod_catalog_source_order: state.mod_catalog_source_order.clone(),
        mod_catalog_source_enabled_count: state.mod_catalog_source_enabled_count,
        auto_check_mod_updates_on_startup: state.auto_check_mod_updates_on_startup,
        auto_check_app_updates_on_startup: state.auto_check_app_updates_on_startup,
        auto_refresh_mod_catalog_cache_on_startup: state.auto_refresh_mod_catalog_cache_on_startup,
        selected_save_files: state.selected_save_files.clone(),
        profiles: state.profiles_state(),
        warnings,
    }
}
