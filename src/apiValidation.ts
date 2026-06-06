import type {
  BackupFileEntry,
  BackupInfo,
  BackupModEntry,
  ConfigResponse,
  Dependency,
  EverestInstallResult,
  EverestRelease,
  EverestReleaseList,
  InstalledModMatch,
  MapStats,
  ModCatalogDependencyResolutionResult,
  ModCatalogEntry,
  ModCatalogSearchResult,
  ModCatalogSourceKind,
  ModInstallResult,
  ModMetadata,
  ModPreviewStaging,
  ModRecord,
  ModUpdateCandidate,
  ModUpdateCheckResult,
  Profile,
  ProfilesState,
  SaveFileInfo,
  ScanResult,
  ScanTiming,
  StagedDownload,
  SubMapInfo
} from "./types";

type LaunchResult = { launched: boolean; executable: string; mapProfileId: string; modProfileId: string };

export function validateConfigResponse(value: unknown): ConfigResponse {
  const object = objectAt(value, "config");
  return {
    celestePath: stringAt(object.celestePath, "config.celestePath"),
    autoBackupEnabled: booleanAt(object.autoBackupEnabled, "config.autoBackupEnabled"),
    autoBackupCleanupEnabled: booleanAt(object.autoBackupCleanupEnabled, "config.autoBackupCleanupEnabled"),
    autoBackupRetentionCount: numberAt(object.autoBackupRetentionCount, "config.autoBackupRetentionCount"),
    modCatalogSourceOrder: arrayAt(object.modCatalogSourceOrder, "config.modCatalogSourceOrder").map((item, index) =>
      validateModCatalogSourceKind(item, `config.modCatalogSourceOrder[${index}]`)
    ),
    modCatalogSourceEnabledCount: numberAt(object.modCatalogSourceEnabledCount, "config.modCatalogSourceEnabledCount"),
    autoCheckModUpdatesOnStartup: booleanAt(object.autoCheckModUpdatesOnStartup, "config.autoCheckModUpdatesOnStartup"),
    autoCheckAppUpdatesOnStartup: booleanAt(object.autoCheckAppUpdatesOnStartup, "config.autoCheckAppUpdatesOnStartup"),
    autoRefreshModCatalogCacheOnStartup: booleanAt(
      object.autoRefreshModCatalogCacheOnStartup,
      "config.autoRefreshModCatalogCacheOnStartup"
    ),
    selectedSaveFiles: stringArrayAt(object.selectedSaveFiles, "config.selectedSaveFiles"),
    profiles: validateProfilesState(object.profiles, "config.profiles"),
    warnings: stringArrayAt(object.warnings, "config.warnings")
  };
}

export function validateCelestePathResponse(value: unknown): { celestePath: string } {
  const object = objectAt(value, "celestePath response");
  return { celestePath: stringAt(object.celestePath, "celestePath response.celestePath") };
}

export function validateNullableString(value: unknown): string | null {
  if (value === null) return null;
  return stringAt(value, "nullable string");
}

export function validateScanResult(value: unknown): ScanResult {
  const object = objectAt(value, "scan");
  return {
    celestePath: stringAt(object.celestePath, "scan.celestePath"),
    modsPath: stringAt(object.modsPath, "scan.modsPath"),
    blacklistPath: stringAt(object.blacklistPath, "scan.blacklistPath"),
    blacklistEntries: stringArrayAt(object.blacklistEntries, "scan.blacklistEntries"),
    gameExecutable: stringAt(object.gameExecutable, "scan.gameExecutable"),
    maps: arrayAt(object.maps, "scan.maps").map((item, index) => validateModRecord(item, `scan.maps[${index}]`)),
    otherMods: arrayAt(object.otherMods, "scan.otherMods").map((item, index) => validateModRecord(item, `scan.otherMods[${index}]`)),
    profiles: validateProfilesState(object.profiles, "scan.profiles"),
    availableSaveFiles: arrayAt(object.availableSaveFiles, "scan.availableSaveFiles").map((item, index) =>
      validateSaveFileInfo(item, `scan.availableSaveFiles[${index}]`)
    ),
    selectedSaveFiles: stringArrayAt(object.selectedSaveFiles, "scan.selectedSaveFiles"),
    warnings: stringArrayAt(object.warnings, "scan.warnings"),
    timings: arrayAt(object.timings, "scan.timings").map((item, index) => validateScanTiming(item, `scan.timings[${index}]`))
  };
}

export function validateProfilesState(value: unknown, path = "profiles"): ProfilesState {
  const object = objectAt(value, path);
  return {
    activeMapProfileId: stringAt(object.activeMapProfileId, `${path}.activeMapProfileId`),
    activeModProfileId: stringAt(object.activeModProfileId, `${path}.activeModProfileId`),
    profiles: arrayAt(object.profiles, `${path}.profiles`).map((item, index) => validateProfile(item, `${path}.profiles[${index}]`))
  };
}

export function validateLaunchResult(value: unknown): LaunchResult {
  const object = objectAt(value, "launch result");
  return {
    launched: booleanAt(object.launched, "launch result.launched"),
    executable: stringAt(object.executable, "launch result.executable"),
    mapProfileId: stringAt(object.mapProfileId, "launch result.mapProfileId"),
    modProfileId: stringAt(object.modProfileId, "launch result.modProfileId")
  };
}

export function validateBackupInfo(value: unknown, path = "backup"): BackupInfo {
  const object = objectAt(value, path);
  return {
    id: stringAt(object.id, `${path}.id`),
    createdAt: stringAt(object.createdAt, `${path}.createdAt`),
    kind: oneOfAt(object.kind, ["manual", "auto"], `${path}.kind`),
    celestePath: stringAt(object.celestePath, `${path}.celestePath`),
    backupPath: stringAt(object.backupPath, `${path}.backupPath`),
    files: arrayAt(object.files, `${path}.files`).map((item, index) => validateBackupFileEntry(item, `${path}.files[${index}]`)),
    mods: arrayAt(object.mods ?? [], `${path}.mods`).map((item, index) => validateBackupModEntry(item, `${path}.mods[${index}]`))
  };
}

export function validateBackupList(value: unknown): BackupInfo[] {
  return arrayAt(value, "backups").map((item, index) => validateBackupInfo(item, `backups[${index}]`));
}

export function validateModCatalogSearchResult(value: unknown): ModCatalogSearchResult {
  const object = objectAt(value, "mod catalog search");
  return {
    sources: arrayAt(object.sources, "mod catalog search.sources").map((item, index) =>
      validateModCatalogSourceKind(item, `mod catalog search.sources[${index}]`)
    ),
    entries: arrayAt(object.entries, "mod catalog search.entries").map((item, index) =>
      validateModCatalogEntry(item, `mod catalog search.entries[${index}]`)
    ),
    warnings: stringArrayAt(object.warnings, "mod catalog search.warnings")
  };
}

export function validateModCatalogDependencyResolutionResult(value: unknown): ModCatalogDependencyResolutionResult {
  const object = objectAt(value, "mod catalog dependency resolution");
  return {
    sources: arrayAt(object.sources, "mod catalog dependency resolution.sources").map((item, index) =>
      validateModCatalogSourceKind(item, `mod catalog dependency resolution.sources[${index}]`)
    ),
    resolutions: arrayAt(object.resolutions, "mod catalog dependency resolution.resolutions").map((item, index) => {
      const resolution = objectAt(item, `mod catalog dependency resolution.resolutions[${index}]`);
      return {
        dependency: validateDependency(resolution.dependency, `mod catalog dependency resolution.resolutions[${index}].dependency`),
        entry:
          resolution.entry === null
            ? null
            : validateModCatalogEntry(resolution.entry, `mod catalog dependency resolution.resolutions[${index}].entry`)
      };
    }),
    warnings: stringArrayAt(object.warnings, "mod catalog dependency resolution.warnings")
  };
}

export function validateModUpdateCheckResult(value: unknown): ModUpdateCheckResult {
  const object = objectAt(value, "mod update check");
  return {
    sources: arrayAt(object.sources, "mod update check.sources").map((item, index) =>
      validateModCatalogSourceKind(item, `mod update check.sources[${index}]`)
    ),
    updates: arrayAt(object.updates, "mod update check.updates").map((item, index) =>
      validateModUpdateCandidate(item, `mod update check.updates[${index}]`)
    ),
    matched: arrayAt(object.matched, "mod update check.matched").map((item, index) =>
      validateModUpdateCandidate(item, `mod update check.matched[${index}]`)
    ),
    warnings: stringArrayAt(object.warnings, "mod update check.warnings")
  };
}

export function validateModInstallResult(value: unknown): ModInstallResult {
  const object = objectAt(value, "mod install result");
  return {
    entry: validateModCatalogEntry(object.entry, "mod install result.entry"),
    destinationPath: stringAt(object.destinationPath, "mod install result.destinationPath"),
    replacedPath: object.replacedPath === null ? null : stringAt(object.replacedPath, "mod install result.replacedPath"),
    hash: stringAt(object.hash, "mod install result.hash"),
    scan: validateScanResult(object.scan)
  };
}

export function validateStagedDownload(value: unknown): StagedDownload {
  const object = objectAt(value, "staged download");
  return {
    stagedId: stringAt(object.stagedId, "staged download.stagedId"),
    name: stringAt(object.name, "staged download.name"),
    kind: oneOfAt(object.kind, ["mod", "everest"], "staged download.kind"),
    size: nullableNumberAt(object.size, "staged download.size"),
    hash: object.hash === null ? null : stringAt(object.hash, "staged download.hash")
  };
}

export function validateModPreviewStaging(value: unknown): ModPreviewStaging {
  const object = objectAt(value, "mod preview staging");
  return {
    staged: validateStagedDownload(object.staged),
    metadata: validateModMetadata(object.metadata, "mod preview staging.metadata")
  };
}

export function validateEverestReleaseList(value: unknown): EverestReleaseList {
  const object = objectAt(value, "everest release list");
  return {
    releases: arrayAt(object.releases, "everest release list.releases").map((item, index) =>
      validateEverestRelease(item, `everest release list.releases[${index}]`)
    ),
    warnings: stringArrayAt(object.warnings, "everest release list.warnings")
  };
}

export function validateEverestInstallResult(value: unknown): EverestInstallResult {
  const object = objectAt(value, "everest install result");
  return {
    release: validateEverestRelease(object.release, "everest install result.release"),
    scan: validateScanResult(object.scan)
  };
}

export function validateVoid(value: unknown): void {
  if (value !== null && typeof value !== "undefined") {
    throw new Error("API 返回数据格式异常：void 命令不应返回数据。");
  }
}

function validateBackupFileEntry(value: unknown, path: string): BackupFileEntry {
  const object = objectAt(value, path);
  return {
    category: oneOfAt(object.category, ["state", "game"], `${path}.category`),
    label: stringAt(object.label, `${path}.label`),
    targetPath: stringAt(object.targetPath, `${path}.targetPath`),
    backupPath: stringAt(object.backupPath, `${path}.backupPath`),
    existed: booleanAt(object.existed, `${path}.existed`)
  };
}

function validateBackupModEntry(value: unknown, path: string): BackupModEntry {
  const object = objectAt(value, path);
  return {
    name: stringAt(object.name, `${path}.name`),
    metadataName: stringAt(object.metadataName, `${path}.metadataName`),
    fileName: stringAt(object.fileName, `${path}.fileName`),
    relativePath: stringAt(object.relativePath, `${path}.relativePath`),
    version: stringAt(object.version, `${path}.version`),
    enabled: booleanAt(object.enabled, `${path}.enabled`),
    isArchive: booleanAt(object.isArchive, `${path}.isArchive`)
  };
}

function validateModCatalogEntry(value: unknown, path: string): ModCatalogEntry {
  const object = objectAt(value, path);
  return {
    source: validateModCatalogSourceKind(object.source, `${path}.source`),
    id: stringAt(object.id, `${path}.id`),
    name: stringAt(object.name, `${path}.name`),
    version: stringAt(object.version, `${path}.version`),
    downloadUrl: stringAt(object.downloadUrl, `${path}.downloadUrl`),
    pageUrl: stringAt(object.pageUrl, `${path}.pageUrl`),
    gameBananaType: stringAt(object.gameBananaType, `${path}.gameBananaType`),
    categoryName: stringAt(object.categoryName ?? "", `${path}.categoryName`),
    subCategoryName: stringAt(object.subCategoryName ?? "", `${path}.subCategoryName`),
    gameBananaId: nullableNumberAt(object.gameBananaId, `${path}.gameBananaId`),
    gameBananaFileId: nullableNumberAt(object.gameBananaFileId, `${path}.gameBananaFileId`),
    size: nullableNumberAt(object.size, `${path}.size`),
    lastUpdate: nullableNumberAt(object.lastUpdate, `${path}.lastUpdate`),
    xxHash: stringArrayAt(object.xxHash, `${path}.xxHash`)
  };
}

function validateModUpdateCandidate(value: unknown, path: string): ModUpdateCandidate {
  const object = objectAt(value, path);
  return {
    entry: validateModCatalogEntry(object.entry, `${path}.entry`),
    installed: validateInstalledModMatch(object.installed, `${path}.installed`),
    updateAvailable: booleanAt(object.updateAvailable, `${path}.updateAvailable`),
    reason: stringAt(object.reason, `${path}.reason`)
  };
}

function validateEverestRelease(value: unknown, path: string): EverestRelease {
  const object = objectAt(value, path);
  return {
    branch: stringAt(object.branch, `${path}.branch`),
    version: numberAt(object.version, `${path}.version`),
    date: stringAt(object.date, `${path}.date`),
    commit: stringAt(object.commit, `${path}.commit`),
    mainFileSize: nullableNumberAt(object.mainFileSize, `${path}.mainFileSize`),
    mainDownload: stringAt(object.mainDownload, `${path}.mainDownload`),
    mirrorDownload: stringAt(object.mirrorDownload, `${path}.mirrorDownload`),
    isNative: booleanAt(object.isNative, `${path}.isNative`)
  };
}

function validateInstalledModMatch(value: unknown, path: string): InstalledModMatch {
  const object = objectAt(value, path);
  return {
    recordId: stringAt(object.recordId, `${path}.recordId`),
    name: stringAt(object.name, `${path}.name`),
    fileName: stringAt(object.fileName, `${path}.fileName`),
    relativePath: stringAt(object.relativePath, `${path}.relativePath`),
    absolutePath: stringAt(object.absolutePath, `${path}.absolutePath`),
    version: stringAt(object.version, `${path}.version`),
    hash: stringAt(object.hash, `${path}.hash`)
  };
}

function validateModCatalogSourceKind(value: unknown, path: string): ModCatalogSourceKind {
  return oneOfAt(value, ["everest", "everestMirror", "wegfan"], path);
}

function validateSaveFileInfo(value: unknown, path: string): SaveFileInfo {
  const object = objectAt(value, path);
  return {
    name: stringAt(object.name, `${path}.name`),
    playerName: stringAt(object.playerName, `${path}.playerName`),
    currentMap: stringAt(object.currentMap, `${path}.currentMap`),
    lastModified: stringAt(object.lastModified, `${path}.lastModified`)
  };
}

function validateScanTiming(value: unknown, path: string): ScanTiming {
  const object = objectAt(value, path);
  return {
    stage: stringAt(object.stage, `${path}.stage`),
    ms: numberAt(object.ms, `${path}.ms`)
  };
}

function validateProfile(value: unknown, path: string): Profile {
  const object = objectAt(value, path);
  return {
    id: stringAt(object.id, `${path}.id`),
    name: stringAt(object.name, `${path}.name`),
    profileType: oneOfAt(object.profileType, ["maps", "mods"], `${path}.profileType`),
    enabledMapIds: nullableStringArrayAt(object.enabledMapIds, `${path}.enabledMapIds`),
    enabledModIds: nullableStringArrayAt(object.enabledModIds, `${path}.enabledModIds`),
    launchArgs: stringAt(object.launchArgs, `${path}.launchArgs`),
    createdAt: stringAt(object.createdAt, `${path}.createdAt`),
    updatedAt: stringAt(object.updatedAt, `${path}.updatedAt`)
  };
}

function validateModRecord(value: unknown, path: string): ModRecord {
  const object = objectAt(value, path);
  return {
    id: stringAt(object.id, `${path}.id`),
    name: stringAt(object.name, `${path}.name`),
    fileName: stringAt(object.fileName, `${path}.fileName`),
    relativePath: stringAt(object.relativePath, `${path}.relativePath`),
    absolutePath: stringAt(object.absolutePath, `${path}.absolutePath`),
    isArchive: booleanAt(object.isArchive, `${path}.isArchive`),
    kind: oneOfAt(object.kind, ["map", "mod"], `${path}.kind`),
    enabled: booleanAt(object.enabled, `${path}.enabled`),
    favorite: booleanAt(object.favorite, `${path}.favorite`),
    protected: booleanAt(object.protected, `${path}.protected`),
    readOnly: booleanAt(object.readOnly, `${path}.readOnly`),
    metadata: validateModMetadata(object.metadata, `${path}.metadata`),
    mapIds: stringArrayAt(object.mapIds, `${path}.mapIds`),
    subMaps: arrayAt(object.subMaps, `${path}.subMaps`).map((item, index) => validateSubMapInfo(item, `${path}.subMaps[${index}]`)),
    mapCount: numberAt(object.mapCount, `${path}.mapCount`),
    strawberryCount: numberAt(object.strawberryCount, `${path}.strawberryCount`),
    strawberryTotalCount: numberAt(object.strawberryTotalCount, `${path}.strawberryTotalCount`),
    completionStatus: oneOfAt(object.completionStatus, ["completed", "unfinished", "unknown", "notApplicable"], `${path}.completionStatus`),
    dependencies: arrayAt(object.dependencies, `${path}.dependencies`).map((item, index) =>
      validateDependency(item, `${path}.dependencies[${index}]`)
    ),
    optionalDependencies: arrayAt(object.optionalDependencies, `${path}.optionalDependencies`).map((item, index) =>
      validateDependency(item, `${path}.optionalDependencies[${index}]`)
    ),
    stats: nullableMapStatsAt(object.stats, `${path}.stats`),
    warnings: stringArrayAt(object.warnings, `${path}.warnings`)
  };
}

export function validateModMetadata(value: unknown, path = "mod metadata"): ModMetadata {
  const object = objectAt(value, path);
  return {
    name: stringAt(object.name, `${path}.name`),
    version: stringAt(object.version, `${path}.version`),
    author: stringAt(object.author, `${path}.author`),
    description: stringAt(object.description, `${path}.description`),
    dependencies: arrayAt(object.dependencies, `${path}.dependencies`).map((item, index) =>
      validateDependency(item, `${path}.dependencies[${index}]`)
    ),
    optionalDependencies: arrayAt(object.optionalDependencies, `${path}.optionalDependencies`).map((item, index) =>
      validateDependency(item, `${path}.optionalDependencies[${index}]`)
    )
  };
}

function validateDependency(value: unknown, path: string): Dependency {
  const object = objectAt(value, path);
  return {
    name: stringAt(object.name, `${path}.name`),
    version: stringAt(object.version, `${path}.version`)
  };
}

function validateSubMapInfo(value: unknown, path: string): SubMapInfo {
  const object = objectAt(value, path);
  return {
    id: stringAt(object.id, `${path}.id`),
    sid: stringAt(object.sid, `${path}.sid`),
    modeIndex: object.modeIndex === null ? null : numberAt(object.modeIndex, `${path}.modeIndex`),
    displayName: stringAt(object.displayName, `${path}.displayName`),
    chapter: stringAt(object.chapter, `${path}.chapter`),
    filePath: stringAt(object.filePath, `${path}.filePath`),
    difficulty: stringAt(object.difficulty, `${path}.difficulty`),
    strawberryCount: numberAt(object.strawberryCount, `${path}.strawberryCount`),
    strawberryTotalCount: numberAt(object.strawberryTotalCount, `${path}.strawberryTotalCount`),
    completionStatus: oneOfAt(object.completionStatus, ["completed", "unfinished", "unknown", "notApplicable"], `${path}.completionStatus`),
    stats: nullableMapStatsAt(object.stats, `${path}.stats`)
  };
}

function nullableMapStatsAt(value: unknown, path: string): MapStats | null {
  if (value === null) return null;
  const object = objectAt(value, path);
  return {
    deaths: numberAt(object.deaths, `${path}.deaths`),
    strawberries: numberAt(object.strawberries, `${path}.strawberries`),
    totalStrawberries: numberAt(object.totalStrawberries, `${path}.totalStrawberries`),
    staleStrawberries: numberAt(object.staleStrawberries, `${path}.staleStrawberries`),
    strawberriesKnown: booleanAt(object.strawberriesKnown, `${path}.strawberriesKnown`),
    timePlayed: numberAt(object.timePlayed, `${path}.timePlayed`),
    completed: booleanAt(object.completed, `${path}.completed`),
    completionKnown: booleanAt(object.completionKnown, `${path}.completionKnown`),
    cassettes: numberAt(object.cassettes, `${path}.cassettes`),
    hearts: numberAt(object.hearts, `${path}.hearts`),
    saveFiles: stringArrayAt(object.saveFiles, `${path}.saveFiles`)
  };
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`API 返回数据格式异常：${path} 应为对象。`);
  }
  return value as Record<string, unknown>;
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`API 返回数据格式异常：${path} 应为数组。`);
  return value;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`API 返回数据格式异常：${path} 应为字符串。`);
  return value;
}

function stringArrayAt(value: unknown, path: string): string[] {
  return arrayAt(value, path).map((item, index) => stringAt(item, `${path}[${index}]`));
}

function nullableStringArrayAt(value: unknown, path: string): string[] | null {
  if (value === null) return null;
  return stringArrayAt(value, path);
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`API 返回数据格式异常：${path} 应为布尔值。`);
  return value;
}

function numberAt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`API 返回数据格式异常：${path} 应为数字。`);
  }
  return value;
}

function nullableNumberAt(value: unknown, path: string): number | null {
  if (value === null) return null;
  return numberAt(value, path);
}

function oneOfAt<const Values extends readonly string[]>(value: unknown, values: Values, path: string): Values[number] {
  if (typeof value === "string" && values.includes(value)) return value;
  throw new Error(`API 返回数据格式异常：${path} 应为 ${values.join(" / ")}。`);
}
