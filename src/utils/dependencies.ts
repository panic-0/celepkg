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
    for (const alias of [
      modItem.id,
      modItem.name,
      modItem.metadata.name,
      modItem.fileName,
      modItem.fileName.replace(/\.zip$/i, ""),
      modItem.relativePath
    ]) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) aliases.set(normalized, modItem.id);
    }
  }
  return aliases;
}
