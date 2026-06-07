use crate::dependency_rules::collect_required_dependency_closure_mod_ids;
use crate::domain::{LaunchResult, Profile, ProfileInput, ProfileType, ProfilesState, ScanResult};
use crate::services::game::{resolve_game_executable, split_launch_args};
use crate::services::scan::{full_scan_cached, write_profile_blacklist};
use crate::storage::{
    load_state, load_state_from_path, resolve_required_celeste_path_from_state, state_path,
    update_state, update_state_at,
};
use crate::utils::{now_string, stable_id};
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn save_profile(profile: ProfileInput) -> Result<ProfilesState, String> {
    let now = now_string();
    let profile_type = profile.profile_type;
    let id = profile
        .id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| stable_id(&format!("{}-{}-{now}", profile.name, profile_type.as_str())));
    update_state(|state| {
        let mut data = state.profiles_state();
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
        Ok(data)
    })
}

pub fn delete_profile(profile_id: String) -> Result<ProfilesState, String> {
    if profile_id == "default-maps" || profile_id == "default-mods" {
        return Err("默认 Profile 不能删除".to_string());
    }
    update_state(|state| {
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
        } else if profile.profile_type == ProfileType::Mods
            && data.active_mod_profile_id == profile_id
        {
            data.active_mod_profile_id = data
                .profiles
                .iter()
                .find(|item| item.profile_type == ProfileType::Mods)
                .map(|item| item.id.clone())
                .unwrap_or_else(|| "default-mods".to_string());
        }
        state.set_profiles_state(data.clone());
        Ok(data)
    })
}

pub fn apply_profile(
    celeste_path: String,
    map_profile_id: String,
    mod_profile_id: String,
) -> Result<ScanResult, String> {
    let applied = apply_profile_to_blacklist(celeste_path, map_profile_id, mod_profile_id)?;
    Ok(scan_applied_profile(&applied))
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

pub fn launch_game(celeste_path: String, launch_args: String) -> Result<LaunchResult, String> {
    let state = load_state()?;
    let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
    let executable = resolve_game_executable(&path);
    if executable.is_empty() {
        return Err("没有找到 Celeste 可执行文件".to_string());
    }
    Command::new(&executable)
        .args(split_launch_args(&launch_args))
        .current_dir(&path)
        .spawn()
        .map_err(|error| format!("启动失败：{error}"))?;
    Ok(LaunchResult {
        launched: true,
        executable,
        map_profile_id: String::new(),
        mod_profile_id: String::new(),
    })
}

struct AppliedProfile {
    path: PathBuf,
    map_profile: Profile,
    mod_profile: Profile,
    profiles: ProfilesState,
    protected_record_ids: Vec<String>,
    selected_save_files: Vec<String>,
}

fn apply_profile_to_blacklist(
    celeste_path: String,
    map_profile_id: String,
    mod_profile_id: String,
) -> Result<AppliedProfile, String> {
    apply_profile_to_blacklist_at(&state_path(), celeste_path, map_profile_id, mod_profile_id)
}

fn apply_profile_to_blacklist_at(
    state_file: &Path,
    celeste_path: String,
    map_profile_id: String,
    mod_profile_id: String,
) -> Result<AppliedProfile, String> {
    let state = load_state_from_path(state_file)?;
    let path = resolve_required_celeste_path_from_state(&celeste_path, &state)?;
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
    crate::services::backup::create_auto_backup_if_enabled(
        &path,
        state.auto_backup_enabled,
        state.auto_backup_cleanup_enabled,
        state.auto_backup_retention_count,
    )?;
    write_profile_blacklist(&path, &enabled_map_ids, &enabled_mod_ids, &scan)?;
    profiles.active_map_profile_id = map_profile.id.clone();
    profiles.active_mod_profile_id = mod_profile.id.clone();
    update_state_at(state_file, |state| {
        state.active_map_profile_id = map_profile.id.clone();
        state.active_mod_profile_id = mod_profile.id.clone();
        Ok(())
    })?;
    Ok(AppliedProfile {
        path,
        map_profile,
        mod_profile,
        profiles,
        protected_record_ids: state.protected_record_ids,
        selected_save_files: state.selected_save_files,
    })
}

fn scan_applied_profile(applied: &AppliedProfile) -> ScanResult {
    full_scan_cached(
        &applied.path,
        applied.profiles.clone(),
        &applied.protected_record_ids,
        &applied.selected_save_files,
    )
}

fn resolve_required_mod_ids(
    scan: &ScanResult,
    enabled_map_ids: &[String],
    base_mod_ids: &[String],
) -> Vec<String> {
    collect_required_dependency_closure_mod_ids(base_mod_ids, &scan.maps, &scan.other_mods, |map| {
        map.protected || enabled_map_ids.contains(&map.id)
    })
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
    use std::fs;

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
            timings: vec![],
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

    #[test]
    fn resolves_required_mods_from_always_enabled_records() {
        let mut always_enabled_map = record(
            "always-enabled-map",
            "AlwaysEnabledMap.zip",
            ModKind::Map,
            "Always Enabled Map",
            &[dependency("MapHelper")],
        );
        always_enabled_map.protected = true;
        let mut always_enabled_mod = record(
            "always-enabled-mod",
            "AlwaysEnabledMod.zip",
            ModKind::Mod,
            "Always Enabled Mod",
            &[dependency("ModHelper")],
        );
        always_enabled_mod.protected = true;
        let scan = ScanResult {
            celeste_path: String::new(),
            mods_path: String::new(),
            blacklist_path: String::new(),
            blacklist_entries: vec![],
            game_executable: String::new(),
            maps: vec![always_enabled_map],
            other_mods: vec![
                always_enabled_mod,
                record(
                    "map-helper",
                    "MapHelper.zip",
                    ModKind::Mod,
                    "MapHelper",
                    &[],
                ),
                record(
                    "mod-helper",
                    "ModHelper.zip",
                    ModKind::Mod,
                    "ModHelper",
                    &[],
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
            timings: vec![],
        };

        let resolved = resolve_required_mod_ids(&scan, &[], &[]);

        assert_eq!(
            resolved,
            vec![
                "always-enabled-mod".to_string(),
                "map-helper".to_string(),
                "mod-helper".to_string()
            ]
        );
    }

    #[test]
    fn applied_profile_scan_uses_returned_state_snapshot() {
        let root = temp_celeste_root("snapshot");
        let state_root = temp_celeste_root("snapshot-state");
        fs::create_dir_all(root.join("Mods")).expect("mods dir");
        fs::create_dir_all(root.join("Saves")).expect("saves dir");
        fs::write(root.join("Saves").join("0.celeste"), "<Save />").expect("save 0");
        fs::write(root.join("Saves").join("2.celeste"), "<Save />").expect("save 2");
        fs::create_dir_all(&state_root).expect("state dir");
        let state_file = state_root.join("state.json");
        write_profile_state(
            &state_file,
            &root,
            vec!["2.celeste".to_string()],
            vec!["snapshot-protected".to_string()],
        );

        let applied = apply_profile_to_blacklist_at(
            &state_file,
            String::new(),
            "map-profile".to_string(),
            "mod-profile".to_string(),
        )
        .expect("apply profile");
        write_profile_state(
            &state_file,
            &root,
            vec!["0.celeste".to_string()],
            Vec::new(),
        );
        let scan = scan_applied_profile(&applied);

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(state_root);

        assert_eq!(applied.selected_save_files, vec!["2.celeste".to_string()]);
        assert_eq!(
            applied.protected_record_ids,
            vec!["snapshot-protected".to_string()]
        );
        assert_eq!(scan.selected_save_files, vec!["2.celeste".to_string()]);
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
            strawberry_total_count: 0,
            completion_status: CompletionStatus::Unknown,
            dependencies: dependencies.to_vec(),
            optional_dependencies: vec![],
            stats: None,
            warnings: vec![],
        }
    }

    fn temp_celeste_root(label: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("celepkg-profile-{label}-{stamp}"))
    }

    fn write_profile_state(
        state_file: &Path,
        root: &Path,
        selected_save_files: Vec<String>,
        protected_record_ids: Vec<String>,
    ) {
        let state = serde_json::json!({
            "celestePath": root.to_string_lossy(),
            "activeMapProfileId": "map-profile",
            "activeModProfileId": "mod-profile",
            "autoBackupEnabled": false,
            "selectedSaveFiles": selected_save_files,
            "protectedRecordIds": protected_record_ids,
            "profiles": [
                {
                    "id": "map-profile",
                    "name": "Map Profile",
                    "profileType": "maps",
                    "enabledMapIds": [],
                    "enabledModIds": [],
                    "launchArgs": "",
                    "createdAt": "1",
                    "updatedAt": "1"
                },
                {
                    "id": "mod-profile",
                    "name": "Mod Profile",
                    "profileType": "mods",
                    "enabledMapIds": null,
                    "enabledModIds": [],
                    "launchArgs": "",
                    "createdAt": "1",
                    "updatedAt": "1"
                }
            ]
        });
        crate::storage::write_json(state_file, &state).expect("write profile state");
    }
}
