use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModMetadata {
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub dependencies: Vec<Dependency>,
    pub optional_dependencies: Vec<Dependency>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapStats {
    pub deaths: u64,
    pub strawberries: u64,
    pub time_played: u64,
    pub completed: bool,
    pub completion_known: bool,
    pub cassettes: u64,
    pub hearts: u64,
    pub save_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubMapInfo {
    pub id: String,
    pub sid: String,
    pub display_name: String,
    pub chapter: String,
    pub file_path: String,
    pub completion_status: String,
    pub stats: Option<MapStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModRecord {
    pub id: String,
    pub name: String,
    pub file_name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub is_archive: bool,
    pub kind: String,
    pub enabled: bool,
    pub favorite: bool,
    pub protected: bool,
    pub metadata: ModMetadata,
    pub map_ids: Vec<String>,
    pub sub_maps: Vec<SubMapInfo>,
    pub map_count: usize,
    pub completion_status: String,
    pub dependencies: Vec<Dependency>,
    pub optional_dependencies: Vec<Dependency>,
    pub stats: Option<MapStats>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub profile_type: String,
    pub enabled_map_ids: Option<Vec<String>>,
    pub enabled_mod_ids: Option<Vec<String>>,
    pub launch_args: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesState {
    pub active_map_profile_id: String,
    pub active_mod_profile_id: String,
    pub profiles: Vec<Profile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub celeste_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResponse {
    pub celeste_path: String,
    pub profiles: ProfilesState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub profile_type: String,
    pub enabled_map_ids: Option<Vec<String>>,
    pub enabled_mod_ids: Option<Vec<String>>,
    pub launch_args: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub launched: bool,
    pub executable: String,
    pub map_profile_id: String,
    pub mod_profile_id: String,
}
