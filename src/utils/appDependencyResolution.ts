import type { Dependency, EverestRelease, ModCatalogEntry, ModRecord, ModUpdateCandidate } from "../types";
import { isEverestDependencyName } from "./everestDependency";
import { buildModAliasMap, dependencyAliasesForRecord, normalizeDependencyName } from "./dependencies";

export type DependencyUpdateChoice = "none" | "required" | "all";
export type DependencyActionLabel = "安装" | "更新";
export type EverestDependencyChoice = "update" | "ignore";

export type DependencyIssue = {
  dependency: Dependency;
  installed?: ModRecord;
  optional: boolean;
  reason: "missing" | "tooLow";
};

export type DependencyUpdateAction =
  | { kind: "everest"; name: string; release: EverestRelease }
  | { kind: "update"; name: string; candidate: ModUpdateCandidate }
  | { kind: "install"; name: string; entry: ModCatalogEntry };

export type DependencyUpdatePlan = {
  actionLabel: DependencyActionLabel;
  choice: DependencyUpdateChoice;
  issues: DependencyIssue[];
  targetName: string;
};

export function buildInstalledDependencyIndex(records: ModRecord[]) {
  const index = new Map<string, ModRecord>();
  for (const record of records) {
    for (const alias of dependencyAliasesForRecord(record)) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) index.set(normalized, record);
    }
  }
  return index;
}

export function dependencyIssueForInstalledDependency(
  dependency: Dependency,
  installedIndex: Map<string, ModRecord>,
  optional: boolean
): DependencyIssue | null {
  const installed = installedIndex.get(normalizeDependencyName(dependency.name));
  if (!installed) return { dependency, optional, reason: "missing" };
  if (dependency.version.trim() && versionTooLow(installed.metadata.version, dependency.version)) {
    return { dependency, installed, optional, reason: "tooLow" };
  }
  return null;
}

export function collectTransitiveRequiredDependencyModIds({
  baseModIds,
  isSourceEnabled,
  sourceRecords,
  targetMods
}: {
  baseModIds: Set<string>;
  isSourceEnabled: (record: ModRecord) => boolean;
  sourceRecords: ModRecord[];
  targetMods: ModRecord[];
}) {
  const aliasToModId = buildModAliasMap(targetMods);
  const modById = new Map(targetMods.map((modItem) => [modItem.id, modItem]));
  const seedModIds = new Set([...baseModIds, ...targetMods.filter((modItem) => modItem.protected).map((modItem) => modItem.id)]);
  const inferred = new Set<string>();
  const queue: string[] = [];
  const addDependency = (name: string) => {
    const id = aliasToModId.get(normalizeDependencyName(name));
    if (id && !seedModIds.has(id) && !inferred.has(id)) {
      inferred.add(id);
      queue.push(id);
    }
  };

  for (const record of sourceRecords) {
    if (isSourceEnabled(record)) record.dependencies.forEach((dependency) => addDependency(dependency.name));
  }
  for (const id of seedModIds) queue.push(id);
  while (queue.length) {
    const modItem = modById.get(queue.shift() ?? "");
    modItem?.dependencies.forEach((dependency) => addDependency(dependency.name));
  }
  return inferred;
}

export function updateCandidateFromRecord(entry: ModCatalogEntry, record: ModRecord): ModUpdateCandidate {
  return {
    entry,
    installed: {
      recordId: record.id,
      name: record.name,
      fileName: record.fileName,
      relativePath: record.relativePath,
      absolutePath: record.absolutePath,
      version: record.metadata.version,
      hash: ""
    },
    updateAvailable: true,
    reason: "依赖版本需要更新"
  };
}

export function dependencyEntrySatisfies(entry: ModCatalogEntry, dependency: Dependency) {
  return entry.downloadUrl.trim().length > 0 && !versionTooLow(entry.version, dependency.version);
}

export function formatDependencyIssue(issue: DependencyIssue) {
  const requiredVersion = issue.dependency.version.trim() || "未指定版本";
  if (issue.reason === "missing") return `缺少 ${requiredVersion}`;
  return `需要 ${requiredVersion}，本地 ${issue.installed?.metadata.version || "未知版本"}`;
}

export function versionTooLow(installedVersion: string, requiredVersion: string) {
  const installed = parseNumericVersion(installedVersion);
  const required = parseNumericVersion(requiredVersion);
  if (!installed || !required) return false;
  return compareNumericVersions(installed, required) < 0;
}

export function parseNumericVersion(value: string) {
  const matches = value.match(/\d+/g);
  return matches?.map((part) => Number.parseInt(part, 10)).filter((part) => Number.isFinite(part)) ?? null;
}

export function compareNumericVersions(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isBuiltinDependencyName(name: string) {
  const normalized = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    isEverestDependencyName(name) ||
    normalized === "celeste" ||
    normalized === "monocle" ||
    normalized === "fna" ||
    normalized === "dotnet" ||
    normalized === "netframework" ||
    normalized === "microsoftnetframework"
  );
}
