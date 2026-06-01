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

  const helperMapMods = useMemo(() => scan.otherMods.filter((modItem) => modItem.subMaps.length > 0), [scan.otherMods]);
  const visibleMapRecords = useMemo(
    () => (showHelperMaps ? [...scan.maps, ...helperMapMods] : scan.maps),
    [helperMapMods, scan.maps, showHelperMaps]
  );

  const filteredMaps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const maps = visibleMapRecords.filter((map) => {
      const draftEnabled = isDraftEnabled(map, enabledMapDraft, enabledModDraft);
      if (enabledFilter === "enabled" && !draftEnabled) return false;
      if (enabledFilter === "disabled" && draftEnabled) return false;
      if (progressFilter === "completed" && !map.stats?.completed) return false;
      if (progressFilter === "unfinished" && map.stats?.completed) return false;
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
  }, [enabledFilter, enabledModDraft, progressFilter, query, scan.otherMods]);

  return {
    enabledFilter,
    filteredMaps,
    filteredMods,
    helperMapMods,
    progressFilter,
    query,
    setEnabledFilter,
    setProgressFilter,
    setQuery,
    setShowHelperMaps,
    setSortKey,
    showHelperMaps,
    sortKey,
    visibleMapRecords
  };
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
