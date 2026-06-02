use crate::domain::{Profile, ProfileType, ProfilesState};
use crate::utils::{now_string, stable_id};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    #[serde(default)]
    pub celeste_path: String,
    #[serde(default = "default_active_map_profile_id")]
    pub active_map_profile_id: String,
    #[serde(default = "default_active_mod_profile_id")]
    pub active_mod_profile_id: String,
    #[serde(default = "default_auto_backup_enabled")]
    pub auto_backup_enabled: bool,
    #[serde(default = "default_selected_save_files")]
    pub selected_save_files: Vec<String>,
    #[serde(default)]
    pub protected_record_ids: Vec<String>,
    #[serde(default)]
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

pub fn load_state() -> Result<AppState, String> {
    load_state_from_path(&state_path())
}

fn load_state_from_path(file: &Path) -> Result<AppState, String> {
    if file.exists() {
        let mut state = read_state_json(file)?;
        normalize_profiles(&mut state);
        return Ok(state);
    }
    let state = default_state();
    write_json(file, &state)?;
    Ok(state)
}

pub fn write_state(state: &AppState) -> Result<(), String> {
    write_json(&state_path(), state)
}

pub fn normalize_configured_celeste_path(state: &mut AppState) -> Result<Vec<String>, String> {
    normalize_configured_celeste_path_at(state, &state_path())
}

fn normalize_configured_celeste_path_at(
    state: &mut AppState,
    state_file: &Path,
) -> Result<Vec<String>, String> {
    let configured = state.celeste_path.trim();
    if configured.is_empty() {
        return Ok(vec![]);
    }
    let path = PathBuf::from(configured);
    if !path.exists() || !path.is_dir() {
        let previous = state.celeste_path.clone();
        state.celeste_path.clear();
        write_json(state_file, state)?;
        return Ok(vec![format!(
            "配置中的 Celeste 路径不可用，已清空：{previous}"
        )]);
    }
    if !path.is_absolute() {
        return Ok(vec![
            "配置中的 Celeste 路径不是绝对路径，请重新选择。".to_string()
        ]);
    }
    if !looks_like_celeste_dir(&path) {
        return Ok(vec![format!(
            "配置中的路径存在，但看起来不是 Celeste 游戏目录：{}",
            path.display()
        )]);
    }
    Ok(vec![])
}

pub fn resolve_input_path_from_state(value: &str, state: &AppState) -> PathBuf {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        PathBuf::from(state.celeste_path.trim())
    } else {
        PathBuf::from(trimmed)
    }
}

pub fn resolve_required_celeste_path(value: &str) -> Result<PathBuf, String> {
    let state = load_state()?;
    resolve_required_celeste_path_from_state(value, &state)
}

pub fn resolve_required_celeste_path_from_state(
    value: &str,
    state: &AppState,
) -> Result<PathBuf, String> {
    let path = resolve_input_path_from_state(value, state);
    validate_celeste_path(&path)?;
    Ok(path)
}

fn validate_celeste_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("请先设置 Celeste 安装目录".to_string());
    }
    if !path.is_absolute() {
        return Err("Celeste 安装目录必须是绝对路径".to_string());
    }
    if !path.is_dir() {
        return Err("Celeste 安装目录不存在".to_string());
    }
    if !looks_like_celeste_dir(path) {
        return Err("请选择 Celeste 安装目录，而不是普通文件夹".to_string());
    }
    Ok(())
}

fn looks_like_celeste_dir(path: &Path) -> bool {
    path.join("Mods").is_dir()
        || path.join("Content").is_dir()
        || ["Celeste.exe", "Celeste", "Celeste.bin.x86_64"]
            .iter()
            .any(|name| path.join(name).is_file())
}

fn default_state() -> AppState {
    let now = now_string();
    AppState {
        celeste_path: find_default_celeste_path(),
        active_map_profile_id: "default-maps".to_string(),
        active_mod_profile_id: "default-mods".to_string(),
        auto_backup_enabled: default_auto_backup_enabled(),
        selected_save_files: default_selected_save_files(),
        protected_record_ids: vec![],
        profiles: vec![
            Profile {
                id: "default-maps".to_string(),
                name: "Main Profile".to_string(),
                profile_type: ProfileType::Maps,
                enabled_map_ids: None,
                enabled_mod_ids: None,
                launch_args: String::new(),
                created_at: now.clone(),
                updated_at: now.clone(),
            },
            Profile {
                id: "default-mods".to_string(),
                name: "Main Profile".to_string(),
                profile_type: ProfileType::Mods,
                enabled_map_ids: None,
                enabled_mod_ids: None,
                launch_args: String::new(),
                created_at: now.clone(),
                updated_at: now,
            },
        ],
    }
}

fn default_active_map_profile_id() -> String {
    "default-maps".to_string()
}

fn default_active_mod_profile_id() -> String {
    "default-mods".to_string()
}

fn normalize_profiles(state: &mut AppState) {
    let now = now_string();
    if let Some(profile) = state
        .profiles
        .iter_mut()
        .find(|profile| profile.id == "default-maps")
    {
        if profile.name == "当前地图启用状态" {
            profile.name = "Main Profile".to_string();
        }
    }
    if let Some(profile) = state
        .profiles
        .iter_mut()
        .find(|profile| profile.id == "default-mods")
    {
        if profile.name == "当前 Mod 启用状态" {
            profile.name = "Main Profile".to_string();
        }
    }
    if !state
        .profiles
        .iter()
        .any(|profile| profile.profile_type == ProfileType::Maps)
    {
        state.profiles.push(Profile {
            id: "default-maps".to_string(),
            name: "Main Profile".to_string(),
            profile_type: ProfileType::Maps,
            enabled_map_ids: None,
            enabled_mod_ids: None,
            launch_args: String::new(),
            created_at: now.clone(),
            updated_at: now.clone(),
        });
    }
    if !state
        .profiles
        .iter()
        .any(|profile| profile.profile_type == ProfileType::Mods)
    {
        state.profiles.push(Profile {
            id: "default-mods".to_string(),
            name: "Main Profile".to_string(),
            profile_type: ProfileType::Mods,
            enabled_map_ids: None,
            enabled_mod_ids: None,
            launch_args: String::new(),
            created_at: now.clone(),
            updated_at: now,
        });
    }
    if !state.profiles.iter().any(|profile| {
        profile.id == state.active_map_profile_id && profile.profile_type == ProfileType::Maps
    }) {
        state.active_map_profile_id = state
            .profiles
            .iter()
            .find(|profile| profile.profile_type == ProfileType::Maps)
            .map(|profile| profile.id.clone())
            .unwrap_or_else(|| "default-maps".to_string());
    }
    if !state.profiles.iter().any(|profile| {
        profile.id == state.active_mod_profile_id && profile.profile_type == ProfileType::Mods
    }) {
        state.active_mod_profile_id = state
            .profiles
            .iter()
            .find(|profile| profile.profile_type == ProfileType::Mods)
            .map(|profile| profile.id.clone())
            .unwrap_or_else(|| "default-mods".to_string());
    }
}

fn default_auto_backup_enabled() -> bool {
    true
}

fn default_selected_save_files() -> Vec<String> {
    vec!["0.celeste".to_string()]
}

pub fn app_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("celepkg")
}

pub fn state_path() -> PathBuf {
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

fn read_state_json(file: &Path) -> Result<AppState, String> {
    let text = fs::read_to_string(file).map_err(|error| {
        format!(
            "读取配置失败：{}：{error}。不会覆盖原配置或 Profile，请修复或删除该文件后重试。",
            file.display()
        )
    })?;
    serde_json::from_str(&text).map_err(|error| {
        format!(
            "解析配置失败：{}：{error}。不会覆盖原配置或 Profile，请修复或删除该文件后重试。",
            file.display()
        )
    })
}

pub fn write_json<T: Serialize>(file: &Path, value: &T) -> Result<(), String> {
    let text =
        serde_json::to_string_pretty(value).map_err(|error| format!("序列化配置失败：{error}"))?;
    write_text_file(file, &text)
}

pub fn write_text_file(file: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建配置目录失败：{error}"))?;
    }
    let parent = file.parent().unwrap_or_else(|| Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("创建临时文件失败：{error}"))?;
    temp.write_all(text.as_bytes())
        .map_err(|error| format!("写入临时文件失败：{error}"))?;
    temp.flush()
        .map_err(|error| format!("刷新临时文件失败：{error}"))?;
    temp.persist(file)
        .map(|_| ())
        .map_err(|error| format!("替换文件失败：{}", error.error))
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
        assert!(state.auto_backup_enabled);
        assert_eq!(state.selected_save_files, vec!["0.celeste".to_string()]);
        assert!(state.protected_record_ids.is_empty());
        assert_eq!(state.profiles.len(), 2);
        assert_eq!(state.profiles[0].profile_type, ProfileType::Maps);
        assert_eq!(state.profiles[1].profile_type, ProfileType::Mods);
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
                    profile_type: ProfileType::Maps,
                    enabled_map_ids: Some(vec!["map".to_string()]),
                    enabled_mod_ids: Some(vec!["helper".to_string()]),
                    launch_args: "-debug".to_string(),
                    created_at: "1".to_string(),
                    updated_at: "2".to_string(),
                },
                Profile {
                    id: "next-mod".to_string(),
                    name: "Next Mod".to_string(),
                    profile_type: ProfileType::Mods,
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
    fn required_celeste_path_rejects_empty_or_relative_paths() {
        let mut state = default_state();
        state.celeste_path = String::new();

        assert!(resolve_required_celeste_path_from_state("", &state).is_err());
        assert!(resolve_required_celeste_path_from_state("Celeste", &state).is_err());
    }

    #[test]
    fn required_celeste_path_rejects_plain_directory() {
        let root = temp_dir("plain");
        fs::create_dir_all(&root).expect("plain dir");
        let mut state = default_state();
        state.celeste_path = root.to_string_lossy().to_string();

        assert!(resolve_required_celeste_path_from_state("", &state).is_err());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn required_celeste_path_accepts_directory_that_looks_like_celeste() {
        let root = temp_dir("celeste");
        fs::create_dir_all(root.join("Mods")).expect("mods dir");
        let mut state = default_state();
        state.celeste_path = root.to_string_lossy().to_string();

        assert_eq!(
            resolve_required_celeste_path_from_state("", &state).expect("celeste path"),
            root
        );

        let _ = fs::remove_dir_all(root);
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

    #[test]
    fn missing_state_json_creates_default_state() {
        let root = temp_dir("missing-state");
        let file = root.join("state.json");

        let state = load_state_from_path(&file).expect("default state");
        let loaded: AppState = read_json(&file).expect("written state");
        let _ = fs::remove_dir_all(root);

        assert_eq!(state.active_map_profile_id, "default-maps");
        assert_eq!(state.active_mod_profile_id, "default-mods");
        assert_eq!(loaded.profiles.len(), 2);
    }

    #[test]
    fn invalid_state_json_errors_without_overwriting_file() {
        let root = temp_dir("invalid-state");
        fs::create_dir_all(&root).expect("state dir");
        let file = root.join("state.json");
        let original = "{ invalid json";
        fs::write(&file, original).expect("write invalid state");

        let error = load_state_from_path(&file).expect_err("invalid state should fail");
        let text = fs::read_to_string(&file).expect("read state");
        let _ = fs::remove_dir_all(root);

        assert!(error.contains("解析配置失败"));
        assert!(error.contains("不会覆盖原配置或 Profile"));
        assert_eq!(text, original);
    }

    #[test]
    fn invalid_state_shape_errors_without_overwriting_file() {
        let root = temp_dir("invalid-state-shape");
        fs::create_dir_all(&root).expect("state dir");
        let file = root.join("state.json");
        let original = r#"{"profiles":"not an array"}"#;
        fs::write(&file, original).expect("write invalid state");

        let error = load_state_from_path(&file).expect_err("invalid state shape should fail");
        let text = fs::read_to_string(&file).expect("read state");
        let _ = fs::remove_dir_all(root);

        assert!(error.contains("解析配置失败"));
        assert_eq!(text, original);
    }

    #[test]
    fn old_state_without_profiles_or_active_ids_is_migrated_in_memory() {
        let root = temp_dir("old-state");
        fs::create_dir_all(&root).expect("state dir");
        let file = root.join("state.json");
        let original = r#"{"celestePath":"C:\\Games\\Celeste"}"#;
        fs::write(&file, original).expect("write old state");

        let state = load_state_from_path(&file).expect("old state should migrate");
        let text = fs::read_to_string(&file).expect("read state");
        let _ = fs::remove_dir_all(root);

        assert_eq!(state.celeste_path, r"C:\Games\Celeste");
        assert_eq!(state.active_map_profile_id, "default-maps");
        assert_eq!(state.active_mod_profile_id, "default-mods");
        assert_eq!(state.profiles.len(), 2);
        assert_eq!(text, original);
    }

    #[test]
    fn missing_configured_celeste_path_is_cleared_and_written() {
        let root = temp_dir("missing-configured-celeste");
        let file = root.join("state.json");
        let missing = root.join("missing-celeste");
        let mut state = default_state();
        state.celeste_path = missing.to_string_lossy().to_string();

        let warnings =
            normalize_configured_celeste_path_at(&mut state, &file).expect("normalize path");
        let written: AppState = read_json(&file).expect("written state");
        let _ = fs::remove_dir_all(root);

        assert!(warnings[0].contains("已清空"));
        assert_eq!(state.celeste_path, "");
        assert_eq!(written.celeste_path, "");
    }

    #[test]
    fn plain_existing_configured_directory_is_kept_with_warning() {
        let root = temp_dir("plain-configured-celeste");
        let plain = root.join("plain");
        fs::create_dir_all(&plain).expect("plain dir");
        let file = root.join("state.json");
        let original = "unchanged";
        fs::write(&file, original).expect("write marker");
        let mut state = default_state();
        state.celeste_path = plain.to_string_lossy().to_string();

        let warnings =
            normalize_configured_celeste_path_at(&mut state, &file).expect("normalize path");
        let text = fs::read_to_string(&file).expect("read marker");
        let _ = fs::remove_dir_all(root);

        assert!(warnings[0].contains("不是 Celeste 游戏目录"));
        assert_eq!(state.celeste_path, plain.to_string_lossy());
        assert_eq!(text, original);
    }

    #[test]
    fn valid_configured_celeste_directory_has_no_warning() {
        let root = temp_dir("valid-configured-celeste");
        fs::create_dir_all(root.join("Mods")).expect("mods dir");
        let file = root.join("state.json");
        let mut state = default_state();
        state.celeste_path = root.to_string_lossy().to_string();

        let warnings =
            normalize_configured_celeste_path_at(&mut state, &file).expect("normalize path");
        let _ = fs::remove_dir_all(&root);

        assert!(warnings.is_empty());
        assert_eq!(state.celeste_path, root.to_string_lossy());
    }

    fn temp_dir(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("celepkg-storage-{label}-{}", now_string()))
    }
}
