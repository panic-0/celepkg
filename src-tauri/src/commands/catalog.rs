use super::common::{run_blocking, run_with_celeste_path};
use crate::domain::{
    Dependency, EverestReleaseList, ModCatalogDependencyResolutionResult, ModCatalogSearchResult,
    ModMetadata, ModUpdateCheckResult,
};
use crate::services;

#[tauri::command]
pub async fn search_mod_catalog(
    query: String,
    sources: Vec<String>,
) -> Result<ModCatalogSearchResult, String> {
    run_blocking("搜索 Mod 目录任务失败", move || {
        let sources = services::mod_catalog::parse_sources(&sources);
        Ok(services::mod_catalog::search_catalog(&query, &sources))
    })
    .await
}

#[tauri::command]
pub async fn refresh_mod_catalog_cache(
    sources: Vec<String>,
) -> Result<ModCatalogSearchResult, String> {
    run_blocking("刷新 Mod 目录缓存任务失败", move || {
        let sources = services::mod_catalog::parse_sources(&sources);
        Ok(services::mod_catalog::refresh_catalog_cache(&sources))
    })
    .await
}

#[tauri::command]
pub async fn resolve_mod_catalog_dependencies(
    dependencies: Vec<Dependency>,
    sources: Vec<String>,
) -> Result<ModCatalogDependencyResolutionResult, String> {
    run_blocking("解析 Mod 依赖目录任务失败", move || {
        let sources = services::mod_catalog::parse_sources(&sources);
        Ok(services::mod_catalog::resolve_catalog_dependencies(
            &dependencies,
            &sources,
        ))
    })
    .await
}

#[tauri::command]
pub async fn check_mod_updates(
    celeste_path: String,
    sources: Vec<String>,
) -> Result<ModUpdateCheckResult, String> {
    run_with_celeste_path(
        celeste_path,
        "检查 Mod 更新任务失败",
        move |path, state| {
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
        },
    )
    .await
}

#[tauri::command]
pub async fn preview_mod_update_metadata(
    celeste_path: String,
    entry: crate::domain::ModCatalogEntry,
) -> Result<ModMetadata, String> {
    run_with_celeste_path(
        celeste_path,
        "预览 Mod 更新依赖任务失败",
        move |path, _state| services::mod_catalog::preview_update_metadata(&path, &entry),
    )
    .await
}

#[tauri::command]
pub async fn list_everest_releases() -> Result<EverestReleaseList, String> {
    run_blocking("获取 Everest 版本列表任务失败", || {
        Ok(services::everest::list_releases())
    })
    .await
}
