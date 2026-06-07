use crate::domain::{InstalledModMatch, ModCatalogEntry, ModRecord};
use crate::storage::{installed_mod_hash_cache_path, read_json, write_json};
use crate::utils::normalize_dependency_name;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

const INSTALLED_MOD_HASH_CACHE_VERSION: u32 = 1;

pub(super) struct InstalledModIndex {
    mods: HashMap<String, InstalledModMatch>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct InstalledModHashCache {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    pub(super) entries: HashMap<String, InstalledModHashCacheEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct InstalledModHashCacheEntry {
    pub(super) len: u64,
    pub(super) modified: u128,
    pub(super) hash: String,
}

impl InstalledModHashCache {
    pub(super) fn current() -> Self {
        Self {
            version: INSTALLED_MOD_HASH_CACHE_VERSION,
            entries: HashMap::new(),
        }
    }

    fn read(cache_path: &Path) -> Self {
        let Some(cache) = read_json::<InstalledModHashCache>(cache_path) else {
            return Self::current();
        };
        if cache.version == INSTALLED_MOD_HASH_CACHE_VERSION {
            cache
        } else {
            Self::current()
        }
    }

    fn hash_for_path(&mut self, cache_key: &str, path: &Path) -> Result<String, String> {
        let stamp = file_hash_stamp(path)?;
        if let Some(entry) = self.entries.get(cache_key) {
            if entry.len == stamp.len && entry.modified == stamp.modified {
                return Ok(entry.hash.clone());
            }
        }

        let hash = super::xxh64_file(path)?;
        self.entries.insert(
            cache_key.to_string(),
            InstalledModHashCacheEntry {
                len: stamp.len,
                modified: stamp.modified,
                hash: hash.clone(),
            },
        );
        Ok(hash)
    }

    fn retain_keys(&mut self, keys: &HashSet<String>) {
        self.entries.retain(|key, _| keys.contains(key));
    }

    fn write_if_changed(&self, cache_path: &Path, previous: &Self) {
        if self != previous {
            let _ = write_json(cache_path, self);
        }
    }
}

pub(super) struct FileHashStamp {
    pub(super) len: u64,
    pub(super) modified: u128,
}

pub(super) fn file_hash_stamp(path: &Path) -> Result<FileHashStamp, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("读取文件信息失败：{error}"))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    Ok(FileHashStamp {
        len: metadata.len(),
        modified,
    })
}

impl InstalledModIndex {
    pub(super) fn new(records: &[ModRecord]) -> Self {
        Self::new_with_cache_path(records, &installed_mod_hash_cache_path())
    }

    pub(super) fn new_with_cache_path(records: &[ModRecord], cache_path: &Path) -> Self {
        let mut hash_cache = InstalledModHashCache::read(cache_path);
        let previous_hash_cache = hash_cache.clone();
        let mut seen_hash_keys = HashSet::new();
        let mut mods = HashMap::new();
        for record in records {
            if !record.is_archive || record.read_only {
                continue;
            }
            let path = Path::new(&record.absolute_path);
            let cache_key = record.absolute_path.clone();
            let Ok(hash) = hash_cache.hash_for_path(&cache_key, path) else {
                continue;
            };
            seen_hash_keys.insert(cache_key);
            let installed = InstalledModMatch {
                record_id: record.id.clone(),
                name: record.name.clone(),
                file_name: record.file_name.clone(),
                relative_path: record.relative_path.clone(),
                absolute_path: record.absolute_path.clone(),
                version: record.metadata.version.clone(),
                hash,
            };
            for key in installed_keys(record) {
                mods.entry(key).or_insert_with(|| installed.clone());
            }
        }
        hash_cache.retain_keys(&seen_hash_keys);
        hash_cache.write_if_changed(cache_path, &previous_hash_cache);
        Self { mods }
    }

    pub(super) fn find(&self, entry: &ModCatalogEntry) -> Option<InstalledModMatch> {
        catalog_keys(entry).find_map(|key| self.mods.get(&key).cloned())
    }
}

fn installed_keys(record: &ModRecord) -> Vec<String> {
    [
        record.name.as_str(),
        record.metadata.name.as_str(),
        record.file_name.as_str(),
        record
            .file_name
            .trim_end_matches(".zip")
            .trim_end_matches(".ZIP"),
        record.relative_path.as_str(),
    ]
    .into_iter()
    .map(normalize_dependency_name)
    .filter(|key| !key.is_empty())
    .collect()
}

fn catalog_keys(entry: &ModCatalogEntry) -> impl Iterator<Item = String> + '_ {
    [entry.name.as_str()]
        .into_iter()
        .map(normalize_dependency_name)
        .filter(|key| !key.is_empty())
}
