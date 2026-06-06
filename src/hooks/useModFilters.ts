import { useMemo, useState } from "react";
import type { ModRecord, ScanResult } from "../types";
import { findDependencyReferencesByModId } from "../utils/dependencies";
import type { EnabledFilter, ProgressFilter, ReferenceFilter, SortKey } from "../viewTypes";
import { isDraftEnabled } from "../utils/format";

type ModFiltersOptions = {
  enabledMapDraft: Set<string>;
  enabledModDraft: Set<string>;
  scan: ScanResult;
};

export function useModFilters({ enabledMapDraft, enabledModDraft, scan }: ModFiltersOptions) {
  const [query, setQuery] = useState("");
  const [mapEnabledFilter, setMapEnabledFilter] = useState<EnabledFilter>("all");
  const [mapProgressFilter, setMapProgressFilter] = useState<ProgressFilter>("all");
  const [mapSortKey, setMapSortKey] = useState<SortKey>("name");
  const [showHelperMaps, setShowHelperMaps] = useState(false);
  const [modEnabledFilter, setModEnabledFilter] = useState<EnabledFilter>("all");
  const [modProgressFilter, setModProgressFilter] = useState<ProgressFilter>("all");
  const [modReferenceFilter, setModReferenceFilter] = useState<ReferenceFilter>("all");

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
      if (mapEnabledFilter === "enabled" && !draftEnabled) return false;
      if (mapEnabledFilter === "disabled" && draftEnabled) return false;
      if (mapProgressFilter === "completed" && map.completionStatus !== "completed") return false;
      if (mapProgressFilter === "unfinished" && map.completionStatus !== "unfinished") return false;
      if (mapProgressFilter === "withStats" && !map.stats) return false;
      if (mapProgressFilter === "warnings" && !map.warnings.length) return false;
      if (!normalizedQuery) return true;
      return mapSearchText(map).includes(normalizedQuery);
    });
    return [...maps].sort((a, b) => {
      if (mapSortKey === "deaths") return (b.stats?.deaths ?? -1) - (a.stats?.deaths ?? -1);
      if (mapSortKey === "time") return (b.stats?.timePlayed ?? -1) - (a.stats?.timePlayed ?? -1);
      if (mapSortKey === "strawberries") return strawberrySortValue(b) - strawberrySortValue(a);
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
  }, [enabledMapDraft, enabledModDraft, mapEnabledFilter, mapProgressFilter, mapSortKey, query, visibleMapRecords]);

  const filteredMods = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const mods = scan.otherMods.filter((modItem) => {
      const draftEnabled = modItem.readOnly || enabledModDraft.has(modItem.id);
      if (modEnabledFilter === "enabled" && !draftEnabled) return false;
      if (modEnabledFilter === "disabled" && draftEnabled) return false;
      if (modProgressFilter === "warnings" && !modItem.warnings.length) return false;
      const isReferenced = referencedModIds.has(modItem.id);
      const isOptionalReferenced = optionalReferencedModIds.has(modItem.id);
      if (modReferenceFilter === "unreferenced" && isReferenced && !modItem.favorite) return false;
      if (modReferenceFilter === "unreferencedAndOptional" && (isReferenced || isOptionalReferenced) && !modItem.favorite) return false;
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
  }, [
    enabledModDraft,
    modEnabledFilter,
    modProgressFilter,
    modReferenceFilter,
    optionalReferencedModIds,
    query,
    referencedModIds,
    scan.otherMods
  ]);

  return {
    filteredMaps,
    filteredMods,
    helperMapMods,
    mapEnabledFilter,
    mapProgressFilter,
    mapSortKey,
    modEnabledFilter,
    modProgressFilter,
    modReferenceFilter,
    query,
    referencedModIds,
    setMapEnabledFilter,
    setMapProgressFilter,
    setMapSortKey,
    setModEnabledFilter,
    setModProgressFilter,
    setModReferenceFilter,
    setQuery,
    setShowHelperMaps,
    showHelperMaps,
    visibleMapRecords
  };
}

function strawberrySortValue(record: { stats: { strawberries: number; strawberriesKnown: boolean } | null }) {
  return record.stats?.strawberriesKnown ? record.stats.strawberries : -1;
}

function findReferencedModIds(scan: ScanResult) {
  const { optionalReferencesByModId, requiredReferencesByModId } = findDependencyReferencesByModId(
    [...scan.maps, ...scan.otherMods],
    scan.otherMods
  );
  return {
    optionalReferencedModIds: new Set(optionalReferencesByModId.keys()),
    referencedModIds: new Set(requiredReferencesByModId.keys())
  };
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
