import { useMemo, useState } from "react";
import type { ModRecord, ScanResult } from "../types";
import type { EnabledFilter, ProgressFilter, SortKey } from "../viewTypes";
import { isDraftEnabled } from "../utils/format";

type ModFiltersOptions = {
  enabledMapDraft: Set<string>;
  enabledModDraft: Set<string>;
  scan: ScanResult;
};

export function useModFilters({ enabledMapDraft, enabledModDraft, scan }: ModFiltersOptions) {
  const [query, setQuery] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [showHelperMaps, setShowHelperMaps] = useState(false);
  const [showOnlyUnreferencedMods, setShowOnlyUnreferencedMods] = useState(false);

  const helperMapMods = useMemo(() => scan.otherMods.filter((modItem) => modItem.subMaps.length > 0), [scan.otherMods]);
  const visibleMapRecords = useMemo(
    () => (showHelperMaps ? [...scan.maps, ...helperMapMods] : scan.maps),
    [helperMapMods, scan.maps, showHelperMaps]
  );
  const referencedModIds = useMemo(() => findReferencedModIds(scan), [scan]);

  const filteredMaps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const maps = visibleMapRecords.filter((map) => {
      const draftEnabled = isDraftEnabled(map, enabledMapDraft, enabledModDraft);
      if (enabledFilter === "enabled" && !draftEnabled) return false;
      if (enabledFilter === "disabled" && draftEnabled) return false;
      if (progressFilter === "completed" && map.completionStatus !== "completed") return false;
      if (progressFilter === "unfinished" && map.completionStatus !== "unfinished") return false;
      if (progressFilter === "withStats" && !map.stats) return false;
      if (progressFilter === "warnings" && !map.warnings.length) return false;
      if (!normalizedQuery) return true;
      return mapSearchText(map).includes(normalizedQuery);
    });
    return [...maps].sort((a, b) => {
      if (sortKey === "deaths") return (b.stats?.deaths ?? -1) - (a.stats?.deaths ?? -1);
      if (sortKey === "time") return (b.stats?.timePlayed ?? -1) - (a.stats?.timePlayed ?? -1);
      if (sortKey === "strawberries") return (b.stats?.strawberries ?? -1) - (a.stats?.strawberries ?? -1);
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
  }, [enabledMapDraft, enabledFilter, enabledModDraft, progressFilter, query, sortKey, visibleMapRecords]);

  const filteredMods = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const mods = scan.otherMods.filter((modItem) => {
      const draftEnabled = enabledModDraft.has(modItem.id);
      if (enabledFilter === "enabled" && !draftEnabled) return false;
      if (enabledFilter === "disabled" && draftEnabled) return false;
      if (progressFilter === "warnings" && !modItem.warnings.length) return false;
      if (showOnlyUnreferencedMods && referencedModIds.has(modItem.id)) return false;
      if (!normalizedQuery) return true;
      return [
        modItem.name,
        modItem.fileName,
        modItem.metadata.author,
        modItem.metadata.description,
        ...modItem.dependencies.map((dependency) => dependency.name)
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
    return [...mods].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  }, [enabledFilter, enabledModDraft, progressFilter, query, referencedModIds, scan.otherMods, showOnlyUnreferencedMods]);

  return {
    enabledFilter,
    filteredMaps,
    filteredMods,
    helperMapMods,
    progressFilter,
    query,
    referencedModIds,
    setEnabledFilter,
    setProgressFilter,
    setQuery,
    setShowHelperMaps,
    setShowOnlyUnreferencedMods,
    setSortKey,
    showHelperMaps,
    showOnlyUnreferencedMods,
    sortKey,
    visibleMapRecords
  };
}

function findReferencedModIds(scan: ScanResult) {
  const aliasToModId = new Map<string, string>();
  for (const modItem of scan.otherMods) {
    for (const alias of [
      modItem.id,
      modItem.name,
      modItem.metadata.name,
      modItem.fileName,
      modItem.fileName.replace(/\.zip$/i, ""),
      modItem.relativePath
    ]) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) aliasToModId.set(normalized, modItem.id);
    }
  }
  const referenced = new Set<string>();
  for (const record of [...scan.maps, ...scan.otherMods]) {
    for (const dependency of record.dependencies) {
      const modId = aliasToModId.get(normalizeDependencyName(dependency.name));
      if (modId && modId !== record.id) referenced.add(modId);
    }
  }
  return referenced;
}

function normalizeDependencyName(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/\.zip$/i, "")
    .replace(/[_-]/g, " ")
    .trim()
    .split(/\s+/)
    .join(" ")
    .toLowerCase();
}

function mapSearchText(map: ModRecord) {
  return [
    map.name,
    map.fileName,
    map.metadata.author,
    map.metadata.description,
    ...map.mapIds,
    ...map.subMaps.map((subMap) => `${subMap.displayName} ${subMap.chapter} ${subMap.filePath}`)
  ]
    .join(" ")
    .toLowerCase();
}
