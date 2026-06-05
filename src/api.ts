import { invoke } from "@tauri-apps/api/core";
import {
  validateBackupInfo,
  validateBackupList,
  validateCelestePathResponse,
  validateConfigResponse,
  validateEverestInstallResult,
  validateEverestReleaseList,
  validateLaunchResult,
  validateModCatalogSearchResult,
  validateModInstallResult,
  validateModMetadata,
  validateModUpdateCheckResult,
  validateNullableString,
  validateProfilesState,
  validateVoid,
  validateScanResult,
  validateStagedDownload
} from "./apiValidation";
import { isMockMode, mockApi } from "./mockApi";
import type {
  BackupInfo,
  ConfigResponse,
  EverestInstallResult,
  EverestRelease,
  EverestReleaseList,
  ModCatalogEntry,
  ModCatalogSearchResult,
  ModCatalogSourceKind,
  ModInstallResult,
  ModMetadata,
  ModUpdateCheckResult,
  Profile,
  ProfilesState,
  RestoreScope,
  ScanResult,
  StagedDownload
} from "./types";

async function invokeChecked<T>(command: string, validator: (value: unknown) => T, args?: Record<string, unknown>): Promise<T> {
  return validator(await invoke<unknown>(command, args));
}

export async function getConfig(): Promise<ConfigResponse> {
  if (isMockMode()) return mockApi.getConfig();
  return invokeChecked("get_config", validateConfigResponse);
}

export async function setCelestePath(celestePath: string): Promise<{ celestePath: string }> {
  if (isMockMode()) return mockApi.setCelestePath(celestePath);
  return invokeChecked("set_celeste_path", validateCelestePathResponse, { celestePath });
}

export async function selectCelesteDirectory(): Promise<string | null> {
  if (isMockMode()) return mockApi.selectCelesteDirectory();
  return invokeChecked("select_celeste_directory", validateNullableString);
}

export async function setAutoBackupEnabled(autoBackupEnabled: boolean): Promise<ConfigResponse> {
  if (isMockMode()) return mockApi.setAutoBackupEnabled(autoBackupEnabled);
  return invokeChecked("set_auto_backup_enabled", validateConfigResponse, { autoBackupEnabled });
}

export async function setAutoBackupCleanupEnabled(autoBackupCleanupEnabled: boolean): Promise<ConfigResponse> {
  if (isMockMode()) return mockApi.setAutoBackupCleanupEnabled(autoBackupCleanupEnabled);
  return invokeChecked("set_auto_backup_cleanup_enabled", validateConfigResponse, { autoBackupCleanupEnabled });
}

export async function setAutoBackupRetentionCount(autoBackupRetentionCount: number): Promise<ConfigResponse> {
  if (isMockMode()) return mockApi.setAutoBackupRetentionCount(autoBackupRetentionCount);
  return invokeChecked("set_auto_backup_retention_count", validateConfigResponse, { autoBackupRetentionCount });
}

export async function setModCatalogSources(
  modCatalogSourceOrder: ModCatalogSourceKind[],
  modCatalogSourceEnabledCount: number
): Promise<ConfigResponse> {
  if (isMockMode()) return mockApi.setModCatalogSources(modCatalogSourceOrder, modCatalogSourceEnabledCount);
  return invokeChecked("set_mod_catalog_sources", validateConfigResponse, { modCatalogSourceOrder, modCatalogSourceEnabledCount });
}

export async function setAutoCheckModUpdatesOnStartup(autoCheckModUpdatesOnStartup: boolean): Promise<ConfigResponse> {
  if (isMockMode()) return mockApi.setAutoCheckModUpdatesOnStartup(autoCheckModUpdatesOnStartup);
  return invokeChecked("set_auto_check_mod_updates_on_startup", validateConfigResponse, { autoCheckModUpdatesOnStartup });
}

export async function setSelectedSaveFiles(saveFiles: string[]): Promise<ConfigResponse> {
  if (isMockMode()) return mockApi.setSelectedSaveFiles(saveFiles);
  return invokeChecked("set_selected_save_files", validateConfigResponse, { saveFiles });
}

export async function scanCeleste(celestePath: string): Promise<ScanResult> {
  if (isMockMode()) return mockApi.scanCeleste(celestePath);
  return invokeChecked("scan_celeste", validateScanResult, { celestePath });
}

export async function rescanCeleste(celestePath: string): Promise<ScanResult> {
  if (isMockMode()) return mockApi.rescanCeleste(celestePath);
  return invokeChecked("rescan_celeste", validateScanResult, { celestePath });
}

export async function searchModCatalog(query: string, sources: ModCatalogSourceKind[]): Promise<ModCatalogSearchResult> {
  if (isMockMode()) return mockApi.searchModCatalog(query, sources);
  return invokeChecked("search_mod_catalog", validateModCatalogSearchResult, { query, sources });
}

export async function checkModUpdates(celestePath: string, sources: ModCatalogSourceKind[]): Promise<ModUpdateCheckResult> {
  if (isMockMode()) return mockApi.checkModUpdates(celestePath, sources);
  return invokeChecked("check_mod_updates", validateModUpdateCheckResult, { celestePath, sources });
}

export async function previewModUpdateMetadata(celestePath: string, entry: ModCatalogEntry): Promise<ModMetadata> {
  if (isMockMode()) return mockApi.previewModUpdateMetadata(celestePath, entry);
  return invokeChecked("preview_mod_update_metadata", validateModMetadata, { celestePath, entry });
}

export async function listEverestReleases(): Promise<EverestReleaseList> {
  if (isMockMode()) return mockApi.listEverestReleases();
  return invokeChecked("list_everest_releases", validateEverestReleaseList);
}

export async function downloadEverestToStaging(
  celestePath: string,
  release: EverestRelease,
  operationId = createOperationId("everest")
): Promise<StagedDownload> {
  if (isMockMode()) return mockApi.downloadEverestToStaging(celestePath, release, operationId);
  return invokeChecked("download_everest_to_staging", validateStagedDownload, { celestePath, release, operationId });
}

export async function installStagedEverest(celestePath: string, stagedId: string, release: EverestRelease): Promise<EverestInstallResult> {
  if (isMockMode()) return mockApi.installStagedEverest(celestePath, stagedId, release);
  return invokeChecked("install_staged_everest", validateEverestInstallResult, { celestePath, stagedId, release });
}

export async function downloadModToStaging(
  celestePath: string,
  entry: ModCatalogEntry,
  operationId = createOperationId("install"),
  taskIndex = 1,
  taskTotal = 1
): Promise<StagedDownload> {
  if (isMockMode()) return mockApi.downloadModToStaging(celestePath, entry, operationId, taskIndex, taskTotal);
  return invokeChecked("download_mod_to_staging", validateStagedDownload, { celestePath, entry, operationId, taskIndex, taskTotal });
}

export async function installStagedMod(
  celestePath: string,
  stagedId: string,
  entry: ModCatalogEntry,
  installedPath?: string
): Promise<ModInstallResult> {
  if (isMockMode()) return mockApi.installStagedMod(celestePath, stagedId, entry, installedPath);
  return invokeChecked("install_staged_mod", validateModInstallResult, {
    celestePath,
    stagedId,
    entry,
    installedPath: installedPath ?? null
  });
}

export async function cancelModDownload(operationId: string): Promise<boolean> {
  if (isMockMode()) return mockApi.cancelModDownload(operationId);
  return invokeChecked("cancel_mod_download", validateBoolean, { operationId });
}

export async function saveProfile(profile: Partial<Profile> & { name: string }): Promise<ProfilesState> {
  if (isMockMode()) return mockApi.saveProfile(profile);
  return invokeChecked("save_profile", validateProfilesState, { profile });
}

export async function deleteProfile(profileId: string): Promise<ProfilesState> {
  if (isMockMode()) return mockApi.deleteProfile(profileId);
  return invokeChecked("delete_profile", validateProfilesState, { profileId });
}

export async function applyProfile(celestePath: string, mapProfileId: string, modProfileId: string): Promise<ScanResult> {
  if (isMockMode()) return mockApi.applyProfile(celestePath, mapProfileId, modProfileId);
  return invokeChecked("apply_profile", validateScanResult, { celestePath, mapProfileId, modProfileId });
}

export async function launchProfile(
  celestePath: string,
  mapProfileId: string,
  modProfileId: string
): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
  if (isMockMode()) return mockApi.launchProfile(celestePath, mapProfileId, modProfileId);
  return invokeChecked("launch_profile", validateLaunchResult, { celestePath, mapProfileId, modProfileId });
}

export async function launchGame(
  celestePath: string,
  launchArgs: string
): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
  if (isMockMode()) return mockApi.launchGame(celestePath, launchArgs);
  return invokeChecked("launch_game", validateLaunchResult, { celestePath, launchArgs });
}

export async function setRecordFavorite(celestePath: string, recordId: string, favorite: boolean): Promise<ScanResult> {
  if (isMockMode()) return mockApi.setRecordFavorite(celestePath, recordId, favorite);
  return invokeChecked("set_record_favorite", validateScanResult, { celestePath, recordId, favorite });
}

export async function setRecordProtected(celestePath: string, recordId: string, protectedValue: boolean): Promise<ScanResult> {
  if (isMockMode()) return mockApi.setRecordProtected(celestePath, recordId, protectedValue);
  return invokeChecked("set_record_protected", validateScanResult, { celestePath, recordId, protected: protectedValue });
}

export async function createBackup(celestePath: string, kind: "manual" | "auto" = "manual"): Promise<BackupInfo> {
  if (isMockMode()) return mockApi.createBackup(celestePath, kind);
  return invokeChecked("create_backup", validateBackupInfo, { celestePath, kind });
}

export async function listBackups(): Promise<BackupInfo[]> {
  if (isMockMode()) return mockApi.listBackups();
  return invokeChecked("list_backups", validateBackupList);
}

export async function restoreBackup(backupId: string, scope: RestoreScope): Promise<BackupInfo> {
  if (isMockMode()) return mockApi.restoreBackup(backupId, scope);
  return invokeChecked("restore_backup", validateBackupInfo, { backupId, scope });
}

export async function deleteBackup(backupId: string): Promise<void> {
  if (isMockMode()) return mockApi.deleteBackup(backupId);
  return invokeChecked("delete_backup", validateVoid, { backupId });
}

export async function cleanupAutoBackups(): Promise<BackupInfo[]> {
  if (isMockMode()) return mockApi.cleanupAutoBackups();
  return invokeChecked("cleanup_auto_backups", validateBackupList);
}

export async function openBackupFolder(celestePath: string): Promise<void> {
  if (isMockMode()) return mockApi.openBackupFolder(celestePath);
  return invokeChecked("open_backup_folder", validateVoid, { celestePath });
}

export async function openBackupLocation(backupPath: string): Promise<void> {
  if (isMockMode()) return mockApi.openBackupLocation(backupPath);
  return invokeChecked("open_backup_location", validateVoid, { backupPath });
}

export function createOperationId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function validateBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("API 返回数据格式异常：boolean 命令应返回布尔值。");
  return value;
}
