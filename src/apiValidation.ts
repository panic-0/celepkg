import type {
  BackupFileEntry,
  BackupInfo,
  ConfigResponse,
  Dependency,
  MapStats,
  ModMetadata,
  ModRecord,
  Profile,
  ProfilesState,
  SaveFileInfo,
  ScanResult,
  SubMapInfo
} from "./types";

type LaunchResult = { launched: boolean; executable: string; mapProfileId: string; modProfileId: string };

export function validateConfigResponse(value: unknown): ConfigResponse {
  const object = objectAt(value, "config");
  return {
    celestePath: stringAt(object.celestePath, "config.celestePath"),
    autoBackupEnabled: booleanAt(object.autoBackupEnabled, "config.autoBackupEnabled"),
    selectedSaveFiles: stringArrayAt(object.selectedSaveFiles, "config.selectedSaveFiles"),
    profiles: validateProfilesState(object.profiles, "config.profiles")
  };
}

export function validateCelestePathResponse(value: unknown): { celestePath: string } {
  const object = objectAt(value, "celestePath response");
  return { celestePath: stringAt(object.celestePath, "celestePath response.celestePath") };
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
    warnings: stringArrayAt(object.warnings, "scan.warnings")
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
    files: arrayAt(object.files, `${path}.files`).map((item, index) => validateBackupFileEntry(item, `${path}.files[${index}]`))
  };
}

export function validateBackupList(value: unknown): BackupInfo[] {
  return arrayAt(value, "backups").map((item, index) => validateBackupInfo(item, `backups[${index}]`));
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

function validateSaveFileInfo(value: unknown, path: string): SaveFileInfo {
  const object = objectAt(value, path);
  return {
    name: stringAt(object.name, `${path}.name`),
    playerName: stringAt(object.playerName, `${path}.playerName`),
    currentMap: stringAt(object.currentMap, `${path}.currentMap`),
    lastModified: stringAt(object.lastModified, `${path}.lastModified`)
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

function validateModMetadata(value: unknown, path: string): ModMetadata {
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

function oneOfAt<const Values extends readonly string[]>(value: unknown, values: Values, path: string): Values[number] {
  if (typeof value === "string" && values.includes(value)) return value;
  throw new Error(`API 返回数据格式异常：${path} 应为 ${values.join(" / ")}。`);
}
