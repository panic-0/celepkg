import { validateSchemaValue } from "./generated/api-validators";
import type {
  BackupInfo,
  ConfigResponse,
  EverestInstallResult,
  EverestReleaseList,
  GameBananaCatalogStatsResult,
  ModCatalogDependencyResolutionResult,
  ModCatalogSearchResult,
  ModInstallResult,
  ModMetadata,
  ModPreviewStaging,
  ModUpdateCheckResult,
  ProfilesState,
  ScanResult,
  StagedDownload
} from "./types";

export function validateConfigResponse(value: unknown): ConfigResponse {
  return validateSchemaValue("ConfigResponse", value, "API 返回数据格式异常：config");
}

export function validateCelestePathResponse(value: unknown): { celestePath: string } {
  return validateSchemaValue("AppConfig", value, "API 返回数据格式异常：celestePath response");
}

export function validateNullableString(value: unknown): string | null {
  return validateSchemaValue("NullableString", value, "API 返回数据格式异常：nullable string");
}

export function validateScanResult(value: unknown): ScanResult {
  return validateSchemaValue("ScanResult", value, "API 返回数据格式异常：scan");
}

export function validateProfilesState(value: unknown): ProfilesState {
  return validateSchemaValue("ProfilesState", value, "API 返回数据格式异常：profiles");
}

export function validateLaunchResult(value: unknown) {
  return validateSchemaValue("LaunchResult", value, "API 返回数据格式异常：launch result");
}

export function validateBackupInfo(value: unknown): BackupInfo {
  return validateSchemaValue("BackupInfo", value, "API 返回数据格式异常：backup");
}

export function validateBackupList(value: unknown): BackupInfo[] {
  return validateSchemaValue("BackupInfoList", value, "API 返回数据格式异常：backups");
}

export function validateModCatalogSearchResult(value: unknown): ModCatalogSearchResult {
  return validateSchemaValue("ModCatalogSearchResult", value, "API 返回数据格式异常：mod catalog search");
}

export function validateGameBananaCatalogStatsResult(value: unknown): GameBananaCatalogStatsResult {
  return validateSchemaValue("GameBananaCatalogStatsResult", value, "API 返回数据格式异常：mod catalog stats");
}

export function validateModCatalogDependencyResolutionResult(value: unknown): ModCatalogDependencyResolutionResult {
  return validateSchemaValue("ModCatalogDependencyResolutionResult", value, "API 返回数据格式异常：mod catalog dependency resolution");
}

export function validateModUpdateCheckResult(value: unknown): ModUpdateCheckResult {
  return validateSchemaValue("ModUpdateCheckResult", value, "API 返回数据格式异常：mod update check");
}

export function validateModInstallResult(value: unknown): ModInstallResult {
  return validateSchemaValue("ModInstallResult", value, "API 返回数据格式异常：mod install result");
}

export function validateStagedDownload(value: unknown): StagedDownload {
  return validateSchemaValue("StagedDownload", value, "API 返回数据格式异常：staged download");
}

export function validateModPreviewStaging(value: unknown): ModPreviewStaging {
  return validateSchemaValue("ModPreviewStaging", value, "API 返回数据格式异常：mod preview staging");
}

export function validateEverestReleaseList(value: unknown): EverestReleaseList {
  return validateSchemaValue("EverestReleaseList", value, "API 返回数据格式异常：everest release list");
}

export function validateEverestInstallResult(value: unknown): EverestInstallResult {
  return validateSchemaValue("EverestInstallResult", value, "API 返回数据格式异常：everest install result");
}

export function validateVoid(value: unknown): void {
  validateSchemaValue("VoidResponse", typeof value === "undefined" ? null : value, "API 返回数据格式异常：void");
}

export function validateModMetadata(value: unknown): ModMetadata {
  return validateSchemaValue("ModMetadata", value, "API 返回数据格式异常：mod metadata");
}
