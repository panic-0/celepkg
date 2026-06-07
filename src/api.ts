import { invoke } from "@tauri-apps/api/core";
import {
  validateBackupInfo,
  validateBackupList,
  validateCelestePathResponse,
  validateConfigResponse,
  validateEverestInstallResult,
  validateEverestReleaseList,
  validateLaunchResult,
  validateModCatalogDependencyResolutionResult,
  validateModCatalogSearchResult,
  validateModInstallResult,
  validateModMetadata,
  validateModPreviewStaging,
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
  Dependency,
  EverestInstallResult,
  EverestRelease,
  EverestReleaseList,
  ModCatalogEntry,
  ModCatalogDependencyResolutionResult,
  ModCatalogSearchResult,
  ModCatalogSourceKind,
  ModInstallResult,
  ModMetadata,
  ModPreviewStaging,
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

async function callApi<T>(
  mockCall: () => Promise<T>,
  command: string,
  validator: (value: unknown) => T,
  args?: Record<string, unknown>
): Promise<T> {
  if (isMockMode()) return mockCall();
  return invokeChecked(command, validator, args);
}

export async function getConfig(): Promise<ConfigResponse> {
  return callApi(() => mockApi.getConfig(), "get_config", validateConfigResponse);
}

export async function setCelestePath(celestePath: string): Promise<{ celestePath: string }> {
  return callApi(() => mockApi.setCelestePath(celestePath), "set_celeste_path", validateCelestePathResponse, { celestePath });
}

export async function selectCelesteDirectory(): Promise<string | null> {
  return callApi(() => mockApi.selectCelesteDirectory(), "select_celeste_directory", validateNullableString);
}

export async function setAutoBackupEnabled(autoBackupEnabled: boolean): Promise<ConfigResponse> {
  return callApi(() => mockApi.setAutoBackupEnabled(autoBackupEnabled), "set_auto_backup_enabled", validateConfigResponse, {
    autoBackupEnabled
  });
}

export async function setAutoBackupCleanupEnabled(autoBackupCleanupEnabled: boolean): Promise<ConfigResponse> {
  return callApi(
    () => mockApi.setAutoBackupCleanupEnabled(autoBackupCleanupEnabled),
    "set_auto_backup_cleanup_enabled",
    validateConfigResponse,
    {
      autoBackupCleanupEnabled
    }
  );
}

export async function setAutoBackupRetentionCount(autoBackupRetentionCount: number): Promise<ConfigResponse> {
  return callApi(
    () => mockApi.setAutoBackupRetentionCount(autoBackupRetentionCount),
    "set_auto_backup_retention_count",
    validateConfigResponse,
    {
      autoBackupRetentionCount
    }
  );
}

export async function setModCatalogSources(
  modCatalogSourceOrder: ModCatalogSourceKind[],
  modCatalogSourceEnabledCount: number
): Promise<ConfigResponse> {
  return callApi(
    () => mockApi.setModCatalogSources(modCatalogSourceOrder, modCatalogSourceEnabledCount),
    "set_mod_catalog_sources",
    validateConfigResponse,
    {
      modCatalogSourceOrder,
      modCatalogSourceEnabledCount
    }
  );
}

export async function setAutoCheckModUpdatesOnStartup(autoCheckModUpdatesOnStartup: boolean): Promise<ConfigResponse> {
  return callApi(
    () => mockApi.setAutoCheckModUpdatesOnStartup(autoCheckModUpdatesOnStartup),
    "set_auto_check_mod_updates_on_startup",
    validateConfigResponse,
    { autoCheckModUpdatesOnStartup }
  );
}

export async function setAutoCheckAppUpdatesOnStartup(autoCheckAppUpdatesOnStartup: boolean): Promise<ConfigResponse> {
  return callApi(
    () => mockApi.setAutoCheckAppUpdatesOnStartup(autoCheckAppUpdatesOnStartup),
    "set_auto_check_app_updates_on_startup",
    validateConfigResponse,
    { autoCheckAppUpdatesOnStartup }
  );
}

export async function setAutoRefreshModCatalogCacheOnStartup(autoRefreshModCatalogCacheOnStartup: boolean): Promise<ConfigResponse> {
  return callApi(
    () => mockApi.setAutoRefreshModCatalogCacheOnStartup(autoRefreshModCatalogCacheOnStartup),
    "set_auto_refresh_mod_catalog_cache_on_startup",
    validateConfigResponse,
    { autoRefreshModCatalogCacheOnStartup }
  );
}

export async function setSelectedSaveFiles(saveFiles: string[]): Promise<ConfigResponse> {
  return callApi(() => mockApi.setSelectedSaveFiles(saveFiles), "set_selected_save_files", validateConfigResponse, { saveFiles });
}

export async function scanCeleste(celestePath: string): Promise<ScanResult> {
  return callApi(() => mockApi.scanCeleste(celestePath), "scan_celeste", validateScanResult, { celestePath });
}

export async function rescanCeleste(celestePath: string): Promise<ScanResult> {
  return callApi(() => mockApi.rescanCeleste(celestePath), "rescan_celeste", validateScanResult, { celestePath });
}

export async function searchModCatalog(query: string, sources: ModCatalogSourceKind[]): Promise<ModCatalogSearchResult> {
  return callApi(() => mockApi.searchModCatalog(query, sources), "search_mod_catalog", validateModCatalogSearchResult, { query, sources });
}

export async function refreshModCatalogCache(sources: ModCatalogSourceKind[]): Promise<ModCatalogSearchResult> {
  return callApi(() => mockApi.refreshModCatalogCache(sources), "refresh_mod_catalog_cache", validateModCatalogSearchResult, { sources });
}

export async function resolveModCatalogDependencies(
  dependencies: Dependency[],
  sources: ModCatalogSourceKind[]
): Promise<ModCatalogDependencyResolutionResult> {
  return callApi(
    () => mockApi.resolveModCatalogDependencies(dependencies, sources),
    "resolve_mod_catalog_dependencies",
    validateModCatalogDependencyResolutionResult,
    { dependencies, sources }
  );
}

export async function checkModUpdates(celestePath: string, sources: ModCatalogSourceKind[]): Promise<ModUpdateCheckResult> {
  return callApi(() => mockApi.checkModUpdates(celestePath, sources), "check_mod_updates", validateModUpdateCheckResult, {
    celestePath,
    sources
  });
}

export async function previewModUpdateMetadata(celestePath: string, entry: ModCatalogEntry): Promise<ModMetadata> {
  return callApi(() => mockApi.previewModUpdateMetadata(celestePath, entry), "preview_mod_update_metadata", validateModMetadata, {
    celestePath,
    entry
  });
}

export async function stageModPreview(
  celestePath: string,
  entry: ModCatalogEntry,
  operationId = createOperationId("mod-preview")
): Promise<ModPreviewStaging> {
  return callApi(() => mockApi.stageModPreview(celestePath, entry, operationId), "stage_mod_preview", validateModPreviewStaging, {
    celestePath,
    entry,
    operationId
  });
}

export async function readStagedModMetadata(celestePath: string, stagedId: string): Promise<ModMetadata> {
  return callApi(() => mockApi.readStagedModMetadata(celestePath, stagedId), "read_staged_mod_metadata", validateModMetadata, {
    celestePath,
    stagedId
  });
}

export async function listEverestReleases(): Promise<EverestReleaseList> {
  return callApi(() => mockApi.listEverestReleases(), "list_everest_releases", validateEverestReleaseList);
}

export async function downloadEverestToStaging(
  celestePath: string,
  release: EverestRelease,
  operationId = createOperationId("everest")
): Promise<StagedDownload> {
  return callApi(
    () => mockApi.downloadEverestToStaging(celestePath, release, operationId),
    "download_everest_to_staging",
    validateStagedDownload,
    {
      celestePath,
      release,
      operationId
    }
  );
}

export async function installStagedEverest(celestePath: string, stagedId: string, release: EverestRelease): Promise<EverestInstallResult> {
  return callApi(
    () => mockApi.installStagedEverest(celestePath, stagedId, release),
    "install_staged_everest",
    validateEverestInstallResult,
    {
      celestePath,
      stagedId,
      release
    }
  );
}

export async function downloadModToStaging(
  celestePath: string,
  entry: ModCatalogEntry,
  operationId = createOperationId("install"),
  taskIndex = 1,
  taskTotal = 1
): Promise<StagedDownload> {
  return callApi(
    () => mockApi.downloadModToStaging(celestePath, entry, operationId, taskIndex, taskTotal),
    "download_mod_to_staging",
    validateStagedDownload,
    {
      celestePath,
      entry,
      operationId,
      taskIndex,
      taskTotal
    }
  );
}

export async function installStagedMod(
  celestePath: string,
  stagedId: string,
  entry: ModCatalogEntry,
  installedPath?: string
): Promise<ModInstallResult> {
  return callApi(
    () => mockApi.installStagedMod(celestePath, stagedId, entry, installedPath),
    "install_staged_mod",
    validateModInstallResult,
    {
      celestePath,
      stagedId,
      entry,
      installedPath: installedPath ?? null
    }
  );
}

export async function deleteStagedDownload(celestePath: string, stagedId: string): Promise<boolean> {
  return callApi(() => mockApi.deleteStagedDownload(celestePath, stagedId), "delete_staged_download", validateBoolean, {
    celestePath,
    stagedId
  });
}

export async function cancelModDownload(operationId: string): Promise<boolean> {
  return callApi(() => mockApi.cancelModDownload(operationId), "cancel_mod_download", validateBoolean, { operationId });
}

export async function saveProfile(profile: Partial<Profile> & { name: string }): Promise<ProfilesState> {
  return callApi(() => mockApi.saveProfile(profile), "save_profile", validateProfilesState, { profile });
}

export async function deleteProfile(profileId: string): Promise<ProfilesState> {
  return callApi(() => mockApi.deleteProfile(profileId), "delete_profile", validateProfilesState, { profileId });
}

export async function applyProfile(celestePath: string, mapProfileId: string, modProfileId: string): Promise<ScanResult> {
  return callApi(() => mockApi.applyProfile(celestePath, mapProfileId, modProfileId), "apply_profile", validateScanResult, {
    celestePath,
    mapProfileId,
    modProfileId
  });
}

export async function launchProfile(
  celestePath: string,
  mapProfileId: string,
  modProfileId: string
): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
  return callApi(() => mockApi.launchProfile(celestePath, mapProfileId, modProfileId), "launch_profile", validateLaunchResult, {
    celestePath,
    mapProfileId,
    modProfileId
  });
}

export async function launchGame(
  celestePath: string,
  launchArgs: string
): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
  return callApi(() => mockApi.launchGame(celestePath, launchArgs), "launch_game", validateLaunchResult, { celestePath, launchArgs });
}

export async function setRecordFavorite(celestePath: string, recordId: string, favorite: boolean): Promise<ScanResult> {
  return callApi(() => mockApi.setRecordFavorite(celestePath, recordId, favorite), "set_record_favorite", validateScanResult, {
    celestePath,
    recordId,
    favorite
  });
}

export async function setRecordProtected(celestePath: string, recordId: string, protectedValue: boolean): Promise<ScanResult> {
  return callApi(() => mockApi.setRecordProtected(celestePath, recordId, protectedValue), "set_record_protected", validateScanResult, {
    celestePath,
    recordId,
    protected: protectedValue
  });
}

export async function createBackup(celestePath: string, kind: "manual" | "auto" = "manual"): Promise<BackupInfo> {
  return callApi(() => mockApi.createBackup(celestePath, kind), "create_backup", validateBackupInfo, { celestePath, kind });
}

export async function listBackups(): Promise<BackupInfo[]> {
  return callApi(() => mockApi.listBackups(), "list_backups", validateBackupList);
}

export async function restoreBackup(backupId: string, scope: RestoreScope): Promise<BackupInfo> {
  return callApi(() => mockApi.restoreBackup(backupId, scope), "restore_backup", validateBackupInfo, { backupId, scope });
}

export async function deleteBackup(backupId: string): Promise<void> {
  return callApi(() => mockApi.deleteBackup(backupId), "delete_backup", validateVoid, { backupId });
}

export async function cleanupAutoBackups(): Promise<BackupInfo[]> {
  return callApi(() => mockApi.cleanupAutoBackups(), "cleanup_auto_backups", validateBackupList);
}

export async function openBackupFolder(celestePath: string): Promise<void> {
  return callApi(() => mockApi.openBackupFolder(celestePath), "open_backup_folder", validateVoid, { celestePath });
}

export async function openBackupLocation(backupPath: string): Promise<void> {
  return callApi(() => mockApi.openBackupLocation(backupPath), "open_backup_location", validateVoid, { backupPath });
}

export async function openModLocation(absolutePath: string): Promise<void> {
  return callApi(() => mockApi.openModLocation(absolutePath), "open_mod_location", validateVoid, { absolutePath });
}

export function createOperationId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function validateBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("API 返回数据格式异常：boolean 命令应返回布尔值。");
  return value;
}
