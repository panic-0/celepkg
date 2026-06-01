use crate::domain::{Profile, ProfilesState};
use crate::utils::{now_string, stable_id};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub celeste_path: String,
    pub active_map_profile_id: String,
    pub active_mod_profile_id: String,
    pub profiles: Vec<Profile>,
}

impl AppState {
    pub fn profiles_state(&self) -> ProfilesState {
        ProfilesState {
            active_map_profile_id: self.active_map_profile_id.clone(),
            active_mod_profile_id: self.active_mod_profile_id.clone(),
            profiles: self.profiles.clone(),
        }
    }

    pub fn set_profiles_state(&mut self, profiles: ProfilesState) {
        self.active_map_profile_id = profiles.active_map_profile_id;
        self.active_mod_profile_id = profiles.active_mod_profile_id;
        self.profiles = profiles.profiles;
    }
}

pub fn load_state() -> AppState {
    if let Some(state) = read_json(&state_path()) {
        return state;
    }
    let state = default_state();
    let _ = write_state(&state);
    state
}

pub fn write_state(state: &AppState) -> Result<(), String> {
    write_json(&state_path(), state)
}

pub fn resolve_input_path(value: &str) -> PathBuf {
    if value.trim().is_empty() {
        PathBuf::from(load_state().celeste_path)
    } else {
        PathBuf::from(value.trim())
    }
}

fn default_state() -> AppState {
    let now = now_string();
    AppState {
        celeste_path: find_default_celeste_path(),
        active_map_profile_id: "default-maps".to_string(),
        active_mod_profile_id: "default-mods".to_string(),
        profiles: vec![
            Profile {
                id: "default-maps".to_string(),
                name: "当前地图启用状态".to_string(),
                profile_type: "maps".to_string(),
                enabled_map_ids: None,
                enabled_mod_ids: None,
                launch_args: String::new(),
                created_at: now.clone(),
                updated_at: now.clone(),
            },
            Profile {
                id: "default-mods".to_string(),
                name: "当前 Mod 启用状态".to_string(),
                profile_type: "mods".to_string(),
                enabled_map_ids: None,
                enabled_mod_ids: None,
                launch_args: String::new(),
                created_at: now.clone(),
                updated_at: now,
            },
        ],
    }
}

fn app_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("celepkg")
}

fn state_path() -> PathBuf {
    app_dir().join("state.json")
}

pub fn scan_cache_path(celeste_path: &Path) -> PathBuf {
    app_dir().join("scan-cache").join(format!(
        "{}.json",
        stable_id(&celeste_path.to_string_lossy().to_lowercase())
    ))
}

pub fn read_json<T: for<'de> Deserialize<'de>>(file: &Path) -> Option<T> {
    let text = fs::read_to_string(file).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn write_json<T: Serialize>(file: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建配置目录失败：{error}"))?;
    }
    let text =
        serde_json::to_string_pretty(value).map_err(|error| format!("序列化配置失败：{error}"))?;
    fs::write(file, text).map_err(|error| format!("写入配置失败：{error}"))
}

fn find_default_celeste_path() -> String {
    let mut candidates = vec![
        PathBuf::from(r"C:\Program Files\Steam\steamapps\common\Celeste"),
        PathBuf::from(r"C:\Program Files (x86)\Steam\steamapps\common\Celeste"),
        PathBuf::from(r"D:\SteamLibrary\steamapps\common\Celeste"),
        PathBuf::from(r"E:\SteamLibrary\steamapps\common\Celeste"),
    ];
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(r"AppData\Roaming\itch\apps\celeste"));
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.join("Mods").exists())
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_state_contains_a_default_profile() {
        let state = default_state();

        assert_eq!(state.active_map_profile_id, "default-maps");
        assert_eq!(state.active_mod_profile_id, "default-mods");
        assert_eq!(state.profiles.len(), 2);
        assert_eq!(state.profiles[0].profile_type, "maps");
        assert_eq!(state.profiles[1].profile_type, "mods");
    }

    #[test]
    fn profiles_state_round_trips_through_app_state() {
        let mut state = default_state();
        state.set_profiles_state(ProfilesState {
            active_map_profile_id: "next-map".to_string(),
            active_mod_profile_id: "next-mod".to_string(),
            profiles: vec![
                Profile {
                    id: "next-map".to_string(),
                    name: "Next Map".to_string(),
                    profile_type: "maps".to_string(),
                    enabled_map_ids: Some(vec!["map".to_string()]),
                    enabled_mod_ids: Some(vec!["helper".to_string()]),
                    launch_args: "-debug".to_string(),
                    created_at: "1".to_string(),
                    updated_at: "2".to_string(),
                },
                Profile {
                    id: "next-mod".to_string(),
                    name: "Next Mod".to_string(),
                    profile_type: "mods".to_string(),
                    enabled_map_ids: None,
                    enabled_mod_ids: Some(vec!["mod".to_string()]),
                    launch_args: String::new(),
                    created_at: "1".to_string(),
                    updated_at: "2".to_string(),
                },
            ],
        });

        let profiles = state.profiles_state();
        assert_eq!(profiles.active_map_profile_id, "next-map");
        assert_eq!(profiles.active_mod_profile_id, "next-mod");
        assert_eq!(profiles.profiles[0].launch_args, "-debug");
    }

    #[test]
    fn state_json_can_be_written_and_read() {
        let file = std::env::temp_dir().join(format!("celepkg-state-test-{}.json", now_string()));
        let state = default_state();

        write_json(&file, &state).expect("write state");
        let loaded: AppState = read_json(&file).expect("read state");
        let _ = fs::remove_file(&file);

        assert_eq!(loaded.active_map_profile_id, state.active_map_profile_id);
        assert_eq!(loaded.active_mod_profile_id, state.active_mod_profile_id);
        assert_eq!(loaded.profiles.len(), state.profiles.len());
    }
}
