use super::common::{run_blocking, run_with_celeste_path};
use crate::api_contract::{
    CheckModUpdatesPayload, GetModCatalogStatsPayload, PreviewModUpdateMetadataPayload,
    RefreshModCatalogCachePayload, ResolveModCatalogDependenciesPayload, SearchModCatalogPayload,
};
use crate::domain::{
    EverestReleaseList, GameBananaCatalogStatsResult, ModCatalogDependencyResolutionResult,
    ModCatalogSearchResult, ModMetadata, ModUpdateCheckResult,
};
use crate::services;

#[tauri::command]
pub async fn search_mod_catalog(
    payload: SearchModCatalogPayload,
) -> Result<ModCatalogSearchResult, String> {
    let SearchModCatalogPayload { query, sources } = payload;
    run_blocking("搜索 Mod 目录任务失败", move || {
        Ok(services::mod_catalog::search_catalog(&query, &sources))
    })
    .await
}

#[tauri::command]
pub async fn refresh_mod_catalog_cache(
    payload: RefreshModCatalogCachePayload,
) -> Result<ModCatalogSearchResult, String> {
    let RefreshModCatalogCachePayload { sources } = payload;
    run_blocking("刷新 Mod 目录缓存任务失败", move || {
        Ok(services::mod_catalog::refresh_catalog_cache(&sources))
    })
    .await
}

#[tauri::command]
pub async fn get_mod_catalog_stats(
    payload: GetModCatalogStatsPayload,
) -> Result<GameBananaCatalogStatsResult, String> {
    let GetModCatalogStatsPayload { game_banana_ids } = payload;
    run_blocking("读取 Mod 目录统计任务失败", move || {
        Ok(services::mod_catalog::get_catalog_stats(&game_banana_ids))
    })
    .await
}

#[tauri::command]
pub async fn resolve_mod_catalog_dependencies(
    payload: ResolveModCatalogDependenciesPayload,
) -> Result<ModCatalogDependencyResolutionResult, String> {
    let ResolveModCatalogDependenciesPayload {
        dependencies,
        sources,
    } = payload;
    run_blocking("解析 Mod 依赖目录任务失败", move || {
        Ok(services::mod_catalog::resolve_catalog_dependencies(
            &dependencies,
            &sources,
        ))
    })
    .await
}

#[tauri::command]
pub async fn check_mod_updates(
    payload: CheckModUpdatesPayload,
) -> Result<ModUpdateCheckResult, String> {
    let CheckModUpdatesPayload {
        celeste_path,
        sources,
    } = payload;
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
    payload: PreviewModUpdateMetadataPayload,
) -> Result<ModMetadata, String> {
    let PreviewModUpdateMetadataPayload {
        celeste_path,
        entry,
    } = payload;
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
