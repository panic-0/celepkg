import { invoke } from "@tauri-apps/api/core";
import type { BackupInfo, ConfigResponse, Profile, ProfilesState, RestoreScope, ScanResult } from "./types";

export async function getConfig(): Promise<ConfigResponse> {
  return invoke("get_config");
}

export async function setCelestePath(celestePath: string): Promise<{ celestePath: string }> {
  return invoke("set_celeste_path", { celestePath });
}

export async function setAutoBackupEnabled(autoBackupEnabled: boolean): Promise<ConfigResponse> {
  return invoke("set_auto_backup_enabled", { autoBackupEnabled });
}

export async function setSelectedSaveFiles(saveFiles: string[]): Promise<ConfigResponse> {
  return invoke("set_selected_save_files", { saveFiles });
}

export async function scanCeleste(celestePath: string): Promise<ScanResult> {
  return invoke("scan_celeste", { celestePath });
}

export async function saveProfile(profile: Partial<Profile> & { name: string }): Promise<ProfilesState> {
  return invoke("save_profile", { profile });
}

export async function applyProfile(celestePath: string, mapProfileId: string, modProfileId: string): Promise<ScanResult> {
  return invoke("apply_profile", { celestePath, mapProfileId, modProfileId });
}

export async function launchProfile(
  celestePath: string,
  mapProfileId: string,
  modProfileId: string
): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
  return invoke("launch_profile", { celestePath, mapProfileId, modProfileId });
}

export async function setRecordFavorite(celestePath: string, recordId: string, favorite: boolean): Promise<ScanResult> {
  return invoke("set_record_favorite", { celestePath, recordId, favorite });
}

export async function setRecordProtected(celestePath: string, recordId: string, protectedValue: boolean): Promise<ScanResult> {
  return invoke("set_record_protected", { celestePath, recordId, protected: protectedValue });
}

export async function createBackup(celestePath: string, kind: "manual" | "auto" = "manual"): Promise<BackupInfo> {
  return invoke("create_backup", { celestePath, kind });
}

export async function listBackups(): Promise<BackupInfo[]> {
  return invoke("list_backups");
}

export async function restoreBackup(backupId: string, scope: RestoreScope): Promise<BackupInfo> {
  return invoke("restore_backup", { backupId, scope });
}

export async function openBackupFolder(celestePath: string): Promise<void> {
  return invoke("open_backup_folder", { celestePath });
}

export async function openBackupLocation(backupPath: string): Promise<void> {
  return invoke("open_backup_location", { backupPath });
}
