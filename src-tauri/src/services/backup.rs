use crate::domain::{BackupFileEntry, BackupInfo};
use crate::storage::{read_json, write_json};
use crate::utils::normalize_slash;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const BACKUP_KIND_AUTO: &str = "auto";
const BACKUP_KIND_MANUAL: &str = "manual";
const RESTORE_SCOPE_ALL: &str = "all";
const RESTORE_SCOPE_GAME: &str = "game";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    id: String,
    created_at: String,
    kind: String,
    celeste_path: String,
    files: Vec<BackupFileEntry>,
}

pub fn create_manual_backup(celeste_path: &Path) -> Result<BackupInfo, String> {
    create_backup(celeste_path, BACKUP_KIND_MANUAL)
}

pub fn create_auto_backup(celeste_path: &Path) -> Result<BackupInfo, String> {
    create_backup(celeste_path, BACKUP_KIND_AUTO)
}

pub fn create_auto_backup_if_enabled(celeste_path: &Path, enabled: bool) -> Result<(), String> {
    if enabled {
        create_auto_backup(celeste_path)?;
    }
    Ok(())
}

pub fn list_backups(celeste_path: &Path) -> Result<Vec<BackupInfo>, String> {
    let root = backups_dir(celeste_path);
    let Ok(entries) = fs::read_dir(&root) else {
        return Ok(vec![]);
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
    Ok(backups)
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
        restore_file(&backup_path, file)?;
    }
    Ok(info)
}

fn create_backup(celeste_path: &Path, kind: &str) -> Result<BackupInfo, String> {
    create_backup_in(&backups_dir(celeste_path), celeste_path, kind)
}

fn create_backup_in(
    backups_root: &Path,
    celeste_path: &Path,
    kind: &str,
) -> Result<BackupInfo, String> {
    let kind = normalize_backup_kind(kind)?;
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
        kind: kind.to_string(),
        celeste_path: celeste_path.to_string_lossy().to_string(),
        files,
    };
    write_json(&backup_path.join("manifest.json"), &manifest)?;
    read_backup_info(&backup_path).ok_or_else(|| "读取备份清单失败".to_string())
}

fn backup_sources(celeste_path: &Path) -> Vec<BackupSource> {
    vec![
        BackupSource {
            category: "game",
            label: "Mods/blacklist.txt",
            target: celeste_path.join("Mods").join("blacklist.txt"),
            backup_relative: PathBuf::from("game").join("Mods").join("blacklist.txt"),
        },
        BackupSource {
            category: "game",
            label: "Mods/favorites.txt",
            target: celeste_path.join("Mods").join("favorites.txt"),
            backup_relative: PathBuf::from("game").join("Mods").join("favorites.txt"),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn restore_all_ignores_state_entries_from_old_backups() {
        let entry = BackupFileEntry {
            category: "state".to_string(),
            label: "state.json".to_string(),
            target_path: "state.json".to_string(),
            backup_path: "state/state.json".to_string(),
            existed: true,
        };

        assert!(!should_restore_file(&entry, RESTORE_SCOPE_ALL));
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
            restore_file(&backup_path, file)?;
        }
        Ok(info)
    }

    fn write_file(path: &Path, text: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent");
        }
        fs::write(path, text).expect("write");
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
        category: source.category.to_string(),
        label: source.label.to_string(),
        target_path: source.target.to_string_lossy().to_string(),
        backup_path: normalize_slash(&source.backup_relative.to_string_lossy()),
        existed,
    })
}

fn restore_file(backup_path: &Path, file: &BackupFileEntry) -> Result<(), String> {
    let target = PathBuf::from(&file.target_path);
    if file.existed {
        let source = backup_path.join(&file.backup_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建还原目录失败：{error}"))?;
        }
        fs::copy(source, target).map_err(|error| format!("还原备份文件失败：{error}"))?;
    } else if target.exists() {
        fs::remove_file(target).map_err(|error| format!("移除还原目标失败：{error}"))?;
    }
    Ok(())
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
    })
}

fn should_restore_file(file: &BackupFileEntry, scope: &str) -> bool {
    file.category == RESTORE_SCOPE_GAME
        && (scope == RESTORE_SCOPE_ALL || scope == RESTORE_SCOPE_GAME)
}

fn normalize_backup_kind(kind: &str) -> Result<&'static str, String> {
    match kind {
        BACKUP_KIND_AUTO => Ok(BACKUP_KIND_AUTO),
        BACKUP_KIND_MANUAL => Ok(BACKUP_KIND_MANUAL),
        _ => Err("备份类型无效".to_string()),
    }
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

struct BackupSource {
    category: &'static str,
    label: &'static str,
    target: PathBuf,
    backup_relative: PathBuf,
}
