use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum CompletionStatus {
    Completed,
    Unfinished,
    Unknown,
    NotApplicable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ModKind {
    Map,
    Mod,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ProfileType {
    Maps,
    Mods,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum BackupKind {
    Manual,
    Auto,
}

impl BackupKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Auto => "auto",
        }
    }
}

impl PartialEq<&str> for BackupKind {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum RestoreScope {
    Game,
}

impl RestoreScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Game => "game",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum BackupFileCategory {
    State,
    Game,
}

impl BackupFileCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::State => "state",
            Self::Game => "game",
        }
    }
}

impl PartialEq<&str> for BackupFileCategory {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum StagedDownloadKind {
    Mod,
    Everest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ModDownloadPhase {
    Downloading,
    Verifying,
    Installing,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModMetadata {
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub dependencies: Vec<Dependency>,
    pub optional_dependencies: Vec<Dependency>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MapStats {
    pub deaths: u64,
    pub strawberries: u64,
    #[serde(default)]
    pub total_strawberries: u64,
    #[serde(default)]
    pub stale_strawberries: u64,
    pub strawberries_known: bool,
    pub time_played: u64,
    pub completed: bool,
    pub completion_known: bool,
    pub cassettes: u64,
    pub hearts: u64,
    pub save_files: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileInfo {
    pub name: String,
    pub player_name: String,
    pub current_map: String,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SubMapInfo {
    pub id: String,
    pub sid: String,
    pub mode_index: Option<u8>,
    pub display_name: String,
    pub chapter: String,
    pub file_path: String,
    #[serde(default)]
    pub difficulty: String,
    pub strawberry_count: u64,
    pub strawberry_total_count: u64,
    pub completion_status: CompletionStatus,
    pub stats: Option<MapStats>,
    #[serde(skip)]
    pub current_visible_strawberry_ids: HashSet<String>,
    #[serde(skip)]
    pub current_total_strawberry_ids: HashSet<String>,
    #[serde(skip)]
    pub current_strawberry_ids_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModRecord {
    pub id: String,
    pub name: String,
    pub file_name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub is_archive: bool,
    pub kind: ModKind,
    pub enabled: bool,
    pub favorite: bool,
    pub protected: bool,
    #[serde(default)]
    pub read_only: bool,
    pub metadata: ModMetadata,
    pub map_ids: Vec<String>,
    pub sub_maps: Vec<SubMapInfo>,
    pub map_count: usize,
    pub strawberry_count: u64,
    pub strawberry_total_count: u64,
    pub completion_status: CompletionStatus,
    pub dependencies: Vec<Dependency>,
    pub optional_dependencies: Vec<Dependency>,
    pub stats: Option<MapStats>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub profile_type: ProfileType,
    pub enabled_map_ids: Option<Vec<String>>,
    pub enabled_mod_ids: Option<Vec<String>>,
    pub launch_args: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesState {
    pub active_map_profile_id: String,
    pub active_mod_profile_id: String,
    pub profiles: Vec<Profile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub celeste_path: String,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResponse {
    pub celeste_path: String,
    pub auto_backup_enabled: bool,
    pub auto_backup_cleanup_enabled: bool,
    pub auto_backup_retention_count: usize,
    pub mod_catalog_source_order: Vec<ModCatalogSourceKind>,
    pub mod_catalog_source_enabled_count: usize,
    pub auto_check_mod_updates_on_startup: bool,
    pub auto_check_app_updates_on_startup: bool,
    pub auto_refresh_mod_catalog_cache_on_startup: bool,
    pub selected_save_files: Vec<String>,
    pub profiles: ProfilesState,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScanTiming {
    pub stage: String,
    pub ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub celeste_path: String,
    pub mods_path: String,
    pub blacklist_path: String,
    pub blacklist_entries: Vec<String>,
    pub game_executable: String,
    pub maps: Vec<ModRecord>,
    pub other_mods: Vec<ModRecord>,
    pub profiles: ProfilesState,
    pub available_save_files: Vec<SaveFileInfo>,
    pub selected_save_files: Vec<String>,
    pub warnings: Vec<String>,
    #[serde(default)]
    pub timings: Vec<ScanTiming>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub profile_type: ProfileType,
    pub enabled_map_ids: Option<Vec<String>>,
    pub enabled_mod_ids: Option<Vec<String>>,
    pub launch_args: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub launched: bool,
    pub executable: String,
    pub map_profile_id: String,
    pub mod_profile_id: String,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameStatus {
    pub running: bool,
    pub stopped: bool,
    pub executable: String,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileEntry {
    pub category: BackupFileCategory,
    pub label: String,
    pub target_path: String,
    pub backup_path: String,
    pub existed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BackupModEntry {
    pub name: String,
    pub metadata_name: String,
    pub file_name: String,
    pub relative_path: String,
    pub version: String,
    pub enabled: bool,
    pub is_archive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub created_at: String,
    pub kind: BackupKind,
    pub celeste_path: String,
    pub backup_path: String,
    pub files: Vec<BackupFileEntry>,
    pub mods: Vec<BackupModEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ModCatalogSourceKind {
    Everest,
    EverestMirror,
    Wegfan,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModCatalogEntry {
    pub source: ModCatalogSourceKind,
    pub id: String,
    pub name: String,
    pub version: String,
    pub download_url: String,
    pub page_url: String,
    pub game_banana_type: String,
    #[serde(default)]
    pub category_name: String,
    #[serde(default)]
    pub sub_category_name: String,
    pub game_banana_id: Option<u64>,
    pub game_banana_file_id: Option<u64>,
    pub size: Option<u64>,
    pub last_update: Option<i64>,
    pub xx_hash: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModCatalogSearchResult {
    pub sources: Vec<ModCatalogSourceKind>,
    pub entries: Vec<ModCatalogEntry>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModCatalogDependencyResolution {
    pub dependency: Dependency,
    pub entry: Option<ModCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModCatalogDependencyResolutionResult {
    pub sources: Vec<ModCatalogSourceKind>,
    pub resolutions: Vec<ModCatalogDependencyResolution>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModMatch {
    pub record_id: String,
    pub name: String,
    pub file_name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub version: String,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateCandidate {
    pub entry: ModCatalogEntry,
    pub installed: InstalledModMatch,
    pub update_available: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateCheckResult {
    pub sources: Vec<ModCatalogSourceKind>,
    pub updates: Vec<ModUpdateCandidate>,
    pub matched: Vec<ModUpdateCandidate>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModInstallResult {
    pub entry: ModCatalogEntry,
    pub destination_path: String,
    pub replaced_path: Option<String>,
    pub hash: String,
    pub scan: ScanResult,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StagedDownload {
    pub staged_id: String,
    pub name: String,
    pub kind: StagedDownloadKind,
    pub size: Option<u64>,
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModPreviewStaging {
    pub staged: StagedDownload,
    pub metadata: ModMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModDownloadProgress {
    pub operation_id: String,
    pub mod_name: String,
    pub phase: ModDownloadPhase,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub speed_bytes_per_sec: f64,
    pub task_index: usize,
    pub task_total: usize,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EverestRelease {
    pub branch: String,
    pub version: u64,
    pub date: String,
    pub commit: String,
    pub main_file_size: Option<u64>,
    pub main_download: String,
    pub mirror_download: String,
    pub is_native: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EverestReleaseList {
    pub releases: Vec<EverestRelease>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EverestInstallResult {
    pub release: EverestRelease,
    pub scan: ScanResult,
}

#[cfg(test)]
mod contract_tests {
    use super::*;
    use serde::de::DeserializeOwned;
    use serde_json::Value;

    const API_CONTRACT: &str = include_str!("../../src/contractSamples/api-contract.json");

    #[test]
    fn shared_api_contract_samples_match_domain_serialization() {
        let contract: Value = serde_json::from_str(API_CONTRACT).expect("api contract json");

        assert_config_response_contract(&contract);
        assert_round_trip::<ScanResult>(&contract, "scanResult");
        assert_round_trip::<ModCatalogSearchResult>(&contract, "modCatalogSearchResult");
        assert_round_trip::<ModUpdateCheckResult>(&contract, "modUpdateCheckResult");
        assert_round_trip::<ModInstallResult>(&contract, "modInstallResult");
        assert_round_trip::<StagedDownload>(&contract, "stagedDownload");
        assert_round_trip::<EverestReleaseList>(&contract, "everestReleaseList");
        assert_round_trip::<EverestInstallResult>(&contract, "everestInstallResult");
        assert_round_trip::<BackupInfo>(&contract, "backupInfo");
        assert_round_trip::<Vec<BackupInfo>>(&contract, "backupList");
        assert_round_trip::<ModMetadata>(&contract, "modMetadata");
    }

    fn assert_round_trip<T>(contract: &Value, key: &str)
    where
        T: DeserializeOwned + serde::Serialize,
    {
        let expected = contract
            .get(key)
            .unwrap_or_else(|| panic!("missing contract sample {key}"));
        let parsed: T = serde_json::from_value(expected.clone())
            .unwrap_or_else(|error| panic!("deserialize {key}: {error}"));
        let serialized =
            serde_json::to_value(parsed).unwrap_or_else(|error| panic!("serialize {key}: {error}"));
        assert_eq!(
            serialized,
            expected.clone(),
            "contract sample changed shape: {key}"
        );
    }

    fn assert_config_response_contract(contract: &Value) {
        let expected = contract
            .get("configResponse")
            .expect("missing contract sample configResponse");
        let profiles: ProfilesState =
            serde_json::from_value(contract["profiles"].clone()).expect("profiles contract");
        let response = ConfigResponse {
            celeste_path: "D:/Games/Celeste".to_string(),
            auto_backup_enabled: true,
            auto_backup_cleanup_enabled: true,
            auto_backup_retention_count: 20,
            mod_catalog_source_order: vec![
                ModCatalogSourceKind::Wegfan,
                ModCatalogSourceKind::EverestMirror,
                ModCatalogSourceKind::Everest,
            ],
            mod_catalog_source_enabled_count: 2,
            auto_check_mod_updates_on_startup: true,
            auto_check_app_updates_on_startup: true,
            auto_refresh_mod_catalog_cache_on_startup: true,
            selected_save_files: vec!["0.celeste".to_string()],
            profiles,
            warnings: vec!["Config warning".to_string()],
        };

        let serialized = serde_json::to_value(response).expect("serialize configResponse");
        assert_eq!(
            serialized,
            expected.clone(),
            "contract sample changed shape: configResponse"
        );
    }
}
