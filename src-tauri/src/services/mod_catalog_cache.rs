use crate::domain::{ModCatalogEntry, ModCatalogSourceKind};
use crate::storage::{mod_catalog_cache_path, read_json, write_json};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const MOD_CATALOG_CACHE_TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CachedCatalog {
    pub cached_at: u64,
    pub entries: Vec<ModCatalogEntry>,
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

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
