use crate::domain::{
    AppConfig, BackupInfo, ConfigResponse, EverestInstallResult, EverestRelease,
    EverestReleaseList, LaunchResult, ModCatalogSearchResult, ModCatalogSourceKind,
    ModDownloadProgress, ModInstallResult, ModMetadata, ModUpdateCheckResult, ProfileInput,
    ProfilesState, ScanResult, StagedDownload,
};
use crate::services;
use crate::storage::{
    load_state, normalize_configured_celeste_path, normalize_mod_catalog_source_settings,
    resolve_input_path_from_state, resolve_required_celeste_path,
    resolve_required_celeste_path_from_state, write_state,
};
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, LazyLock, Mutex,
};
use tauri::Emitter;

static MOD_DOWNLOAD_CANCEL_FLAGS: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub fn get_config() -> Result<ConfigResponse, String> {
    let mut state = load_state()?;
    let warnings = normalize_configured_celeste_path(&mut state)?;
    Ok(config_response(&state, warnings))
}

#[tauri::command]
pub fn set_celeste_path(celeste_path: String) -> Result<AppConfig, String> {
    let mut state = load_state()?;
    let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
    state.celeste_path = path.to_string_lossy().to_string();
    write_state(&state)?;
    Ok(AppConfig {
        celeste_path: state.celeste_path,
    })
}

#[tauri::command]
pub fn set_auto_backup_enabled(auto_backup_enabled: bool) -> Result<ConfigResponse, String> {
    let mut state = load_state()?;
    state.auto_backup_enabled = auto_backup_enabled;
    write_state(&state)?;
    Ok(config_response(&state, vec![]))
}

#[tauri::command]
pub fn set_auto_backup_cleanup_enabled(
    auto_backup_cleanup_enabled: bool,
) -> Result<ConfigResponse, String> {
    let mut state = load_state()?;
    state.auto_backup_cleanup_enabled = auto_backup_cleanup_enabled;
    write_state(&state)?;
    Ok(config_response(&state, vec![]))
}

#[tauri::command]
pub fn set_auto_backup_retention_count(
    auto_backup_retention_count: usize,
) -> Result<ConfigResponse, String> {
    if !(1..=100).contains(&auto_backup_retention_count) {
        return Err("自动备份保留数量必须在 1 到 100 之间".to_string());
    }
    let mut state = load_state()?;
    state.auto_backup_retention_count = auto_backup_retention_count;
    write_state(&state)?;
    Ok(config_response(&state, vec![]))
}

#[tauri::command]
pub fn set_mod_catalog_sources(
    mod_catalog_source_order: Vec<ModCatalogSourceKind>,
    mod_catalog_source_enabled_count: usize,
) -> Result<ConfigResponse, String> {
    if mod_catalog_source_order.is_empty() {
        return Err("至少保留一个 Mod 数据源".to_string());
    }
    let mut state = load_state()?;
    let (order, enabled_count) = normalize_mod_catalog_source_settings(
        mod_catalog_source_order,
        mod_catalog_source_enabled_count,
    );
    state.mod_catalog_source_order = order;
    state.mod_catalog_source_enabled_count = enabled_count;
    write_state(&state)?;
    Ok(config_response(&state, vec![]))
}

#[tauri::command]
pub fn set_auto_check_mod_updates_on_startup(
    auto_check_mod_updates_on_startup: bool,
) -> Result<ConfigResponse, String> {
    let mut state = load_state()?;
    state.auto_check_mod_updates_on_startup = auto_check_mod_updates_on_startup;
    write_state(&state)?;
    Ok(config_response(&state, vec![]))
}

#[tauri::command]
pub fn set_auto_refresh_mod_catalog_cache_on_startup(
    auto_refresh_mod_catalog_cache_on_startup: bool,
) -> Result<ConfigResponse, String> {
    let mut state = load_state()?;
    state.auto_refresh_mod_catalog_cache_on_startup = auto_refresh_mod_catalog_cache_on_startup;
    write_state(&state)?;
    Ok(config_response(&state, vec![]))
}

#[tauri::command]
pub fn set_selected_save_files(save_files: Vec<String>) -> Result<ConfigResponse, String> {
    let mut state = load_state()?;
    let path = resolve_input_path_from_state("", &state);
    let available = services::scan::list_available_save_files(&path);
    state.selected_save_files =
        crate::parsers::save_stats::normalize_selected_save_files(&available, &save_files);
    write_state(&state)?;
    Ok(config_response(&state, vec![]))
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

#[tauri::command]
pub async fn search_mod_catalog(
    query: String,
    sources: Vec<String>,
) -> Result<ModCatalogSearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let sources = services::mod_catalog::parse_sources(&sources);
        Ok(services::mod_catalog::search_catalog(&query, &sources))
    })
    .await
    .map_err(|error| format!("搜索 Mod 目录任务失败：{error}"))?
}

#[tauri::command]
pub async fn refresh_mod_catalog_cache(
    sources: Vec<String>,
) -> Result<ModCatalogSearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let sources = services::mod_catalog::parse_sources(&sources);
        Ok(services::mod_catalog::refresh_catalog_cache(&sources))
    })
    .await
    .map_err(|error| format!("刷新 Mod 目录缓存任务失败：{error}"))?
}

#[tauri::command]
pub async fn check_mod_updates(
    celeste_path: String,
    sources: Vec<String>,
) -> Result<ModUpdateCheckResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        let scan = services::scan::full_scan_fresh(
            &path,
            state.profiles_state(),
            &state.protected_record_ids,
            &state.selected_save_files,
        );
        let sources = services::mod_catalog::parse_sources(&sources);
        let records = scan
            .maps
            .iter()
            .chain(scan.other_mods.iter())
            .cloned()
            .collect::<Vec<_>>();
        Ok(services::mod_catalog::check_updates(&records, &sources))
    })
    .await
    .map_err(|error| format!("检查 Mod 更新任务失败：{error}"))?
}

#[tauri::command]
pub async fn preview_mod_update_metadata(
    celeste_path: String,
    entry: crate::domain::ModCatalogEntry,
) -> Result<ModMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        services::mod_catalog::preview_update_metadata(&path, &entry)
    })
    .await
    .map_err(|error| format!("预览 Mod 更新依赖任务失败：{error}"))?
}

#[tauri::command]
pub async fn list_everest_releases() -> Result<EverestReleaseList, String> {
    tauri::async_runtime::spawn_blocking(services::everest::list_releases)
        .await
        .map_err(|error| format!("获取 Everest 版本列表任务失败：{error}"))
}

#[tauri::command]
pub async fn download_everest_to_staging(
    app: tauri::AppHandle,
    celeste_path: String,
    release: EverestRelease,
    operation_id: String,
) -> Result<StagedDownload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        let app_for_progress = app.clone();
        let emit_progress = move |progress: ModDownloadProgress| {
            let _ = app_for_progress.emit("mod-download-progress", progress);
        };
        let cancel_flag = register_mod_download(&operation_id);
        let result = services::everest::download_to_staging(
            &path,
            &release,
            services::mod_catalog::ModDownloadReporter {
                operation_id: &operation_id,
                progress: Some(&emit_progress),
                cancel_token: Some(&cancel_flag),
                task_index: 1,
                task_total: 1,
            },
        );
        unregister_mod_download(&operation_id);
        if result.is_err() {
            emit_download_error(&app, operation_id, "Everest".to_string(), 1, 1);
        }
        result
    })
    .await
    .map_err(|error| format!("下载 Everest 任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_staged_everest(
    celeste_path: String,
    staged_id: String,
    release: EverestRelease,
) -> Result<EverestInstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        services::everest::install_staged_release(
            &path,
            &staged_id,
            release,
            state.profiles_state(),
            &state.protected_record_ids,
            &state.selected_save_files,
            None,
        )
    })
    .await
    .map_err(|error| format!("安装 staged Everest 任务失败：{error}"))?
}

#[tauri::command]
pub async fn download_mod_to_staging(
    app: tauri::AppHandle,
    celeste_path: String,
    entry: crate::domain::ModCatalogEntry,
    operation_id: String,
    task_index: usize,
    task_total: usize,
) -> Result<StagedDownload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        let app_for_progress = app.clone();
        let emit_progress = move |progress: ModDownloadProgress| {
            let _ = app_for_progress.emit("mod-download-progress", progress);
        };
        let cancel_flag = register_mod_download(&operation_id);
        let result = services::mod_catalog::download_to_staging(
            &path,
            &entry,
            services::mod_catalog::ModDownloadReporter {
                operation_id: &operation_id,
                progress: Some(&emit_progress),
                cancel_token: Some(&cancel_flag),
                task_index,
                task_total,
            },
        );
        unregister_mod_download(&operation_id);
        if result.is_err() {
            emit_download_error(&app, operation_id, entry.name, task_index, task_total);
        }
        result
    })
    .await
    .map_err(|error| format!("下载 Mod 任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_staged_mod(
    celeste_path: String,
    staged_id: String,
    entry: crate::domain::ModCatalogEntry,
    installed_path: Option<String>,
) -> Result<ModInstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
        services::mod_catalog::install_staged(
            &path,
            &staged_id,
            entry,
            installed_path.as_deref().map(Path::new),
            services::mod_catalog::ModInstallContext {
                profiles: state.profiles_state(),
                protected_record_ids: &state.protected_record_ids,
                selected_save_files: &state.selected_save_files,
                reporter: None,
            },
        )
    })
    .await
    .map_err(|error| format!("安装 staged Mod 任务失败：{error}"))?
}

#[tauri::command]
pub fn cancel_mod_download(operation_id: String) -> Result<bool, String> {
    let flags = MOD_DOWNLOAD_CANCEL_FLAGS
        .lock()
        .map_err(|_| "取消下载状态不可用".to_string())?;
    let Some(flag) = flags.get(&operation_id) else {
        return Ok(false);
    };
    flag.store(true, Ordering::Relaxed);
    Ok(true)
}

fn emit_download_error(
    app: &tauri::AppHandle,
    operation_id: String,
    mod_name: String,
    task_index: usize,
    task_total: usize,
) {
    let _ = app.emit(
        "mod-download-progress",
        ModDownloadProgress {
            operation_id,
            mod_name,
            phase: "error".to_string(),
            downloaded: 0,
            total: None,
            speed_bytes_per_sec: 0.0,
            task_index,
            task_total,
            url: String::new(),
        },
    );
}

fn register_mod_download(operation_id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut flags) = MOD_DOWNLOAD_CANCEL_FLAGS.lock() {
        flags.insert(operation_id.to_string(), Arc::clone(&flag));
    }
    flag
}

fn unregister_mod_download(operation_id: &str) {
    if let Ok(mut flags) = MOD_DOWNLOAD_CANCEL_FLAGS.lock() {
        flags.remove(operation_id);
    }
}

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
        let mut state = load_state()?;
        let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
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
    .map_err(|error| format!("更新始终启用任务失败：{error}"))?
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
        let path = resolve_required_celeste_path(&celeste_path)?;
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
        let path = resolve_required_celeste_path("")?;
        services::backup::list_backups(&path)
    })
    .await
    .map_err(|error| format!("读取备份任务失败：{error}"))?
}

#[tauri::command]
pub async fn restore_backup(backup_id: String, scope: String) -> Result<BackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_required_celeste_path("")?;
        services::backup::restore_backup(&path, &backup_id, &scope)
    })
    .await
    .map_err(|error| format!("还原任务失败：{error}"))?
}

#[tauri::command]
pub async fn delete_backup(backup_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_required_celeste_path("")?;
        services::backup::delete_backup(&path, &backup_id)
    })
    .await
    .map_err(|error| format!("删除备份任务失败：{error}"))?
}

#[tauri::command]
pub async fn cleanup_auto_backups() -> Result<Vec<BackupInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let state = load_state()?;
        let path = resolve_required_celeste_path_from_state("", &state)?;
        if state.auto_backup_cleanup_enabled {
            services::backup::cleanup_auto_backups(&path, state.auto_backup_retention_count)
        } else {
            services::backup::list_backups(&path)
        }
    })
    .await
    .map_err(|error| format!("清理备份任务失败：{error}"))?
}

#[tauri::command]
pub async fn open_backup_folder(celeste_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = resolve_required_celeste_path(&celeste_path)?;
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

fn config_response(state: &crate::storage::AppState, warnings: Vec<String>) -> ConfigResponse {
    ConfigResponse {
        celeste_path: state.celeste_path.clone(),
        auto_backup_enabled: state.auto_backup_enabled,
        auto_backup_cleanup_enabled: state.auto_backup_cleanup_enabled,
        auto_backup_retention_count: state.auto_backup_retention_count,
        mod_catalog_source_order: state.mod_catalog_source_order.clone(),
        mod_catalog_source_enabled_count: state.mod_catalog_source_enabled_count,
        auto_check_mod_updates_on_startup: state.auto_check_mod_updates_on_startup,
        auto_refresh_mod_catalog_cache_on_startup: state.auto_refresh_mod_catalog_cache_on_startup,
        selected_save_files: state.selected_save_files.clone(),
        profiles: state.profiles_state(),
        warnings,
    }
}
