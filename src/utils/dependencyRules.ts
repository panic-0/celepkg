import type { Dependency, ModRecord } from "../types";
import { isEverestDependencyName } from "./everestDependency";

export function normalizeDependencyName(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/[_-]/g, " ")
    .trim()
    .replace(/\.zip$/i, "")
    .split(/\s+/)
    .join(" ")
    .toLowerCase();
}

export function dependencyAliasesForRecord(record: ModRecord) {
  return [record.id, ...catalogAliasesForRecord(record)];
}

export function catalogAliasesForRecord(record: ModRecord) {
  return [record.name, record.metadata.name, record.fileName, record.fileName.replace(/\.zip$/i, ""), record.relativePath];
}

export function buildModAliasMap(mods: ModRecord[]) {
  const aliases = new Map<string, string>();
  for (const modItem of mods) {
    for (const alias of dependencyAliasesForRecord(modItem)) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) aliases.set(normalized, modItem.id);
    }
  }
  return aliases;
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
  const seedModIds = dependencyClosureSeedModIds(baseModIds);
  return collectDependencyClosure({ isSourceEnabled, seedModIds, sourceRecords, targetMods }).inferred;
}

export function collectRequiredDependencyClosureModIds({
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
  const seedModIds = dependencyClosureSeedModIds(baseModIds);
  const closure = collectDependencyClosure({ isSourceEnabled, seedModIds, sourceRecords, targetMods });
  return [...closure.enabled].sort();
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
  const normalized = normalizeBuiltinDependencyName(name);
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

function dependencyClosureSeedModIds(baseModIds: Set<string>) {
  return new Set(baseModIds);
}

function collectDependencyClosure({
  isSourceEnabled,
  seedModIds,
  sourceRecords,
  targetMods
}: {
  isSourceEnabled: (record: ModRecord) => boolean;
  seedModIds: Set<string>;
  sourceRecords: ModRecord[];
  targetMods: ModRecord[];
}) {
  const aliasToModId = buildModAliasMap(targetMods);
  const modById = new Map(targetMods.map((modItem) => [modItem.id, modItem]));
  const enabled = new Set(seedModIds);
  const inferred = new Set<string>();
  const queue = [...seedModIds];
  const addDependency = (name: string) => {
    const id = aliasToModId.get(normalizeDependencyName(name));
    if (id && !enabled.has(id)) {
      enabled.add(id);
      inferred.add(id);
      queue.push(id);
    }
  };

  for (const record of sourceRecords) {
    if (isSourceEnabled(record)) record.dependencies.forEach((dependency: Dependency) => addDependency(dependency.name));
  }
  while (queue.length) {
    const modItem = modById.get(queue.shift() ?? "");
    modItem?.dependencies.forEach((dependency) => addDependency(dependency.name));
  }
  return { enabled, inferred };
}

function normalizeBuiltinDependencyName(name: string) {
  return name.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
