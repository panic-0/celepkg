use crate::domain::{
    AppConfig, BackupFileCategory, BackupFileEntry, BackupInfo, BackupKind, BackupModEntry,
    CompletionStatus, ConfigResponse, Dependency, EverestInstallResult, EverestRelease,
    EverestReleaseList, InstalledModMatch, LaunchResult, MapStats, ModCatalogDependencyResolution,
    ModCatalogDependencyResolutionResult, ModCatalogEntry, ModCatalogSearchResult,
    ModCatalogSourceKind, ModDownloadPhase, ModDownloadProgress, ModInstallResult, ModKind,
    ModMetadata, ModPreviewStaging, ModRecord, ModUpdateCandidate, ModUpdateCheckResult, Profile,
    ProfileInput, ProfileType, ProfilesState, RestoreScope, SaveFileInfo, ScanResult, ScanTiming,
    StagedDownload, StagedDownloadKind, SubMapInfo,
};
use schemars::{
    generate::{SchemaGenerator, SchemaSettings},
    JsonSchema,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CelestePathPayload {
    pub celeste_path: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetCelestePathPayload {
    pub celeste_path: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetAutoBackupEnabledPayload {
    pub auto_backup_enabled: bool,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetAutoBackupCleanupEnabledPayload {
    pub auto_backup_cleanup_enabled: bool,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetAutoBackupRetentionCountPayload {
    pub auto_backup_retention_count: usize,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetModCatalogSourcesPayload {
    pub mod_catalog_source_order: Vec<ModCatalogSourceKind>,
    pub mod_catalog_source_enabled_count: usize,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetAutoCheckModUpdatesOnStartupPayload {
    pub auto_check_mod_updates_on_startup: bool,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetAutoCheckAppUpdatesOnStartupPayload {
    pub auto_check_app_updates_on_startup: bool,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetAutoRefreshModCatalogCacheOnStartupPayload {
    pub auto_refresh_mod_catalog_cache_on_startup: bool,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetSelectedSaveFilesPayload {
    pub save_files: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchModCatalogPayload {
    pub query: String,
    pub sources: Vec<ModCatalogSourceKind>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RefreshModCatalogCachePayload {
    pub sources: Vec<ModCatalogSourceKind>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveModCatalogDependenciesPayload {
    pub dependencies: Vec<Dependency>,
    pub sources: Vec<ModCatalogSourceKind>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckModUpdatesPayload {
    pub celeste_path: String,
    pub sources: Vec<ModCatalogSourceKind>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewModUpdateMetadataPayload {
    pub celeste_path: String,
    pub entry: ModCatalogEntry,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DownloadEverestToStagingPayload {
    pub celeste_path: String,
    pub release: EverestRelease,
    pub operation_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstallStagedEverestPayload {
    pub celeste_path: String,
    pub staged_id: String,
    pub release: EverestRelease,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DownloadModToStagingPayload {
    pub celeste_path: String,
    pub entry: ModCatalogEntry,
    pub operation_id: String,
    pub task_index: usize,
    pub task_total: usize,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StageModPreviewPayload {
    pub celeste_path: String,
    pub entry: ModCatalogEntry,
    pub operation_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReadStagedModMetadataPayload {
    pub celeste_path: String,
    pub staged_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteStagedDownloadPayload {
    pub celeste_path: String,
    pub staged_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstallStagedModPayload {
    pub celeste_path: String,
    pub staged_id: String,
    pub entry: ModCatalogEntry,
    pub installed_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelModDownloadPayload {
    pub operation_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveProfilePayload {
    pub profile: ProfileInput,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteProfilePayload {
    pub profile_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplyProfilePayload {
    pub celeste_path: String,
    pub map_profile_id: String,
    pub mod_profile_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchProfilePayload {
    pub celeste_path: String,
    pub map_profile_id: String,
    pub mod_profile_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LaunchGamePayload {
    pub celeste_path: String,
    pub launch_args: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetRecordFavoritePayload {
    pub celeste_path: String,
    pub record_id: String,
    pub favorite: bool,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetRecordProtectedPayload {
    pub celeste_path: String,
    pub record_id: String,
    pub protected: bool,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenModLocationPayload {
    pub absolute_path: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateBackupPayload {
    pub celeste_path: String,
    pub kind: BackupKind,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupIdPayload {
    pub backup_id: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestoreBackupPayload {
    pub backup_id: String,
    pub scope: RestoreScope,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenBackupFolderPayload {
    pub celeste_path: String,
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenBackupLocationPayload {
    pub backup_path: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandContract {
    pub payload: Option<&'static str>,
    pub response: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventContract {
    pub payload: &'static str,
}

pub const REGISTERED_COMMANDS: &[&str] = &[
    "get_config",
    "set_celeste_path",
    "set_auto_backup_enabled",
    "set_auto_backup_cleanup_enabled",
    "set_auto_backup_retention_count",
    "set_mod_catalog_sources",
    "set_auto_check_mod_updates_on_startup",
    "set_auto_check_app_updates_on_startup",
    "set_auto_refresh_mod_catalog_cache_on_startup",
    "set_selected_save_files",
    "select_celeste_directory",
    "scan_celeste",
    "rescan_celeste",
    "search_mod_catalog",
    "refresh_mod_catalog_cache",
    "resolve_mod_catalog_dependencies",
    "check_mod_updates",
    "preview_mod_update_metadata",
    "list_everest_releases",
    "download_everest_to_staging",
    "install_staged_everest",
    "download_mod_to_staging",
    "stage_mod_preview",
    "read_staged_mod_metadata",
    "delete_staged_download",
    "install_staged_mod",
    "cancel_mod_download",
    "set_record_favorite",
    "set_record_protected",
    "open_mod_location",
    "save_profile",
    "delete_profile",
    "apply_profile",
    "launch_profile",
    "launch_game",
    "create_backup",
    "list_backups",
    "restore_backup",
    "delete_backup",
    "cleanup_auto_backups",
    "open_backup_folder",
    "open_backup_location",
];

pub fn export_contract() -> Value {
    let schemas = schemas();
    let mut root = Map::new();
    root.insert(
        "$schema".to_string(),
        Value::String("https://json-schema.org/draft/2020-12/schema".to_string()),
    );
    root.insert(
        "commands".to_string(),
        serde_json::to_value(commands()).unwrap(),
    );
    root.insert(
        "events".to_string(),
        serde_json::to_value(events()).unwrap(),
    );
    root.insert("schemas".to_string(), Value::Object(schemas.clone()));
    root.insert("$defs".to_string(), Value::Object(schemas));
    Value::Object(root)
}

pub fn commands() -> Map<String, Value> {
    let mut commands = Map::new();
    command::<ConfigResponse>(&mut commands, "get_config", None);
    command::<AppConfig>(
        &mut commands,
        "set_celeste_path",
        Some("SetCelestePathPayload"),
    );
    command::<ConfigResponse>(
        &mut commands,
        "set_auto_backup_enabled",
        Some("SetAutoBackupEnabledPayload"),
    );
    command::<ConfigResponse>(
        &mut commands,
        "set_auto_backup_cleanup_enabled",
        Some("SetAutoBackupCleanupEnabledPayload"),
    );
    command::<ConfigResponse>(
        &mut commands,
        "set_auto_backup_retention_count",
        Some("SetAutoBackupRetentionCountPayload"),
    );
    command::<ConfigResponse>(
        &mut commands,
        "set_mod_catalog_sources",
        Some("SetModCatalogSourcesPayload"),
    );
    command::<ConfigResponse>(
        &mut commands,
        "set_auto_check_mod_updates_on_startup",
        Some("SetAutoCheckModUpdatesOnStartupPayload"),
    );
    command::<ConfigResponse>(
        &mut commands,
        "set_auto_check_app_updates_on_startup",
        Some("SetAutoCheckAppUpdatesOnStartupPayload"),
    );
    command::<ConfigResponse>(
        &mut commands,
        "set_auto_refresh_mod_catalog_cache_on_startup",
        Some("SetAutoRefreshModCatalogCacheOnStartupPayload"),
    );
    command::<ConfigResponse>(
        &mut commands,
        "set_selected_save_files",
        Some("SetSelectedSaveFilesPayload"),
    );
    command::<Option<String>>(&mut commands, "select_celeste_directory", None);
    command::<ScanResult>(&mut commands, "scan_celeste", Some("CelestePathPayload"));
    command::<ScanResult>(&mut commands, "rescan_celeste", Some("CelestePathPayload"));
    command::<ModCatalogSearchResult>(
        &mut commands,
        "search_mod_catalog",
        Some("SearchModCatalogPayload"),
    );
    command::<ModCatalogSearchResult>(
        &mut commands,
        "refresh_mod_catalog_cache",
        Some("RefreshModCatalogCachePayload"),
    );
    command::<ModCatalogDependencyResolutionResult>(
        &mut commands,
        "resolve_mod_catalog_dependencies",
        Some("ResolveModCatalogDependenciesPayload"),
    );
    command::<ModUpdateCheckResult>(
        &mut commands,
        "check_mod_updates",
        Some("CheckModUpdatesPayload"),
    );
    command::<ModMetadata>(
        &mut commands,
        "preview_mod_update_metadata",
        Some("PreviewModUpdateMetadataPayload"),
    );
    command::<EverestReleaseList>(&mut commands, "list_everest_releases", None);
    command::<StagedDownload>(
        &mut commands,
        "download_everest_to_staging",
        Some("DownloadEverestToStagingPayload"),
    );
    command::<EverestInstallResult>(
        &mut commands,
        "install_staged_everest",
        Some("InstallStagedEverestPayload"),
    );
    command::<StagedDownload>(
        &mut commands,
        "download_mod_to_staging",
        Some("DownloadModToStagingPayload"),
    );
    command::<ModPreviewStaging>(
        &mut commands,
        "stage_mod_preview",
        Some("StageModPreviewPayload"),
    );
    command::<ModMetadata>(
        &mut commands,
        "read_staged_mod_metadata",
        Some("ReadStagedModMetadataPayload"),
    );
    command::<bool>(
        &mut commands,
        "delete_staged_download",
        Some("DeleteStagedDownloadPayload"),
    );
    command::<ModInstallResult>(
        &mut commands,
        "install_staged_mod",
        Some("InstallStagedModPayload"),
    );
    command::<bool>(
        &mut commands,
        "cancel_mod_download",
        Some("CancelModDownloadPayload"),
    );
    command::<ScanResult>(
        &mut commands,
        "set_record_favorite",
        Some("SetRecordFavoritePayload"),
    );
    command::<ScanResult>(
        &mut commands,
        "set_record_protected",
        Some("SetRecordProtectedPayload"),
    );
    command::<()>(
        &mut commands,
        "open_mod_location",
        Some("OpenModLocationPayload"),
    );
    command::<ProfilesState>(&mut commands, "save_profile", Some("SaveProfilePayload"));
    command::<ProfilesState>(
        &mut commands,
        "delete_profile",
        Some("DeleteProfilePayload"),
    );
    command::<ScanResult>(&mut commands, "apply_profile", Some("ApplyProfilePayload"));
    command::<LaunchResult>(
        &mut commands,
        "launch_profile",
        Some("LaunchProfilePayload"),
    );
    command::<LaunchResult>(&mut commands, "launch_game", Some("LaunchGamePayload"));
    command::<BackupInfo>(&mut commands, "create_backup", Some("CreateBackupPayload"));
    command::<Vec<BackupInfo>>(&mut commands, "list_backups", None);
    command::<BackupInfo>(
        &mut commands,
        "restore_backup",
        Some("RestoreBackupPayload"),
    );
    command::<()>(&mut commands, "delete_backup", Some("BackupIdPayload"));
    command::<Vec<BackupInfo>>(&mut commands, "cleanup_auto_backups", None);
    command::<()>(
        &mut commands,
        "open_backup_folder",
        Some("OpenBackupFolderPayload"),
    );
    command::<()>(
        &mut commands,
        "open_backup_location",
        Some("OpenBackupLocationPayload"),
    );
    commands
}

pub fn events() -> Map<String, Value> {
    let mut events = Map::new();
    events.insert(
        "mod-download-progress".to_string(),
        serde_json::to_value(EventContract {
            payload: "ModDownloadProgress",
        })
        .unwrap(),
    );
    events
}

fn schemas() -> Map<String, Value> {
    let mut schemas = Map::new();
    payload_schema::<CelestePathPayload>(&mut schemas, "CelestePathPayload");
    payload_schema::<SetCelestePathPayload>(&mut schemas, "SetCelestePathPayload");
    payload_schema::<SetAutoBackupEnabledPayload>(&mut schemas, "SetAutoBackupEnabledPayload");
    payload_schema::<SetAutoBackupCleanupEnabledPayload>(
        &mut schemas,
        "SetAutoBackupCleanupEnabledPayload",
    );
    payload_schema::<SetAutoBackupRetentionCountPayload>(
        &mut schemas,
        "SetAutoBackupRetentionCountPayload",
    );
    payload_schema::<SetModCatalogSourcesPayload>(&mut schemas, "SetModCatalogSourcesPayload");
    payload_schema::<SetAutoCheckModUpdatesOnStartupPayload>(
        &mut schemas,
        "SetAutoCheckModUpdatesOnStartupPayload",
    );
    payload_schema::<SetAutoCheckAppUpdatesOnStartupPayload>(
        &mut schemas,
        "SetAutoCheckAppUpdatesOnStartupPayload",
    );
    payload_schema::<SetAutoRefreshModCatalogCacheOnStartupPayload>(
        &mut schemas,
        "SetAutoRefreshModCatalogCacheOnStartupPayload",
    );
    payload_schema::<SetSelectedSaveFilesPayload>(&mut schemas, "SetSelectedSaveFilesPayload");
    payload_schema::<SearchModCatalogPayload>(&mut schemas, "SearchModCatalogPayload");
    payload_schema::<RefreshModCatalogCachePayload>(&mut schemas, "RefreshModCatalogCachePayload");
    payload_schema::<ResolveModCatalogDependenciesPayload>(
        &mut schemas,
        "ResolveModCatalogDependenciesPayload",
    );
    payload_schema::<CheckModUpdatesPayload>(&mut schemas, "CheckModUpdatesPayload");
    payload_schema::<PreviewModUpdateMetadataPayload>(
        &mut schemas,
        "PreviewModUpdateMetadataPayload",
    );
    payload_schema::<DownloadEverestToStagingPayload>(
        &mut schemas,
        "DownloadEverestToStagingPayload",
    );
    payload_schema::<InstallStagedEverestPayload>(&mut schemas, "InstallStagedEverestPayload");
    payload_schema::<DownloadModToStagingPayload>(&mut schemas, "DownloadModToStagingPayload");
    payload_schema::<StageModPreviewPayload>(&mut schemas, "StageModPreviewPayload");
    payload_schema::<ReadStagedModMetadataPayload>(&mut schemas, "ReadStagedModMetadataPayload");
    payload_schema::<DeleteStagedDownloadPayload>(&mut schemas, "DeleteStagedDownloadPayload");
    payload_schema::<InstallStagedModPayload>(&mut schemas, "InstallStagedModPayload");
    payload_schema::<CancelModDownloadPayload>(&mut schemas, "CancelModDownloadPayload");
    payload_schema::<SaveProfilePayload>(&mut schemas, "SaveProfilePayload");
    payload_schema::<DeleteProfilePayload>(&mut schemas, "DeleteProfilePayload");
    payload_schema::<ApplyProfilePayload>(&mut schemas, "ApplyProfilePayload");
    payload_schema::<LaunchProfilePayload>(&mut schemas, "LaunchProfilePayload");
    payload_schema::<LaunchGamePayload>(&mut schemas, "LaunchGamePayload");
    payload_schema::<SetRecordFavoritePayload>(&mut schemas, "SetRecordFavoritePayload");
    payload_schema::<SetRecordProtectedPayload>(&mut schemas, "SetRecordProtectedPayload");
    payload_schema::<OpenModLocationPayload>(&mut schemas, "OpenModLocationPayload");
    payload_schema::<CreateBackupPayload>(&mut schemas, "CreateBackupPayload");
    payload_schema::<BackupIdPayload>(&mut schemas, "BackupIdPayload");
    payload_schema::<RestoreBackupPayload>(&mut schemas, "RestoreBackupPayload");
    payload_schema::<OpenBackupFolderPayload>(&mut schemas, "OpenBackupFolderPayload");
    payload_schema::<OpenBackupLocationPayload>(&mut schemas, "OpenBackupLocationPayload");

    response_schema::<AppConfig>(&mut schemas, "AppConfig");
    response_schema::<BackupFileCategory>(&mut schemas, "BackupFileCategory");
    response_schema::<BackupFileEntry>(&mut schemas, "BackupFileEntry");
    response_schema::<BackupInfo>(&mut schemas, "BackupInfo");
    response_schema::<Vec<BackupInfo>>(&mut schemas, "BackupInfoList");
    response_schema::<BackupKind>(&mut schemas, "BackupKind");
    response_schema::<BackupModEntry>(&mut schemas, "BackupModEntry");
    response_schema::<bool>(&mut schemas, "BooleanResponse");
    response_schema::<CompletionStatus>(&mut schemas, "CompletionStatus");
    response_schema::<ConfigResponse>(&mut schemas, "ConfigResponse");
    response_schema::<Dependency>(&mut schemas, "Dependency");
    response_schema::<EverestInstallResult>(&mut schemas, "EverestInstallResult");
    response_schema::<EverestRelease>(&mut schemas, "EverestRelease");
    response_schema::<EverestReleaseList>(&mut schemas, "EverestReleaseList");
    response_schema::<InstalledModMatch>(&mut schemas, "InstalledModMatch");
    response_schema::<LaunchResult>(&mut schemas, "LaunchResult");
    response_schema::<MapStats>(&mut schemas, "MapStats");
    response_schema::<ModCatalogDependencyResolution>(
        &mut schemas,
        "ModCatalogDependencyResolution",
    );
    response_schema::<ModCatalogDependencyResolutionResult>(
        &mut schemas,
        "ModCatalogDependencyResolutionResult",
    );
    response_schema::<ModCatalogEntry>(&mut schemas, "ModCatalogEntry");
    response_schema::<ModCatalogSearchResult>(&mut schemas, "ModCatalogSearchResult");
    response_schema::<ModCatalogSourceKind>(&mut schemas, "ModCatalogSourceKind");
    response_schema::<ModDownloadPhase>(&mut schemas, "ModDownloadPhase");
    response_schema::<ModDownloadProgress>(&mut schemas, "ModDownloadProgress");
    response_schema::<ModInstallResult>(&mut schemas, "ModInstallResult");
    response_schema::<ModKind>(&mut schemas, "ModKind");
    response_schema::<ModMetadata>(&mut schemas, "ModMetadata");
    response_schema::<ModPreviewStaging>(&mut schemas, "ModPreviewStaging");
    response_schema::<ModRecord>(&mut schemas, "ModRecord");
    response_schema::<ModUpdateCandidate>(&mut schemas, "ModUpdateCandidate");
    response_schema::<ModUpdateCheckResult>(&mut schemas, "ModUpdateCheckResult");
    response_schema::<Option<String>>(&mut schemas, "NullableString");
    response_schema::<Profile>(&mut schemas, "Profile");
    payload_schema::<ProfileInput>(&mut schemas, "ProfileInput");
    response_schema::<ProfileType>(&mut schemas, "ProfileType");
    response_schema::<ProfilesState>(&mut schemas, "ProfilesState");
    response_schema::<RestoreScope>(&mut schemas, "RestoreScope");
    response_schema::<SaveFileInfo>(&mut schemas, "SaveFileInfo");
    response_schema::<ScanResult>(&mut schemas, "ScanResult");
    response_schema::<ScanTiming>(&mut schemas, "ScanTiming");
    response_schema::<StagedDownload>(&mut schemas, "StagedDownload");
    response_schema::<StagedDownloadKind>(&mut schemas, "StagedDownloadKind");
    response_schema::<SubMapInfo>(&mut schemas, "SubMapInfo");
    response_schema::<()>(&mut schemas, "VoidResponse");
    schemas
}

fn command<R>(commands: &mut Map<String, Value>, name: &'static str, payload: Option<&'static str>)
where
    R: JsonSchema,
{
    let response = response_type_name::<R>();
    commands.insert(
        name.to_string(),
        serde_json::to_value(CommandContract { payload, response }).unwrap(),
    );
}

fn response_type_name<T: JsonSchema>() -> &'static str {
    let name = std::any::type_name::<T>();
    match name {
        "()" => "VoidResponse",
        "bool" => "BooleanResponse",
        "core::option::Option<alloc::string::String>" => "NullableString",
        "alloc::vec::Vec<celepkg_lib::domain::BackupInfo>" => "BackupInfoList",
        name => name.rsplit("::").next().unwrap_or(name),
    }
}

fn payload_schema<T: JsonSchema>(schemas: &mut Map<String, Value>, name: &'static str) {
    let schema = SchemaGenerator::default().into_root_schema_for::<T>();
    schemas.insert(name.to_string(), serde_json::to_value(schema).unwrap());
}

fn response_schema<T: JsonSchema>(schemas: &mut Map<String, Value>, name: &'static str) {
    let schema = SchemaSettings::default()
        .for_serialize()
        .into_generator()
        .into_root_schema_for::<T>();
    schemas.insert(name.to_string(), serde_json::to_value(schema).unwrap());
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn contract_lists_all_registered_commands() {
        let commands = commands();
        let mut names = commands.keys().map(String::as_str).collect::<Vec<_>>();
        names.sort_unstable();
        let mut registered = REGISTERED_COMMANDS.to_vec();
        registered.sort_unstable();
        assert_eq!(names, registered);
    }

    #[test]
    fn boundary_enums_keep_serialized_values() {
        assert_eq!(json!(BackupKind::Manual), json!("manual"));
        assert_eq!(json!(BackupKind::Auto), json!("auto"));
        assert_eq!(json!(RestoreScope::Game), json!("game"));
        assert_eq!(
            json!(crate::domain::BackupFileCategory::Game),
            json!("game")
        );
        assert_eq!(
            json!(crate::domain::StagedDownloadKind::Everest),
            json!("everest")
        );
        assert_eq!(
            json!(crate::domain::ModDownloadPhase::Downloading),
            json!("downloading")
        );
    }
}
