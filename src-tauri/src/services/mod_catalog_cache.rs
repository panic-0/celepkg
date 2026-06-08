use crate::domain::{GameBananaCatalogStats, ModCatalogEntry, ModCatalogSourceKind};
use crate::storage::{
    game_banana_catalog_stats_cache_path, mod_catalog_cache_path, read_json, write_json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

const MOD_CATALOG_CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const GAME_BANANA_CATALOG_STATS_CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CachedCatalog {
    pub cached_at: u64,
    pub entries: Vec<ModCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CachedGameBananaCatalogStatsEntry {
    pub cached_at: u64,
    pub stats: GameBananaCatalogStats,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedGameBananaCatalogStats {
    entries: Vec<CachedGameBananaCatalogStatsEntry>,
}

pub(super) fn read_valid_catalog_cache(source: ModCatalogSourceKind) -> Option<CachedCatalog> {
    let cache = read_catalog_cache(source)?;
    let age = now_secs().saturating_sub(cache.cached_at);
    if age <= MOD_CATALOG_CACHE_TTL.as_secs() {
        Some(cache)
    } else {
        None
    }
}

pub(super) fn read_catalog_cache(source: ModCatalogSourceKind) -> Option<CachedCatalog> {
    let cache: CachedCatalog = read_json(&mod_catalog_cache_path(source))?;
    if cache.entries.is_empty() {
        return None;
    }
    Some(cache)
}

pub(super) fn write_catalog_cache(source: ModCatalogSourceKind, entries: &[ModCatalogEntry]) {
    if entries.is_empty() {
        return;
    }
    let cache = CachedCatalog {
        cached_at: now_secs(),
        entries: entries.to_vec(),
    };
    let _ = write_json(&mod_catalog_cache_path(source), &cache);
}

pub(super) fn read_game_banana_catalog_stats_cache(
) -> HashMap<u64, CachedGameBananaCatalogStatsEntry> {
    let cache: CachedGameBananaCatalogStats =
        read_json(&game_banana_catalog_stats_cache_path()).unwrap_or_default();
    cache
        .entries
        .into_iter()
        .map(|entry| (entry.stats.game_banana_id, entry))
        .collect()
}

pub(super) fn write_game_banana_catalog_stats_cache(
    entries: &HashMap<u64, CachedGameBananaCatalogStatsEntry>,
) {
    let mut entries = entries.values().cloned().collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.stats.game_banana_id);
    let cache = CachedGameBananaCatalogStats { entries };
    let _ = write_json(&game_banana_catalog_stats_cache_path(), &cache);
}

pub(super) fn cached_game_banana_catalog_stats_is_valid(
    entry: &CachedGameBananaCatalogStatsEntry,
) -> bool {
    now_secs().saturating_sub(entry.cached_at) <= GAME_BANANA_CATALOG_STATS_CACHE_TTL.as_secs()
}

pub(super) fn game_banana_catalog_stats_cache_entry(
    stats: GameBananaCatalogStats,
) -> CachedGameBananaCatalogStatsEntry {
    CachedGameBananaCatalogStatsEntry {
        cached_at: now_secs(),
        stats,
    }
}

pub(super) fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
