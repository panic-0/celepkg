import type { ModRecord } from "../types";
import { buildModAliasMap, catalogAliasesForRecord, normalizeDependencyName } from "./dependencyRules";

export { buildModAliasMap, catalogAliasesForRecord, dependencyAliasesForRecord, normalizeDependencyName } from "./dependencyRules";

export type DependencyReference = {
  id: string;
  name: string;
  kind: ModRecord["kind"];
  fileName: string;
};

export function buildInstalledCatalogAliasSet(records: ModRecord[]) {
  const aliases = new Set<string>();
  for (const record of records) {
    if (record.readOnly) continue;
    for (const alias of catalogAliasesForRecord(record)) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) aliases.add(normalized);
    }
  }
  return aliases;
}

export function isCatalogEntryInstalled(entryName: string, installedAliases: Set<string>) {
  const normalized = normalizeDependencyName(entryName);
  return Boolean(normalized && installedAliases.has(normalized));
}

export function findDependencyReferencesByModId(sourceRecords: ModRecord[], targetMods: ModRecord[]) {
  const aliasToModId = buildModAliasMap(targetMods);
  const requiredReferences = new Map<string, Map<string, DependencyReference>>();
  const optionalReferences = new Map<string, Map<string, DependencyReference>>();

  for (const record of sourceRecords) {
    addReferences(requiredReferences, aliasToModId, record, record.dependencies);
    addReferences(optionalReferences, aliasToModId, record, record.optionalDependencies);
  }

  return {
    optionalReferencesByModId: sortReferenceMap(optionalReferences),
    requiredReferencesByModId: sortReferenceMap(requiredReferences)
  };
}

function addReferences(
  references: Map<string, Map<string, DependencyReference>>,
  aliasToModId: Map<string, string>,
  record: ModRecord,
  dependencies: ModRecord["dependencies"]
) {
  for (const dependency of dependencies) {
    const modId = aliasToModId.get(normalizeDependencyName(dependency.name));
    if (!modId || modId === record.id) continue;
    const records = references.get(modId) ?? new Map<string, DependencyReference>();
    records.set(record.id, {
      fileName: record.fileName,
      id: record.id,
      kind: record.kind,
      name: record.name
    });
    references.set(modId, records);
  }
}

function sortReferenceMap(references: Map<string, Map<string, DependencyReference>>) {
  return new Map(
    [...references].map(([modId, records]) => [modId, [...records.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))])
  );
}
