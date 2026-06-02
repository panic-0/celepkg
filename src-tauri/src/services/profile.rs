use crate::domain::{LaunchResult, Profile, ProfileInput, ProfileType, ProfilesState, ScanResult};
use crate::services::game::{resolve_game_executable, split_launch_args};
use crate::services::scan::{full_scan_cached, write_profile_blacklist};
use crate::storage::{load_state, resolve_input_path, write_state};
use crate::utils::{normalize_dependency_name, now_string, stable_id};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::process::Command;

pub fn save_profile(profile: ProfileInput) -> Result<ProfilesState, String> {
    let mut state = load_state();
    let mut data = state.profiles_state();
    let now = now_string();
    let profile_type = profile.profile_type;
    let id = profile
        .id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| stable_id(&format!("{}-{}-{now}", profile.name, profile_type.as_str())));
    let normalized = Profile {
        id: id.clone(),
        name: if profile.name.trim().is_empty() {
            if profile_type == ProfileType::Maps {
                "未命名地图 Profile".to_string()
            } else {
                "未命名 Mod Profile".to_string()
            }
        } else {
            profile.name.trim().to_string()
        },
        profile_type,
        enabled_map_ids: if profile_type == ProfileType::Maps {
            profile.enabled_map_ids
        } else {
            None
        },
        enabled_mod_ids: profile.enabled_mod_ids,
        launch_args: if profile_type == ProfileType::Maps {
            profile.launch_args.unwrap_or_default()
        } else {
            String::new()
        },
        created_at: profile.created_at.unwrap_or_else(|| now.clone()),
        updated_at: now,
    };
    if let Some(index) = data.profiles.iter().position(|item| item.id == id) {
        data.profiles[index] = normalized;
    } else {
        data.profiles.push(normalized);
    }
    if profile_type == ProfileType::Maps {
        data.active_map_profile_id = id;
    } else {
        data.active_mod_profile_id = id;
    }
    state.set_profiles_state(data.clone());
    write_state(&state)?;
    Ok(data)
}

pub fn delete_profile(profile_id: String) -> Result<ProfilesState, String> {
    if profile_id == "default-maps" || profile_id == "default-mods" {
        return Err("默认 Profile 不能删除".to_string());
    }
    let mut state = load_state();
    let mut data = state.profiles_state();
    let Some(profile) = data
        .profiles
        .iter()
        .find(|item| item.id == profile_id)
        .cloned()
    else {
        return Err("Profile 不存在".to_string());
    };
    data.profiles.retain(|item| item.id != profile_id);
    if profile.profile_type == ProfileType::Maps && data.active_map_profile_id == profile_id {
        data.active_map_profile_id = data
            .profiles
            .iter()
            .find(|item| item.profile_type == ProfileType::Maps)
            .map(|item| item.id.clone())
            .unwrap_or_else(|| "default-maps".to_string());
    } else if profile.profile_type == ProfileType::Mods && data.active_mod_profile_id == profile_id
    {
        data.active_mod_profile_id = data
            .profiles
            .iter()
            .find(|item| item.profile_type == ProfileType::Mods)
            .map(|item| item.id.clone())
            .unwrap_or_else(|| "default-mods".to_string());
    }
    state.set_profiles_state(data.clone());
    write_state(&state)?;
    Ok(data)
}

pub fn apply_profile(
    celeste_path: String,
    map_profile_id: String,
    mod_profile_id: String,
) -> Result<ScanResult, String> {
    let applied = apply_profile_to_blacklist(celeste_path, map_profile_id, mod_profile_id)?;
    let state = load_state();
    Ok(full_scan_cached(
        &applied.path,
        applied.profiles,
        &state.protected_record_ids,
        &state.selected_save_files,
    ))
}

pub fn launch_profile(
    celeste_path: String,
    map_profile_id: String,
    mod_profile_id: String,
) -> Result<LaunchResult, String> {
    let applied = apply_profile_to_blacklist(celeste_path, map_profile_id, mod_profile_id)?;
    let executable = resolve_game_executable(&applied.path);
    if executable.is_empty() {
        return Err("没有找到 Celeste 可执行文件".to_string());
    }
    let args = split_launch_args(&applied.map_profile.launch_args);
    Command::new(&executable)
        .args(args)
        .current_dir(&applied.path)
        .spawn()
        .map_err(|error| format!("启动失败：{error}"))?;
    Ok(LaunchResult {
        launched: true,
        executable,
        map_profile_id: applied.map_profile.id,
        mod_profile_id: applied.mod_profile.id,
    })
}

struct AppliedProfile {
    path: PathBuf,
    map_profile: Profile,
    mod_profile: Profile,
    profiles: ProfilesState,
}

fn apply_profile_to_blacklist(
    celeste_path: String,
    map_profile_id: String,
    mod_profile_id: String,
) -> Result<AppliedProfile, String> {
    let path = resolve_input_path(&celeste_path);
    let mut state = load_state();
    let mut profiles = state.profiles_state();
    let map_profile = profiles
        .profiles
        .iter()
        .find(|item| item.id == map_profile_id && item.profile_type == ProfileType::Maps)
        .cloned()
        .ok_or_else(|| "地图 Profile 不存在".to_string())?;
    let mod_profile = profiles
        .profiles
        .iter()
        .find(|item| item.id == mod_profile_id && item.profile_type == ProfileType::Mods)
        .cloned()
        .ok_or_else(|| "Mod Profile 不存在".to_string())?;
    let scan = full_scan_cached(
        &path,
        profiles.clone(),
        &state.protected_record_ids,
        &state.selected_save_files,
    );
    let enabled_map_ids = map_profile.enabled_map_ids.clone().unwrap_or_else(|| {
        scan.maps
            .iter()
            .filter(|map| map.enabled)
            .map(|map| map.id.clone())
            .collect()
    });
    let mut enabled_mod_ids = map_profile.enabled_mod_ids.clone().unwrap_or_else(Vec::new);
    let mod_profile_mod_ids = mod_profile.enabled_mod_ids.clone().unwrap_or_else(|| {
        scan.other_mods
            .iter()
            .filter(|mod_item| mod_item.enabled)
            .map(|mod_item| mod_item.id.clone())
            .collect()
    });
    enabled_mod_ids.extend(mod_profile_mod_ids);
    enabled_mod_ids = resolve_required_mod_ids(&scan, &enabled_map_ids, &enabled_mod_ids);
    crate::services::backup::create_auto_backup_if_enabled(&path, state.auto_backup_enabled)?;
    write_profile_blacklist(&path, &enabled_map_ids, &enabled_mod_ids, &scan)?;
    profiles.active_map_profile_id = map_profile.id.clone();
    profiles.active_mod_profile_id = mod_profile.id.clone();
    state.set_profiles_state(profiles.clone());
    write_state(&state)?;
    Ok(AppliedProfile {
        path,
        map_profile,
        mod_profile,
        profiles,
    })
}

fn resolve_required_mod_ids(
    scan: &ScanResult,
    enabled_map_ids: &[String],
    base_mod_ids: &[String],
) -> Vec<String> {
    let mod_by_id: HashMap<String, _> = scan
        .other_mods
        .iter()
        .map(|mod_item| (mod_item.id.clone(), mod_item))
        .collect();
    let alias_to_mod_id = mod_alias_map(scan);
    let mut enabled: HashSet<String> = base_mod_ids.iter().cloned().collect();
    let mut queue: VecDeque<String> = base_mod_ids.iter().cloned().collect();

    for map in scan
        .maps
        .iter()
        .filter(|map| enabled_map_ids.contains(&map.id))
    {
        for dependency in &map.dependencies {
            if let Some(mod_id) = resolve_dependency_id(&dependency.name, &alias_to_mod_id) {
                if enabled.insert(mod_id.clone()) {
                    queue.push_back(mod_id);
                }
            }
        }
    }

    while let Some(mod_id) = queue.pop_front() {
        let Some(mod_item) = mod_by_id.get(&mod_id) else {
            continue;
        };
        for dependency in &mod_item.dependencies {
            if let Some(next_id) = resolve_dependency_id(&dependency.name, &alias_to_mod_id) {
                if enabled.insert(next_id.clone()) {
                    queue.push_back(next_id);
                }
            }
        }
    }

    let mut result: Vec<String> = enabled.into_iter().collect();
    result.sort();
    result
}

fn mod_alias_map(scan: &ScanResult) -> HashMap<String, String> {
    let mut aliases = HashMap::new();
    for mod_item in &scan.other_mods {
        for alias in [
            mod_item.id.as_str(),
            mod_item.name.as_str(),
            mod_item.metadata.name.as_str(),
            mod_item.file_name.as_str(),
            mod_item.file_name.trim_end_matches(".zip"),
            mod_item.relative_path.as_str(),
        ] {
            let normalized = normalize_dependency_name(alias);
            if !normalized.is_empty() {
                aliases.insert(normalized, mod_item.id.clone());
            }
        }
    }
    aliases
}

fn resolve_dependency_id(name: &str, alias_to_mod_id: &HashMap<String, String>) -> Option<String> {
    alias_to_mod_id
        .get(&normalize_dependency_name(name))
        .cloned()
}

impl ProfileType {
    fn as_str(self) -> &'static str {
        match self {
            ProfileType::Maps => "maps",
            ProfileType::Mods => "mods",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{CompletionStatus, Dependency, ModKind, ModMetadata, ModRecord};

    #[test]
    fn resolves_required_mods_from_maps_and_mods_recursively() {
        let scan = ScanResult {
            celeste_path: String::new(),
            mods_path: String::new(),
            blacklist_path: String::new(),
            blacklist_entries: vec![],
            game_executable: String::new(),
            maps: vec![record(
                "map",
                "Adventure.zip",
                ModKind::Map,
                "Adventure",
                &[dependency("Helper One")],
            )],
            other_mods: vec![
                record(
                    "helper-one",
                    "Helper_One.zip",
                    ModKind::Mod,
                    "Helper One",
                    &[dependency("CoreHelper")],
                ),
                record(
                    "core-helper",
                    "CoreHelper.zip",
                    ModKind::Mod,
                    "CoreHelper",
                    &[],
                ),
                record(
                    "visual-pack",
                    "VisualPack.zip",
                    ModKind::Mod,
                    "VisualPack",
                    &[dependency("CoreHelper")],
                ),
            ],
            profiles: ProfilesState {
                active_map_profile_id: "maps".to_string(),
                active_mod_profile_id: "mods".to_string(),
                profiles: vec![],
            },
            available_save_files: vec![],
            selected_save_files: vec![],
            warnings: vec![],
        };

        let resolved =
            resolve_required_mod_ids(&scan, &["map".to_string()], &["visual-pack".to_string()]);

        assert_eq!(
            resolved,
            vec![
                "core-helper".to_string(),
                "helper-one".to_string(),
                "visual-pack".to_string()
            ]
        );
    }

    fn dependency(name: &str) -> Dependency {
        Dependency {
            name: name.to_string(),
            version: String::new(),
        }
    }

    fn record(
        id: &str,
        relative_path: &str,
        kind: ModKind,
        name: &str,
        dependencies: &[Dependency],
    ) -> ModRecord {
        ModRecord {
            id: id.to_string(),
            name: name.to_string(),
            file_name: relative_path.to_string(),
            relative_path: relative_path.to_string(),
            absolute_path: relative_path.to_string(),
            is_archive: true,
            kind,
            metadata: ModMetadata {
                name: name.to_string(),
                dependencies: dependencies.to_vec(),
                ..ModMetadata::default()
            },
            enabled: true,
            favorite: false,
            protected: false,
            read_only: false,
            map_ids: vec![],
            sub_maps: vec![],
            map_count: 0,
            strawberry_count: 0,
            completion_status: CompletionStatus::Unknown,
            dependencies: dependencies.to_vec(),
            optional_dependencies: vec![],
            stats: None,
            warnings: vec![],
        }
    }
}
