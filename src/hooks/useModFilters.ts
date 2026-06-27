import { useMemo, useState } from "react";
import type { ModRecord, ScanResult } from "../types";
import type { DependencyReference } from "../utils/dependencies";
import type { EnabledFilter, ProgressFilter, ReferenceFilter, SortKey } from "../viewTypes";
import { isDraftEnabled } from "../utils/format";
import { createSearchMatcher, matchSearchFields, type SearchField, type SearchMatch } from "../utils/search";
import { compareUpdateStatusRecords } from "../utils/updateStatusGrouping";

type ModFiltersOptions = {
  availableUpdateRecordOrder: Map<string, number>;
  enabledMapDraft: Set<string>;
  enabledModDraft: Set<string>;
  downloadableUpdateRecordOrder: Map<string, number>;
  latestUpdateRecordOrder: Map<string, number>;
  optionalReferencesByModId: Map<string, DependencyReference[]>;
  optionalReferencedModIds: Set<string>;
  requiredReferencesByModId: Map<string, DependencyReference[]>;
  referencedModIds: Set<string>;
  scan: ScanResult;
};

export function useModFilters({
  availableUpdateRecordOrder,
  enabledMapDraft,
  enabledModDraft,
  downloadableUpdateRecordOrder,
  latestUpdateRecordOrder,
  optionalReferencesByModId,
  optionalReferencedModIds,
  requiredReferencesByModId,
  referencedModIds,
  scan
}: ModFiltersOptions) {
  const [query, setQuery] = useState("");
  const [groupByUpdateStatus, setGroupByUpdateStatus] = useState(false);
  const [pinFavorites, setPinFavorites] = useState(true);
  const [pinProtected, setPinProtected] = useState(false);
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
  const searchMatcher = useMemo(() => createSearchMatcher(query), [query]);

  const filteredMaps = useMemo(() => {
    const maps = visibleMapRecords
      .map((map) => ({ match: matchSearchFields(searchFieldsForMap(map), searchMatcher), record: map }))
      .filter(({ match, record: map }) => {
        const draftEnabled = isDraftEnabled(map, enabledMapDraft, enabledModDraft);
        if (mapEnabledFilter === "enabled" && !draftEnabled) return false;
        if (mapEnabledFilter === "disabled" && draftEnabled) return false;
        if (mapProgressFilter === "completed" && map.completionStatus !== "completed") return false;
        if (mapProgressFilter === "unfinished" && map.completionStatus !== "unfinished") return false;
        if (mapProgressFilter === "withStats" && !map.stats) return false;
        if (mapProgressFilter === "warnings" && !map.warnings.length) return false;
        if (mapProgressFilter === "updates" && !downloadableUpdateRecordOrder.has(map.id)) return false;
        return match.matched;
      });
    return [...maps]
      .sort((a, b) => {
        if (groupByUpdateStatus) {
          const updateStatusSort = compareUpdateStatusRecords(a.record, b.record, {
            availableUpdateRecordOrder,
            latestUpdateRecordOrder
          });
          if (updateStatusSort !== 0) return updateStatusSort;
        }
        const pinnedSort = comparePinnedRecordPriority(a.record, b.record, {
          pinFavorites,
          pinProtected
        });
        if (pinnedSort !== 0) return pinnedSort;
        if (searchMatcher.active && a.match.score !== b.match.score) return b.match.score - a.match.score;
        if (mapProgressFilter === "updates") {
          return (downloadableUpdateRecordOrder.get(a.record.id) ?? 0) - (downloadableUpdateRecordOrder.get(b.record.id) ?? 0);
        }
        return compareMaps(a.record, b.record, mapSortKey);
      })
      .map((item) => item.record);
  }, [
    availableUpdateRecordOrder,
    downloadableUpdateRecordOrder,
    enabledMapDraft,
    enabledModDraft,
    latestUpdateRecordOrder,
    groupByUpdateStatus,
    mapEnabledFilter,
    mapProgressFilter,
    mapSortKey,
    pinFavorites,
    pinProtected,
    searchMatcher,
    visibleMapRecords
  ]);

  const filteredMods = useMemo(() => {
    const mods = scan.otherMods
      .map((modItem) => ({
        match: matchSearchFields(
          searchFieldsForMod(modItem, requiredReferencesByModId.get(modItem.id) ?? [], optionalReferencesByModId.get(modItem.id) ?? []),
          searchMatcher
        ),
        record: modItem
      }))
      .filter(({ match, record: modItem }) => {
        const draftEnabled = isDraftEnabled(modItem, enabledMapDraft, enabledModDraft);
        if (modEnabledFilter === "enabled" && !draftEnabled) return false;
        if (modEnabledFilter === "disabled" && draftEnabled) return false;
        if (modProgressFilter === "warnings" && !modItem.warnings.length) return false;
        if (modProgressFilter === "updates" && !downloadableUpdateRecordOrder.has(modItem.id)) return false;
        const isReferenced = referencedModIds.has(modItem.id);
        const isOptionalReferenced = optionalReferencedModIds.has(modItem.id);
        if (modReferenceFilter === "unreferenced" && isReferenced && !modItem.favorite) return false;
        if (modReferenceFilter === "unreferencedAndOptional" && (isReferenced || isOptionalReferenced) && !modItem.favorite) return false;
        return match.matched;
      });
    return [...mods]
      .sort((a, b) => {
        if (groupByUpdateStatus) {
          const updateStatusSort = compareUpdateStatusRecords(a.record, b.record, {
            availableUpdateRecordOrder,
            latestUpdateRecordOrder
          });
          if (updateStatusSort !== 0) return updateStatusSort;
        }
        const pinnedSort = comparePinnedRecordPriority(a.record, b.record, {
          pinFavorites,
          pinProtected
        });
        if (pinnedSort !== 0) return pinnedSort;
        if (searchMatcher.active && a.match.score !== b.match.score) return b.match.score - a.match.score;
        if (modProgressFilter === "updates") {
          return (downloadableUpdateRecordOrder.get(a.record.id) ?? 0) - (downloadableUpdateRecordOrder.get(b.record.id) ?? 0);
        }
        return a.record.name.localeCompare(b.record.name, "zh-Hans-CN");
      })
      .map((item) => item.record);
  }, [
    availableUpdateRecordOrder,
    enabledMapDraft,
    enabledModDraft,
    downloadableUpdateRecordOrder,
    groupByUpdateStatus,
    latestUpdateRecordOrder,
    modEnabledFilter,
    modProgressFilter,
    modReferenceFilter,
    optionalReferencesByModId,
    optionalReferencedModIds,
    pinFavorites,
    pinProtected,
    referencedModIds,
    requiredReferencesByModId,
    searchMatcher,
    scan.otherMods
  ]);

  const recordSearchMatches = useMemo(() => {
    const matches = new Map<string, SearchMatch>();
    for (const map of visibleMapRecords) {
      matches.set(map.id, matchSearchFields(searchFieldsForMap(map), searchMatcher));
    }
    for (const modItem of scan.otherMods) {
      matches.set(
        modItem.id,
        matchSearchFields(
          searchFieldsForMod(modItem, requiredReferencesByModId.get(modItem.id) ?? [], optionalReferencesByModId.get(modItem.id) ?? []),
          searchMatcher
        )
      );
    }
    return matches;
  }, [optionalReferencesByModId, requiredReferencesByModId, scan.otherMods, searchMatcher, visibleMapRecords]);

  return {
    filteredMaps,
    filteredMods,
    groupByUpdateStatus,
    helperMapMods,
    mapEnabledFilter,
    mapProgressFilter,
    mapSortKey,
    modEnabledFilter,
    modProgressFilter,
    modReferenceFilter,
    pinFavorites,
    pinProtected,
    query,
    recordSearchMatches,
    referencedModIds,
    setGroupByUpdateStatus,
    setMapEnabledFilter,
    setMapProgressFilter,
    setMapSortKey,
    setModEnabledFilter,
    setModProgressFilter,
    setModReferenceFilter,
    setPinFavorites,
    setPinProtected,
    setQuery,
    setShowHelperMaps,
    showHelperMaps,
    visibleMapRecords
  };
}

export function comparePinnedRecordPriority(
  left: ModRecord,
  right: ModRecord,
  { pinFavorites, pinProtected }: { pinFavorites: boolean; pinProtected: boolean }
) {
  const leftRank = pinnedRecordRank(left, pinFavorites, pinProtected);
  const rightRank = pinnedRecordRank(right, pinFavorites, pinProtected);
  return leftRank - rightRank;
}

function pinnedRecordRank(record: ModRecord, pinFavorites: boolean, pinProtected: boolean) {
  if (pinFavorites && record.favorite) return 0;
  if (pinProtected && record.protected) return pinFavorites ? 1 : 0;
  return (pinFavorites ? 1 : 0) + (pinProtected ? 1 : 0);
}

function strawberrySortValue(record: { stats: { strawberries: number; strawberriesKnown: boolean } | null }) {
  return record.stats?.strawberriesKnown ? record.stats.strawberries : -1;
}

function compareMaps(left: ModRecord, right: ModRecord, sortKey: SortKey) {
  if (sortKey === "deaths") return (right.stats?.deaths ?? -1) - (left.stats?.deaths ?? -1);
  if (sortKey === "time") return (right.stats?.timePlayed ?? -1) - (left.stats?.timePlayed ?? -1);
  if (sortKey === "strawberries") return strawberrySortValue(right) - strawberrySortValue(left);
  return left.name.localeCompare(right.name, "zh-Hans-CN");
}

function searchFieldsForMap(map: ModRecord): SearchField[] {
  return [
    { key: "name", text: map.name, weight: 12 },
    { key: "metadataName", text: map.metadata.name, weight: 10 },
    { key: "version", text: map.metadata.version, weight: 4 },
    { key: "fileName", text: map.fileName, weight: 8 },
    { key: "relativePath", text: map.relativePath, weight: 8 },
    { key: "author", text: map.metadata.author, weight: 5 },
    { key: "description", text: map.metadata.description, weight: 2 },
    ...map.mapIds.map((sid) => ({ key: "sid", text: sid, weight: 8 })),
    ...map.subMaps.flatMap((subMap) => [
      { key: "subMapName", text: subMap.displayName, weight: 7 },
      { key: "subMapSid", text: subMap.sid, weight: 7 },
      { key: "subMapChapter", text: subMap.chapter, weight: 5 },
      { key: "subMapPath", text: subMap.filePath, weight: 5 },
      { key: "subMapDifficulty", text: subMap.difficulty, weight: 4 }
    ]),
    ...map.dependencies.map((dependency) => ({ key: "dependency", text: dependency.name, weight: 6 })),
    ...map.optionalDependencies.map((dependency) => ({ key: "optionalDependency", text: dependency.name, weight: 4 })),
    ...map.warnings.map((warning) => ({ key: "warning", text: warning, weight: 2 }))
  ];
}

function searchFieldsForMod(
  modItem: ModRecord,
  requiredReferences: DependencyReference[],
  optionalReferences: DependencyReference[]
): SearchField[] {
  return [
    { key: "name", text: modItem.name, weight: 12 },
    { key: "metadataName", text: modItem.metadata.name, weight: 10 },
    { key: "version", text: modItem.metadata.version, weight: 4 },
    { key: "fileName", text: modItem.fileName, weight: 8 },
    { key: "relativePath", text: modItem.relativePath, weight: 8 },
    { key: "author", text: modItem.metadata.author, weight: 5 },
    { key: "description", text: modItem.metadata.description, weight: 2 },
    ...modItem.dependencies.map((dependency) => ({ key: "dependency", text: dependency.name, weight: 6 })),
    ...modItem.optionalDependencies.map((dependency) => ({ key: "optionalDependency", text: dependency.name, weight: 4 })),
    ...requiredReferences.map((reference) => ({ key: "reference", text: reference.name, weight: 4 })),
    ...optionalReferences.map((reference) => ({ key: "optionalReference", text: reference.name, weight: 3 })),
    ...modItem.warnings.map((warning) => ({ key: "warning", text: warning, weight: 2 }))
  ];
}
