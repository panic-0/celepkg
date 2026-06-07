use crate::domain::{ModCatalogEntry, ModCatalogSourceKind};
use crate::services::mod_catalog_cache::{
    read_catalog_cache, read_valid_catalog_cache, write_catalog_cache,
};
use crate::utils::{normalize_dependency_name, stable_id};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

const EVEREST_MIRROR_UPDATE_URL: &str =
    "https://everestapi.github.io/updatermirror/everest_update.yaml";
const EVEREST_UPDATE_POINTER_URL: &str = "https://everestapi.github.io/modupdater.txt";
const WEGFAN_MOD_LIST_URL: &str = "https://celeste.weg.fan/api/v2/mod/list";
pub(super) const CATALOG_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
pub(super) const CATALOG_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

pub(super) struct CatalogLoad {
    pub(super) sources: Vec<ModCatalogSourceKind>,
    pub(super) entries: Vec<ModCatalogEntry>,
    pub(super) warnings: Vec<String>,
}

pub(super) fn load_catalogs(sources: &[ModCatalogSourceKind]) -> CatalogLoad {
    load_catalogs_with_cache_mode(sources, true)
}

pub(super) fn load_catalogs_fresh(sources: &[ModCatalogSourceKind]) -> CatalogLoad {
    load_catalogs_with_cache_mode(sources, false)
}

fn load_catalogs_with_cache_mode(
    sources: &[ModCatalogSourceKind],
    allow_valid_cache: bool,
) -> CatalogLoad {
    let client = catalog_client();
    let mut loaded_sources = vec![];
    let mut entries = vec![];
    let mut warnings = vec![];

    let Ok(client) = client else {
        return CatalogLoad {
            sources: vec![],
            entries,
            warnings: vec!["初始化下载客户端失败".to_string()],
        };
    };

    for source in sources {
        match load_catalog_cached(&client, *source, allow_valid_cache) {
            Ok((mut source_entries, warning)) => {
                loaded_sources.push(*source);
                entries.append(&mut source_entries);
                if let Some(warning) = warning {
                    warnings.push(warning);
                }
            }
            Err(error) => warnings.push(error),
        }
    }
    dedupe_catalog_entries(&mut entries);
    CatalogLoad {
        sources: loaded_sources,
        entries,
        warnings,
    }
}

pub(super) fn catalog_client() -> Result<reqwest::blocking::Client, reqwest::Error> {
    reqwest::blocking::Client::builder()
        .user_agent(super::HTTP_USER_AGENT)
        .connect_timeout(CATALOG_CONNECT_TIMEOUT)
        .timeout(CATALOG_REQUEST_TIMEOUT)
        .build()
}

fn load_catalog_cached(
    client: &reqwest::blocking::Client,
    source: ModCatalogSourceKind,
    allow_valid_cache: bool,
) -> Result<(Vec<ModCatalogEntry>, Option<String>), String> {
    if allow_valid_cache {
        if let Some(cache) = read_valid_catalog_cache(source) {
            return Ok((cache.entries, None));
        }
    }

    match load_catalog(client, source) {
        Ok(entries) => {
            write_catalog_cache(source, &entries);
            Ok((entries, None))
        }
        Err(error) => {
            if let Some(cache) = read_catalog_cache(source) {
                return Ok((
                    cache.entries,
                    Some(format!(
                        "{}，已使用本地缓存目录",
                        error.trim_end_matches('。')
                    )),
                ));
            }
            Err(error)
        }
    }
}

fn load_catalog(
    client: &reqwest::blocking::Client,
    source: ModCatalogSourceKind,
) -> Result<Vec<ModCatalogEntry>, String> {
    match source {
        ModCatalogSourceKind::Everest => {
            let url = client
                .get(EVEREST_UPDATE_POINTER_URL)
                .send()
                .map_err(|error| format!("读取 Everest 更新目录地址失败：{error}"))?
                .error_for_status()
                .map_err(|error| format!("读取 Everest 更新目录地址失败：{error}"))?
                .text()
                .map_err(|error| format!("读取 Everest 更新目录地址失败：{error}"))?;
            load_everest_catalog(client, source, url.trim())
        }
        ModCatalogSourceKind::EverestMirror => {
            load_everest_catalog(client, source, EVEREST_MIRROR_UPDATE_URL)
        }
        ModCatalogSourceKind::Wegfan => {
            let text = client
                .get(WEGFAN_MOD_LIST_URL)
                .send()
                .map_err(|error| format!("读取 WEGFan Mod 目录失败：{error}"))?
                .error_for_status()
                .map_err(|error| format!("读取 WEGFan Mod 目录失败：{error}"))?
                .text()
                .map_err(|error| format!("读取 WEGFan Mod 目录失败：{error}"))?;
            parse_wegfan_catalog(&text)
        }
    }
}

fn load_everest_catalog(
    client: &reqwest::blocking::Client,
    source: ModCatalogSourceKind,
    url: &str,
) -> Result<Vec<ModCatalogEntry>, String> {
    let text = client
        .get(url)
        .send()
        .map_err(|error| format!("读取 Everest 更新目录失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("读取 Everest 更新目录失败：{error}"))?
        .text()
        .map_err(|error| format!("读取 Everest 更新目录失败：{error}"))?;
    parse_everest_catalog(&text, source)
}

fn dedupe_catalog_entries(entries: &mut Vec<ModCatalogEntry>) {
    let mut seen = HashSet::new();
    entries.retain(|entry| {
        seen.insert(format!(
            "{:?}:{}:{}",
            entry.source,
            normalize_dependency_name(&entry.name),
            entry.download_url
        ))
    });
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct EverestCatalogEntry {
    version: Option<String>,
    last_update: Option<i64>,
    size: Option<u64>,
    #[serde(rename = "URL")]
    url: Option<String>,
    #[serde(rename = "xxHash", default)]
    xx_hash: Vec<String>,
    game_banana_type: Option<String>,
    game_banana_id: Option<u64>,
    game_banana_file_id: Option<u64>,
}

pub(super) fn parse_everest_catalog(
    text: &str,
    source: ModCatalogSourceKind,
) -> Result<Vec<ModCatalogEntry>, String> {
    let catalog: HashMap<String, EverestCatalogEntry> = serde_yaml::from_str(text)
        .map_err(|error| format!("解析 Everest 更新目录失败：{error}"))?;
    Ok(catalog
        .into_iter()
        .map(|(name, item)| ModCatalogEntry {
            source,
            id: stable_id(&format!("{source:?}:{name}")),
            name,
            version: item.version.unwrap_or_default(),
            download_url: item.url.unwrap_or_default(),
            page_url: item
                .game_banana_id
                .map(|id| format!("https://gamebanana.com/mods/{id}"))
                .unwrap_or_default(),
            game_banana_type: item.game_banana_type.unwrap_or_default(),
            category_name: String::new(),
            sub_category_name: String::new(),
            game_banana_id: item.game_banana_id,
            game_banana_file_id: item.game_banana_file_id,
            size: item.size,
            last_update: item.last_update,
            xx_hash: normalize_hashes(item.xx_hash),
        })
        .collect())
}

#[derive(Debug, Deserialize)]
struct WegfanCatalog {
    #[serde(default)]
    data: Vec<WegfanModFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WegfanModFile {
    id: String,
    name: String,
    version: Option<String>,
    #[serde(default)]
    xx_hash: Vec<String>,
    submission_file: WegfanSubmissionFile,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WegfanSubmissionFile {
    url: String,
    size: Option<u64>,
    game_banana_id: Option<u64>,
    submission: Option<WegfanSubmission>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WegfanSubmission {
    name: String,
    page_url: Option<String>,
    game_banana_section: Option<String>,
    game_banana_id: Option<u64>,
    category_name: Option<String>,
    sub_category_name: Option<String>,
    latest_update_added_time: Option<String>,
}

pub(super) fn parse_wegfan_catalog(text: &str) -> Result<Vec<ModCatalogEntry>, String> {
    let catalog: WegfanCatalog =
        serde_json::from_str(text).map_err(|error| format!("解析 WEGFan Mod 目录失败：{error}"))?;
    Ok(catalog
        .data
        .into_iter()
        .map(|item| {
            let submission = item.submission_file.submission;
            let page_url = submission
                .as_ref()
                .and_then(|submission| submission.page_url.clone())
                .unwrap_or_default();
            let game_banana_type = submission
                .as_ref()
                .and_then(|submission| submission.game_banana_section.clone())
                .unwrap_or_default();
            let game_banana_id = submission
                .as_ref()
                .and_then(|submission| submission.game_banana_id)
                .or(item.submission_file.game_banana_id);
            let category_name = submission
                .as_ref()
                .and_then(|submission| submission.category_name.clone())
                .unwrap_or_default();
            let sub_category_name = submission
                .as_ref()
                .and_then(|submission| submission.sub_category_name.clone())
                .unwrap_or_default();
            let name = submission
                .as_ref()
                .map(|submission| submission.name.clone())
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(item.name);
            let last_update = submission.as_ref().and_then(|submission| {
                parse_rfc3339_seconds(submission.latest_update_added_time.as_deref())
            });
            ModCatalogEntry {
                source: ModCatalogSourceKind::Wegfan,
                id: item.id,
                name,
                version: item.version.unwrap_or_default(),
                download_url: item.submission_file.url,
                page_url,
                game_banana_type,
                category_name,
                sub_category_name,
                game_banana_id,
                game_banana_file_id: item.submission_file.game_banana_id,
                size: item.submission_file.size,
                last_update,
                xx_hash: normalize_hashes(item.xx_hash),
            }
        })
        .collect())
}

fn parse_rfc3339_seconds(value: Option<&str>) -> Option<i64> {
    let value = value?;
    let date_time =
        time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339).ok()?;
    Some(date_time.unix_timestamp())
}

fn normalize_hashes(hashes: Vec<String>) -> Vec<String> {
    hashes
        .into_iter()
        .map(|hash| hash.trim().to_ascii_lowercase())
        .filter(|hash| !hash.is_empty())
        .collect()
}
