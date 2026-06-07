use crate::domain::{
    BackupFileCategory, BackupFileEntry, BackupInfo, BackupKind, BackupModEntry, ModMetadata,
};
use crate::parsers::everest::parse_metadata;
use crate::storage::{read_json, write_json};
use crate::utils::normalize_slash;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zip::ZipArchive;

const RESTORE_SCOPE_ALL: &str = "all";
const RESTORE_SCOPE_GAME: &str = "game";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    id: String,
    created_at: String,
    kind: BackupKind,
    celeste_path: String,
    files: Vec<BackupFileEntry>,
    #[serde(default)]
    mods: Vec<BackupModEntry>,
}

pub fn create_manual_backup(celeste_path: &Path) -> Result<BackupInfo, String> {
    create_backup(celeste_path, BackupKind::Manual)
}

pub fn create_auto_backup(celeste_path: &Path) -> Result<BackupInfo, String> {
    create_backup(celeste_path, BackupKind::Auto)
}

pub fn create_auto_backup_if_enabled(
    celeste_path: &Path,
    enabled: bool,
    cleanup_enabled: bool,
    retention_count: usize,
) -> Result<(), String> {
    if enabled {
        create_auto_backup(celeste_path)?;
        if cleanup_enabled {
            cleanup_auto_backups(celeste_path, retention_count)?;
        }
    }
    Ok(())
}

pub fn list_backups(celeste_path: &Path) -> Result<Vec<BackupInfo>, String> {
    Ok(list_backups_in(&backups_dir(celeste_path)))
}

pub fn restore_backup(
    celeste_path: &Path,
    backup_id: &str,
    scope: &str,
) -> Result<BackupInfo, String> {
    let backup_path = backups_dir(celeste_path).join(safe_backup_id(backup_id));
    let info = read_backup_info(&backup_path).ok_or_else(|| "备份不存在".to_string())?;
    let normalized_scope = normalize_restore_scope(scope)?;
    for file in info
        .files
        .iter()
        .filter(|file| should_restore_file(file, normalized_scope))
    {
        restore_file(&backup_path, celeste_path, file)?;
    }
    Ok(info)
}

pub fn delete_backup(celeste_path: &Path, backup_id: &str) -> Result<(), String> {
    delete_backup_in(&backups_dir(celeste_path), backup_id)
}

pub fn cleanup_auto_backups(
    celeste_path: &Path,
    keep_count: usize,
) -> Result<Vec<BackupInfo>, String> {
    cleanup_auto_backups_in(&backups_dir(celeste_path), keep_count)
}

fn create_backup(celeste_path: &Path, kind: BackupKind) -> Result<BackupInfo, String> {
    create_backup_in(&backups_dir(celeste_path), celeste_path, kind)
}

fn create_backup_in(
    backups_root: &Path,
    celeste_path: &Path,
    kind: BackupKind,
) -> Result<BackupInfo, String> {
    let now = backup_timestamp();
    let id = now.clone();
    let backup_path = backups_root.join(&id);
    fs::create_dir_all(&backup_path).map_err(|error| format!("创建备份目录失败：{error}"))?;

    let mut files = vec![];
    for source in backup_sources(celeste_path) {
        files.push(copy_backup_source(&backup_path, source)?);
    }

    let manifest = BackupManifest {
        id: id.clone(),
        created_at: now,
        kind,
        celeste_path: celeste_path.to_string_lossy().to_string(),
        files,
        mods: collect_installed_mods(celeste_path),
    };
    write_json(&backup_path.join("manifest.json"), &manifest)?;
    read_backup_info(&backup_path).ok_or_else(|| "读取备份清单失败".to_string())
}

fn backup_sources(celeste_path: &Path) -> Vec<BackupSource> {
    vec![
        BackupSource {
            category: BackupFileCategory::Game,
            label: "Mods/blacklist.txt",
            target: celeste_path.join("Mods").join("blacklist.txt"),
            backup_relative: PathBuf::from("game").join("Mods").join("blacklist.txt"),
        },
        BackupSource {
            category: BackupFileCategory::Game,
            label: "Mods/favorites.txt",
            target: celeste_path.join("Mods").join("favorites.txt"),
            backup_relative: PathBuf::from("game").join("Mods").join("favorites.txt"),
        },
    ]
}

fn copy_backup_source(backup_path: &Path, source: BackupSource) -> Result<BackupFileEntry, String> {
    let destination = backup_path.join(&source.backup_relative);
    let existed = source.target.is_file();
    if existed {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建备份文件夹失败：{error}"))?;
        }
        fs::copy(&source.target, &destination)
            .map_err(|error| format!("复制备份文件失败：{error}"))?;
    }
    Ok(BackupFileEntry {
        category: source.category,
        label: source.label.to_string(),
        target_path: source.target.to_string_lossy().to_string(),
        backup_path: normalize_slash(&source.backup_relative.to_string_lossy()),
        existed,
    })
}

fn restore_file(
    backup_path: &Path,
    celeste_path: &Path,
    file: &BackupFileEntry,
) -> Result<(), String> {
    let target = restore_target_path(celeste_path, file)?;
    if file.existed {
        let source = restore_source_path(backup_path, file)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建还原目录失败：{error}"))?;
        }
        fs::copy(source, target).map_err(|error| format!("还原备份文件失败：{error}"))?;
    } else if target.exists() {
        fs::remove_file(target).map_err(|error| format!("移除还原目标失败：{error}"))?;
    }
    Ok(())
}

fn restore_target_path(celeste_path: &Path, file: &BackupFileEntry) -> Result<PathBuf, String> {
    let target = PathBuf::from(&file.target_path);
    if !target.is_absolute() || path_contains_parent_dir(&target) {
        return Err("备份清单中的还原目标路径无效".to_string());
    }
    let allowed_targets = backup_sources(celeste_path)
        .into_iter()
        .filter(|source| source.category == file.category && source.label == file.label)
        .map(|source| source.target)
        .collect::<Vec<_>>();
    if allowed_targets
        .iter()
        .any(|allowed| paths_match_for_restore(&target, allowed))
    {
        Ok(target)
    } else {
        Err("备份清单中的还原目标不属于受管文件".to_string())
    }
}

fn restore_source_path(backup_path: &Path, file: &BackupFileEntry) -> Result<PathBuf, String> {
    let relative = PathBuf::from(&file.backup_path);
    if relative.is_absolute()
        || path_contains_parent_dir(&relative)
        || path_has_root_or_prefix(&relative)
    {
        return Err("备份清单中的备份文件路径无效".to_string());
    }
    let source = backup_path.join(relative);
    let canonical_backup = backup_path
        .canonicalize()
        .map_err(|error| format!("读取备份目录失败：{error}"))?;
    let canonical_source = source
        .canonicalize()
        .map_err(|error| format!("读取备份文件失败：{error}"))?;
    if !canonical_source.starts_with(&canonical_backup) {
        return Err("备份文件不在备份快照目录中".to_string());
    }
    Ok(canonical_source)
}

fn path_contains_parent_dir(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::ParentDir))
}

fn path_has_root_or_prefix(path: &Path) -> bool {
    path.components()
        .any(|component| matches!(component, Component::RootDir | Component::Prefix(_)))
}

fn paths_match_for_restore(left: &Path, right: &Path) -> bool {
    normalize_slash(&left.to_string_lossy())
        .eq_ignore_ascii_case(&normalize_slash(&right.to_string_lossy()))
}

fn read_backup_info(backup_path: &Path) -> Option<BackupInfo> {
    let manifest: BackupManifest = read_json(&backup_path.join("manifest.json"))?;
    Some(BackupInfo {
        id: manifest.id,
        created_at: manifest.created_at,
        kind: manifest.kind,
        celeste_path: manifest.celeste_path,
        backup_path: backup_path.to_string_lossy().to_string(),
        files: manifest.files,
        mods: manifest.mods,
    })
}

fn delete_backup_in(backups_root: &Path, backup_id: &str) -> Result<(), String> {
    let backup_path = backup_path_for_id(backups_root, backup_id)?;
    read_backup_info(&backup_path).ok_or_else(|| "备份不存在".to_string())?;
    fs::remove_dir_all(&backup_path).map_err(|error| format!("删除备份失败：{error}"))
}

fn cleanup_auto_backups_in(
    backups_root: &Path,
    keep_count: usize,
) -> Result<Vec<BackupInfo>, String> {
    let backups = list_backups_in(backups_root);
    let mut auto_backups: Vec<_> = backups
        .iter()
        .filter(|backup| backup.kind == BackupKind::Auto)
        .cloned()
        .collect();
    auto_backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));

    for backup in auto_backups.into_iter().skip(keep_count) {
        delete_backup_in(backups_root, &backup.id)?;
    }

    Ok(list_backups_in(backups_root))
}

fn list_backups_in(backups_root: &Path) -> Vec<BackupInfo> {
    let Ok(entries) = fs::read_dir(backups_root) else {
        return vec![];
    };
    let mut backups = vec![];
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        if let Some(info) = read_backup_info(&entry.path()) {
            backups.push(info);
        }
    }
    backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    backups
}

fn should_restore_file(file: &BackupFileEntry, scope: &str) -> bool {
    file.category == RESTORE_SCOPE_GAME
        && (scope == RESTORE_SCOPE_ALL || scope == RESTORE_SCOPE_GAME)
}

fn normalize_restore_scope(scope: &str) -> Result<&'static str, String> {
    match scope {
        RESTORE_SCOPE_ALL => Ok(RESTORE_SCOPE_ALL),
        RESTORE_SCOPE_GAME => Ok(RESTORE_SCOPE_GAME),
        _ => Err("还原范围无效".to_string()),
    }
}

pub fn backups_dir(celeste_path: &Path) -> PathBuf {
    celeste_path.join("celepkg").join("backups")
}

fn backup_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .to_string()
}

fn safe_backup_id(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-')
        .collect()
}

fn backup_path_for_id(backups_root: &Path, backup_id: &str) -> Result<PathBuf, String> {
    let safe_id = safe_backup_id(backup_id);
    if safe_id.is_empty() || safe_id != backup_id {
        return Err("备份 ID 无效".to_string());
    }
    Ok(backups_root.join(safe_id))
}

fn collect_installed_mods(celeste_path: &Path) -> Vec<BackupModEntry> {
    let mods_path = celeste_path.join("Mods");
    let blacklist = read_backup_blacklist(&mods_path);
    let Ok(entries) = fs::read_dir(&mods_path) else {
        return vec![];
    };
    let mut mods = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.eq_ignore_ascii_case("blacklist.txt")
                || file_name.eq_ignore_ascii_case("favorites.txt")
            {
                return None;
            }
            let is_archive = path.is_file() && file_name.to_lowercase().ends_with(".zip");
            if !path.is_dir() && !is_archive {
                return None;
            }
            let metadata = read_backup_mod_metadata(&path, is_archive);
            Some(create_backup_mod_entry(
                &path, &mods_path, is_archive, metadata, &blacklist,
            ))
        })
        .collect::<Vec<_>>();
    mods.sort_by(|left, right| left.name.cmp(&right.name));
    mods
}

fn create_backup_mod_entry(
    path: &Path,
    mods_path: &Path,
    is_archive: bool,
    metadata: ModMetadata,
    blacklist: &[String],
) -> BackupModEntry {
    let relative_path = normalize_slash(
        &path
            .strip_prefix(mods_path)
            .unwrap_or(path)
            .to_string_lossy(),
    );
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| relative_path.clone());
    let fallback_name = file_name.trim_end_matches(".zip").replace(['_', '-'], " ");
    let name = if metadata.name.is_empty() {
        fallback_name
    } else {
        metadata.name.clone()
    };
    BackupModEntry {
        enabled: !is_backup_mod_blacklisted(
            &file_name,
            &relative_path,
            &name,
            &metadata,
            blacklist,
        ),
        name,
        metadata_name: metadata.name,
        file_name,
        relative_path,
        version: metadata.version,
        is_archive,
    }
}

fn read_backup_mod_metadata(path: &Path, is_archive: bool) -> ModMetadata {
    let yaml_text = if is_archive {
        read_zip_everest_yaml(path)
    } else {
        read_directory_everest_yaml(path)
    };
    parse_metadata(&yaml_text)
}

fn read_directory_everest_yaml(path: &Path) -> String {
    ["everest.yaml", "everest.yml"]
        .iter()
        .find_map(|file_name| fs::read_to_string(path.join(file_name)).ok())
        .unwrap_or_default()
}

fn read_zip_everest_yaml(path: &Path) -> String {
    let Ok(file) = File::open(path) else {
        return String::new();
    };
    let Ok(mut archive) = ZipArchive::new(file) else {
        return String::new();
    };
    for index in 0..archive.len() {
        let Ok(mut file) = archive.by_index(index) else {
            continue;
        };
        if is_everest_yaml_entry(&normalize_slash(file.name())) {
            let mut text = String::new();
            let _ = file.read_to_string(&mut text);
            return text;
        }
    }
    String::new()
}

fn read_backup_blacklist(mods_path: &Path) -> Vec<String> {
    fs::read_to_string(mods_path.join("blacklist.txt"))
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| normalize_slash(line).to_lowercase())
        .collect()
}

fn is_backup_mod_blacklisted(
    file_name: &str,
    relative_path: &str,
    name: &str,
    metadata: &ModMetadata,
    blacklist: &[String],
) -> bool {
    [
        file_name,
        relative_path,
        name,
        metadata.name.as_str(),
        file_name.trim_end_matches(".zip"),
    ]
    .iter()
    .filter(|value| !value.is_empty())
    .map(|value| normalize_slash(value).to_lowercase())
    .any(|value| blacklist.contains(&value))
}

fn is_everest_yaml_entry(entry: &str) -> bool {
    let basename = entry.rsplit('/').next().unwrap_or(entry);
    basename.eq_ignore_ascii_case("everest.yaml") || basename.eq_ignore_ascii_case("everest.yml")
}

struct BackupSource {
    category: BackupFileCategory,
    label: &'static str,
    target: PathBuf,
    backup_relative: PathBuf,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    const BACKUP_KIND_AUTO: BackupKind = BackupKind::Auto;
    const BACKUP_KIND_MANUAL: BackupKind = BackupKind::Manual;

    #[test]
    fn manual_backup_copies_game_files() {
        let root = temp_root("game");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        let mods = celeste.join("Mods");
        fs::create_dir_all(&mods).expect("mods");
        write_file(&mods.join("blacklist.txt"), "blacklist-one");
        write_file(&mods.join("favorites.txt"), "favorites-one");

        let backup = create_backup_in(&backups, &celeste, BACKUP_KIND_MANUAL).expect("backup");

        assert_eq!(backup.kind, BACKUP_KIND_MANUAL);
        assert!(!PathBuf::from(&backup.backup_path).join("state").exists());
        assert!(PathBuf::from(&backup.backup_path)
            .join("game")
            .join("Mods")
            .join("blacklist.txt")
            .is_file());
        assert!(PathBuf::from(&backup.backup_path)
            .join("game")
            .join("Mods")
            .join("favorites.txt")
            .is_file());
        assert_eq!(
            backup
                .files
                .iter()
                .filter(|file| file.category == "game")
                .count(),
            2
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_files_are_recorded_and_not_restored_as_empty_files() {
        let root = temp_root("missing");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        let mods = celeste.join("Mods");
        fs::create_dir_all(&mods).expect("mods");
        write_file(&mods.join("blacklist.txt"), "blacklist-one");

        let backup = create_backup_in(&backups, &celeste, BACKUP_KIND_MANUAL).expect("backup");
        let favorites = mods.join("favorites.txt");
        write_file(&favorites, "created-after-backup");
        restore_backup_in(&backups, &backup.id, RESTORE_SCOPE_GAME).expect("restore");

        let favorite_entry = backup
            .files
            .iter()
            .find(|file| file.label == "Mods/favorites.txt")
            .expect("favorites entry");
        assert!(!favorite_entry.existed);
        assert!(!favorites.exists());
        assert_eq!(
            fs::read_to_string(mods.join("blacklist.txt")).expect("blacklist"),
            "blacklist-one"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restore_scopes_can_restore_game_or_all() {
        let root = temp_root("restore");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        let mods = celeste.join("Mods");
        fs::create_dir_all(&mods).expect("mods");
        write_file(&mods.join("blacklist.txt"), "blacklist-original");
        write_file(&mods.join("favorites.txt"), "favorites-original");

        let backup = create_backup_in(&backups, &celeste, BACKUP_KIND_AUTO).expect("backup");

        write_file(&mods.join("blacklist.txt"), "blacklist-changed");
        restore_backup_in(&backups, &backup.id, RESTORE_SCOPE_GAME).expect("restore game");
        assert_eq!(
            fs::read_to_string(mods.join("blacklist.txt")).expect("blacklist"),
            "blacklist-original"
        );

        write_file(&mods.join("blacklist.txt"), "blacklist-changed-again");
        write_file(&mods.join("favorites.txt"), "favorites-changed");
        restore_backup_in(&backups, &backup.id, RESTORE_SCOPE_ALL).expect("restore all");
        assert_eq!(
            fs::read_to_string(mods.join("blacklist.txt")).expect("blacklist"),
            "blacklist-original"
        );
        assert_eq!(
            fs::read_to_string(mods.join("favorites.txt")).expect("favorites"),
            "favorites-original"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restore_rejects_manifest_target_outside_managed_files() {
        let root = temp_root("restore-target");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        let mods = celeste.join("Mods");
        let outside = root.join("outside.txt");
        fs::create_dir_all(&mods).expect("mods");
        write_file(&mods.join("blacklist.txt"), "blacklist-original");
        write_file(&outside, "outside-original");
        let backup = create_backup_in(&backups, &celeste, BACKUP_KIND_MANUAL).expect("backup");
        let mut files = backup.files.clone();
        files[0].target_path = outside.to_string_lossy().to_string();
        write_backup_manifest(
            Path::new(&backup.backup_path),
            &backup.id,
            &backup.created_at,
            backup.kind,
            &celeste,
            files,
        );

        let error = restore_backup_in(&backups, &backup.id, RESTORE_SCOPE_GAME)
            .expect_err("tampered target");

        assert!(error.contains("还原目标不属于受管文件"));
        assert_eq!(
            fs::read_to_string(&outside).expect("outside"),
            "outside-original"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restore_rejects_manifest_backup_path_escape() {
        let root = temp_root("restore-source");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        let mods = celeste.join("Mods");
        fs::create_dir_all(&mods).expect("mods");
        write_file(&mods.join("blacklist.txt"), "blacklist-original");
        let backup = create_backup_in(&backups, &celeste, BACKUP_KIND_MANUAL).expect("backup");
        let mut files = backup.files.clone();
        files[0].backup_path = "../outside.txt".to_string();
        write_backup_manifest(
            Path::new(&backup.backup_path),
            &backup.id,
            &backup.created_at,
            backup.kind,
            &celeste,
            files,
        );

        let error = restore_backup_in(&backups, &backup.id, RESTORE_SCOPE_GAME)
            .expect_err("tampered source");

        assert!(error.contains("备份文件路径无效"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restore_all_ignores_state_entries_from_old_backups() {
        let entry = BackupFileEntry {
            category: BackupFileCategory::State,
            label: "state.json".to_string(),
            target_path: "state.json".to_string(),
            backup_path: "state/state.json".to_string(),
            existed: true,
        };

        assert!(!should_restore_file(&entry, RESTORE_SCOPE_ALL));
    }

    #[test]
    fn delete_backup_removes_directory_and_list_entry() {
        let root = temp_root("delete");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        create_manifest_backup(&backups, &celeste, "100", BACKUP_KIND_MANUAL);

        delete_backup_in(&backups, "100").expect("delete backup");

        assert!(!backups.join("100").exists());
        assert!(list_backups_in(&backups).is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn delete_missing_backup_returns_error() {
        let root = temp_root("delete-missing");
        let backups = root.join("backups");

        let error = delete_backup_in(&backups, "missing").expect_err("missing backup");

        assert!(error.contains("备份不存在"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cleanup_keep_zero_deletes_all_auto_backups() {
        let root = temp_root("cleanup-zero");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        create_manifest_backup(&backups, &celeste, "100", BACKUP_KIND_AUTO);
        create_manifest_backup(&backups, &celeste, "200", BACKUP_KIND_AUTO);
        create_manifest_backup(&backups, &celeste, "150", BACKUP_KIND_MANUAL);

        let remaining = cleanup_auto_backups_in(&backups, 0).expect("cleanup");

        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "150");
        assert!(!backups.join("100").exists());
        assert!(!backups.join("200").exists());
        assert!(backups.join("150").exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn cleanup_keeps_recent_auto_backups_and_manual_backups() {
        let root = temp_root("cleanup");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        create_manifest_backup(&backups, &celeste, "100", BACKUP_KIND_AUTO);
        create_manifest_backup(&backups, &celeste, "200", BACKUP_KIND_AUTO);
        create_manifest_backup(&backups, &celeste, "300", BACKUP_KIND_AUTO);
        create_manifest_backup(&backups, &celeste, "150", BACKUP_KIND_MANUAL);

        let remaining = cleanup_auto_backups_in(&backups, 2).expect("cleanup");
        let remaining_ids: Vec<_> = remaining.iter().map(|backup| backup.id.as_str()).collect();

        assert_eq!(remaining_ids, vec!["300", "200", "150"]);
        assert!(!backups.join("100").exists());
        assert!(backups.join("150").exists());
        assert!(backups.join("200").exists());
        assert!(backups.join("300").exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn auto_backup_creation_runs_cleanup() {
        let root = temp_root("auto-cleanup");
        let celeste = root.join("Celeste");
        let backups = backups_dir(&celeste);
        create_manifest_backup(&backups, &celeste, "000", BACKUP_KIND_AUTO);
        create_manifest_backup(&backups, &celeste, "001", BACKUP_KIND_AUTO);

        create_auto_backup_if_enabled(&celeste, true, true, 1).expect("auto backup");

        let backups = list_backups(&celeste).expect("list backups");
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BACKUP_KIND_AUTO)
                .count(),
            1
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn auto_backup_creation_skips_cleanup_when_cleanup_is_disabled() {
        let root = temp_root("auto-cleanup-disabled");
        let celeste = root.join("Celeste");
        let backups = backups_dir(&celeste);
        create_manifest_backup(&backups, &celeste, "000", BACKUP_KIND_AUTO);
        create_manifest_backup(&backups, &celeste, "001", BACKUP_KIND_AUTO);

        create_auto_backup_if_enabled(&celeste, true, false, 1).expect("auto backup");

        let backups = list_backups(&celeste).expect("list backups");
        assert_eq!(
            backups
                .iter()
                .filter(|backup| backup.kind == BACKUP_KIND_AUTO)
                .count(),
            3
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn backup_records_installed_mod_metadata_and_versions() {
        let root = temp_root("mods");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        let mods = celeste.join("Mods");
        fs::create_dir_all(&mods).expect("mods");
        write_file(
            &mods.join("FolderHelper").join("everest.yaml"),
            "Name: Folder Helper\nVersion: 1.2.3\n",
        );
        write_zip_mod(&mods.join("ZipMap.zip"), "Name: Zip Map\nVersion: 2.0.0\n");
        write_file(&mods.join("blacklist.txt"), "ZipMap.zip\n");

        let backup = create_backup_in(&backups, &celeste, BACKUP_KIND_MANUAL).expect("backup");

        let folder_mod = backup
            .mods
            .iter()
            .find(|mod_item| mod_item.metadata_name == "Folder Helper")
            .expect("folder mod");
        assert_eq!(folder_mod.version, "1.2.3");
        assert_eq!(folder_mod.file_name, "FolderHelper");
        assert!(!folder_mod.is_archive);
        assert!(folder_mod.enabled);

        let zip_mod = backup
            .mods
            .iter()
            .find(|mod_item| mod_item.metadata_name == "Zip Map")
            .expect("zip mod");
        assert_eq!(zip_mod.version, "2.0.0");
        assert_eq!(zip_mod.file_name, "ZipMap.zip");
        assert!(zip_mod.is_archive);
        assert!(!zip_mod.enabled);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn old_backup_manifest_without_mods_still_loads() {
        let root = temp_root("old-manifest");
        let backups = root.join("backups");
        let celeste = root.join("Celeste");
        let backup_path = backups.join("100");
        fs::create_dir_all(&backup_path).expect("backup dir");
        write_file(
            &backup_path.join("manifest.json"),
            &format!(
                r#"{{
                    "id":"100",
                    "createdAt":"100",
                    "kind":"manual",
                    "celestePath":"{}",
                    "files":[]
                }}"#,
                normalize_slash(&celeste.to_string_lossy())
            ),
        );

        let backups = list_backups_in(&backups);

        assert_eq!(backups.len(), 1);
        assert!(backups[0].mods.is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn backups_root_lives_under_celeste_path() {
        let celeste = PathBuf::from(r"D:\Games\Celeste");

        assert_eq!(
            backups_dir(&celeste),
            celeste.join("celepkg").join("backups")
        );
    }

    fn restore_backup_in(
        backups_root: &Path,
        backup_id: &str,
        scope: &str,
    ) -> Result<BackupInfo, String> {
        let backup_path = backups_root.join(safe_backup_id(backup_id));
        let info = read_backup_info(&backup_path).ok_or_else(|| "备份不存在".to_string())?;
        let normalized_scope = normalize_restore_scope(scope)?;
        for file in info
            .files
            .iter()
            .filter(|file| should_restore_file(file, normalized_scope))
        {
            restore_file(&backup_path, Path::new(&info.celeste_path), file)?;
        }
        Ok(info)
    }

    fn write_file(path: &Path, text: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent");
        }
        fs::write(path, text).expect("write");
    }

    fn write_zip_mod(path: &Path, metadata: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("zip parent");
        }
        let file = File::create(path).expect("zip file");
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("everest.yaml", SimpleFileOptions::default())
            .expect("start file");
        zip.write_all(metadata.as_bytes()).expect("write metadata");
        zip.finish().expect("finish zip");
    }

    fn create_manifest_backup(
        backups_root: &Path,
        celeste_path: &Path,
        id: &str,
        kind: BackupKind,
    ) {
        let backup_path = backups_root.join(id);
        fs::create_dir_all(&backup_path).expect("backup dir");
        write_json(
            &backup_path.join("manifest.json"),
            &BackupManifest {
                id: id.to_string(),
                created_at: id.to_string(),
                kind,
                celeste_path: celeste_path.to_string_lossy().to_string(),
                files: vec![],
                mods: vec![],
            },
        )
        .expect("manifest");
    }

    fn write_backup_manifest(
        backup_path: &Path,
        id: &str,
        created_at: &str,
        kind: BackupKind,
        celeste_path: &Path,
        files: Vec<BackupFileEntry>,
    ) {
        write_json(
            &backup_path.join("manifest.json"),
            &BackupManifest {
                id: id.to_string(),
                created_at: created_at.to_string(),
                kind,
                celeste_path: celeste_path.to_string_lossy().to_string(),
                files,
                mods: vec![],
            },
        )
        .expect("manifest");
    }

    fn temp_root(label: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "celepkg-backup-{label}-{}-{stamp}",
            std::process::id()
        ))
    }
}
