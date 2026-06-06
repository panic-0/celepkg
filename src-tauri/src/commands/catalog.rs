use crate::domain::{
    Dependency, EverestReleaseList, ModCatalogDependencyResolutionResult, ModCatalogSearchResult,
    ModMetadata, ModUpdateCheckResult,
};
use crate::services;
use crate::storage::{load_state, resolve_required_celeste_path_from_state};

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
pub async fn resolve_mod_catalog_dependencies(
    dependencies: Vec<Dependency>,
    sources: Vec<String>,
) -> Result<ModCatalogDependencyResolutionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let sources = services::mod_catalog::parse_sources(&sources);
        Ok(services::mod_catalog::resolve_catalog_dependencies(
            &dependencies,
            &sources,
        ))
    })
    .await
    .map_err(|error| format!("解析 Mod 依赖目录任务失败：{error}"))?
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
