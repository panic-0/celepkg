import { useEffect, useMemo, useState } from "react";
import type { ModRecord, ScanResult } from "../types";
import { buildModAliasMap, normalizeDependencyName } from "../utils/dependencies";
import type { EnabledFilter, ProgressFilter, ReferenceFilter, SortKey } from "../viewTypes";
import { isDraftEnabled } from "../utils/format";

type ModFiltersOptions = {
  enabledMapDraft: Set<string>;
  enabledModDraft: Set<string>;
  scan: ScanResult;
};

type SavedModFilters = {
  enabledFilter: EnabledFilter;
  progressFilter: ProgressFilter;
  query: string;
  referenceFilter: ReferenceFilter;
  showHelperMaps: boolean;
  showOnlyUnreferencedMods: boolean;
  sortKey: SortKey;
};

const STORAGE_KEY = "celepkg.ui.filters";
const defaultFilters: SavedModFilters = {
  enabledFilter: "all",
  progressFilter: "all",
  query: "",
  referenceFilter: "all",
  showHelperMaps: false,
  showOnlyUnreferencedMods: false,
  sortKey: "name"
};

export function useModFilters({ enabledMapDraft, enabledModDraft, scan }: ModFiltersOptions) {
  const savedFilters = useMemo(() => readSavedFilters(), []);
  const [query, setQuery] = useState(savedFilters.query);
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>(savedFilters.enabledFilter);
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>(savedFilters.progressFilter);
  const [referenceFilter, setReferenceFilter] = useState<ReferenceFilter>(savedFilters.referenceFilter);
  const [sortKey, setSortKey] = useState<SortKey>(savedFilters.sortKey);
  const [showHelperMaps, setShowHelperMaps] = useState(savedFilters.showHelperMaps);

  useEffect(() => {
    writeSavedFilters({
      enabledFilter,
      progressFilter,
      query,
      referenceFilter,
      showHelperMaps,
      showOnlyUnreferencedMods: referenceFilter !== "all",
      sortKey
    });
  }, [enabledFilter, progressFilter, query, referenceFilter, showHelperMaps, sortKey]);

  const helperMapMods = useMemo(() => scan.otherMods.filter((modItem) => modItem.subMaps.length > 0), [scan.otherMods]);
  const visibleMapRecords = useMemo(
    () => (showHelperMaps ? [...scan.maps, ...helperMapMods] : scan.maps),
    [helperMapMods, scan.maps, showHelperMaps]
  );
  const { optionalReferencedModIds, referencedModIds } = useMemo(() => findReferencedModIds(scan), [scan]);

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
      if (sortKey === "strawberries") return strawberrySortValue(b) - strawberrySortValue(a);
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
  }, [enabledMapDraft, enabledFilter, enabledModDraft, progressFilter, query, sortKey, visibleMapRecords]);

  const filteredMods = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const mods = scan.otherMods.filter((modItem) => {
      const draftEnabled = modItem.readOnly || enabledModDraft.has(modItem.id);
      if (enabledFilter === "enabled" && !draftEnabled) return false;
      if (enabledFilter === "disabled" && draftEnabled) return false;
      if (progressFilter === "warnings" && !modItem.warnings.length) return false;
      const isReferenced = referencedModIds.has(modItem.id);
      const isOptionalReferenced = optionalReferencedModIds.has(modItem.id);
      if (referenceFilter === "unreferenced" && isReferenced && !modItem.favorite) return false;
      if (referenceFilter === "unreferencedAndOptional" && (isReferenced || isOptionalReferenced) && !modItem.favorite) return false;
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
  }, [enabledFilter, enabledModDraft, optionalReferencedModIds, progressFilter, query, referenceFilter, referencedModIds, scan.otherMods]);

  return {
    enabledFilter,
    filteredMaps,
    filteredMods,
    helperMapMods,
    progressFilter,
    query,
    referenceFilter,
    referencedModIds,
    setEnabledFilter,
    setProgressFilter,
    setQuery,
    setReferenceFilter,
    setShowHelperMaps,
    setSortKey,
    showHelperMaps,
    sortKey,
    visibleMapRecords
  };
}

function readSavedFilters(): SavedModFilters {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return defaultFilters;
    const value = JSON.parse(text) as Partial<SavedModFilters>;
    return {
      enabledFilter: isEnabledFilter(value.enabledFilter) ? value.enabledFilter : defaultFilters.enabledFilter,
      progressFilter: isProgressFilter(value.progressFilter) ? value.progressFilter : defaultFilters.progressFilter,
      query: typeof value.query === "string" ? value.query : defaultFilters.query,
      referenceFilter: isReferenceFilter(value.referenceFilter)
        ? value.referenceFilter
        : value.showOnlyUnreferencedMods === true
          ? "unreferenced"
          : defaultFilters.referenceFilter,
      showHelperMaps: value.showHelperMaps === true,
      showOnlyUnreferencedMods: value.showOnlyUnreferencedMods === true,
      sortKey: isSortKey(value.sortKey) ? value.sortKey : defaultFilters.sortKey
    };
  } catch {
    return defaultFilters;
  }
}

function writeSavedFilters(filters: SavedModFilters) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Filter preferences are local UI state; ignore storage failures.
  }
}

function strawberrySortValue(record: { stats: { strawberries: number; strawberriesKnown: boolean } | null }) {
  return record.stats?.strawberriesKnown ? record.stats.strawberries : -1;
}

function isEnabledFilter(value: unknown): value is EnabledFilter {
  return value === "all" || value === "enabled" || value === "disabled";
}

function isProgressFilter(value: unknown): value is ProgressFilter {
  return value === "all" || value === "completed" || value === "unfinished" || value === "withStats" || value === "warnings";
}

function isReferenceFilter(value: unknown): value is ReferenceFilter {
  return value === "all" || value === "unreferenced" || value === "unreferencedAndOptional";
}

function isSortKey(value: unknown): value is SortKey {
  return value === "name" || value === "deaths" || value === "time" || value === "strawberries";
}

function findReferencedModIds(scan: ScanResult) {
  const aliasToModId = buildModAliasMap(scan.otherMods);
  const referenced = new Set<string>();
  const optionalReferenced = new Set<string>();
  for (const record of [...scan.maps, ...scan.otherMods]) {
    for (const dependency of record.dependencies) {
      const modId = aliasToModId.get(normalizeDependencyName(dependency.name));
      if (modId && modId !== record.id) referenced.add(modId);
    }
    for (const dependency of record.optionalDependencies) {
      const modId = aliasToModId.get(normalizeDependencyName(dependency.name));
      if (modId && modId !== record.id) optionalReferenced.add(modId);
    }
  }
  return { optionalReferencedModIds: optionalReferenced, referencedModIds: referenced };
}

function mapSearchText(map: ModRecord) {
  return [
    map.name,
    map.fileName,
    map.metadata.author,
    map.metadata.description,
    ...map.mapIds,
    ...map.subMaps.map((subMap) => `${subMap.displayName} ${subMap.chapter} ${subMap.filePath} ${subMap.difficulty}`)
  ]
    .join(" ")
    .toLowerCase();
}
