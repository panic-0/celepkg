import { invoke } from "@tauri-apps/api/core";
import {
  validateBackupInfo,
  validateBackupList,
  validateCelestePathResponse,
  validateConfigResponse,
  validateLaunchResult,
  validateNullableString,
  validateProfilesState,
  validateVoid,
  validateScanResult
} from "./apiValidation";
import type { BackupInfo, ConfigResponse, Profile, ProfilesState, RestoreScope, ScanResult } from "./types";

async function invokeChecked<T>(command: string, validator: (value: unknown) => T, args?: Record<string, unknown>): Promise<T> {
  return validator(await invoke<unknown>(command, args));
}

export async function getConfig(): Promise<ConfigResponse> {
  return invokeChecked("get_config", validateConfigResponse);
}

export async function setCelestePath(celestePath: string): Promise<{ celestePath: string }> {
  return invokeChecked("set_celeste_path", validateCelestePathResponse, { celestePath });
}

export async function selectCelesteDirectory(): Promise<string | null> {
  return invokeChecked("select_celeste_directory", validateNullableString);
}

export async function setAutoBackupEnabled(autoBackupEnabled: boolean): Promise<ConfigResponse> {
  return invokeChecked("set_auto_backup_enabled", validateConfigResponse, { autoBackupEnabled });
}

export async function setSelectedSaveFiles(saveFiles: string[]): Promise<ConfigResponse> {
  return invokeChecked("set_selected_save_files", validateConfigResponse, { saveFiles });
}

export async function scanCeleste(celestePath: string): Promise<ScanResult> {
  return invokeChecked("scan_celeste", validateScanResult, { celestePath });
}

export async function rescanCeleste(celestePath: string): Promise<ScanResult> {
  return invokeChecked("rescan_celeste", validateScanResult, { celestePath });
}

export async function saveProfile(profile: Partial<Profile> & { name: string }): Promise<ProfilesState> {
  return invokeChecked("save_profile", validateProfilesState, { profile });
}

export async function deleteProfile(profileId: string): Promise<ProfilesState> {
  return invokeChecked("delete_profile", validateProfilesState, { profileId });
}

export async function applyProfile(celestePath: string, mapProfileId: string, modProfileId: string): Promise<ScanResult> {
  return invokeChecked("apply_profile", validateScanResult, { celestePath, mapProfileId, modProfileId });
}

export async function launchProfile(
  celestePath: string,
  mapProfileId: string,
  modProfileId: string
): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
  return invokeChecked("launch_profile", validateLaunchResult, { celestePath, mapProfileId, modProfileId });
}

export async function launchGame(
  celestePath: string,
  launchArgs: string
): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
  return invokeChecked("launch_game", validateLaunchResult, { celestePath, launchArgs });
}

export async function setRecordFavorite(celestePath: string, recordId: string, favorite: boolean): Promise<ScanResult> {
  return invokeChecked("set_record_favorite", validateScanResult, { celestePath, recordId, favorite });
}

export async function setRecordProtected(celestePath: string, recordId: string, protectedValue: boolean): Promise<ScanResult> {
  return invokeChecked("set_record_protected", validateScanResult, { celestePath, recordId, protected: protectedValue });
}

export async function createBackup(celestePath: string, kind: "manual" | "auto" = "manual"): Promise<BackupInfo> {
  return invokeChecked("create_backup", validateBackupInfo, { celestePath, kind });
}

export async function listBackups(): Promise<BackupInfo[]> {
  return invokeChecked("list_backups", validateBackupList);
}

export async function restoreBackup(backupId: string, scope: RestoreScope): Promise<BackupInfo> {
  return invokeChecked("restore_backup", validateBackupInfo, { backupId, scope });
}

export async function openBackupFolder(celestePath: string): Promise<void> {
  return invokeChecked("open_backup_folder", validateVoid, { celestePath });
}

export async function openBackupLocation(backupPath: string): Promise<void> {
  return invokeChecked("open_backup_location", validateVoid, { backupPath });
}
