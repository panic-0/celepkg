import type { ModRecord } from "../types";

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

export function buildModAliasMap(mods: ModRecord[]) {
  const aliases = new Map<string, string>();
  for (const modItem of mods) {
    for (const alias of dependencyAliasesForMod(modItem)) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) aliases.set(normalized, modItem.id);
    }
  }
  return aliases;
}

export function buildInstalledCatalogAliasSet(records: ModRecord[]) {
  const aliases = new Set<string>();
  for (const record of records) {
    if (record.readOnly) continue;
    for (const alias of catalogAliasesForInstalledRecord(record)) {
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

function dependencyAliasesForMod(modItem: ModRecord) {
  return [modItem.id, ...catalogAliasesForInstalledRecord(modItem)];
}

function catalogAliasesForInstalledRecord(record: ModRecord) {
  return [record.name, record.metadata.name, record.fileName, record.fileName.replace(/\.zip$/i, ""), record.relativePath];
}
