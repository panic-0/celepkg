import { useMemo, type Dispatch, type SetStateAction } from "react";
import { setRecordFavorite, setRecordProtected } from "../api";
import type { ModRecord, ScanResult } from "../types";
import { normalizeDependencyName } from "../utils/dependencies";
import { isDraftEnabled, readError } from "../utils/format";
import type { ActiveView } from "../viewTypes";

type RecordActionsOptions = {
  activeView: ActiveView;
  celestePath: string;
  enabledMapDraft: Set<string>;
  enabledModDraft: Set<string>;
  dependencyModDraft: Set<string>;
  filteredMaps: ModRecord[];
  filteredMods: ModRecord[];
  scan: ScanResult;
  setEnabledExplicitModDraft: Dispatch<SetStateAction<Set<string>>>;
  setEnabledMapDraft: Dispatch<SetStateAction<Set<string>>>;
  setEnabledMapModDraft: Dispatch<SetStateAction<Set<string>>>;
  setLoading: (loading: boolean) => void;
  setMessage: (message: string) => void;
  setScan: Dispatch<SetStateAction<ScanResult>>;
  toggleMap: (id: string) => void;
  toggleMapMod: (id: string) => void;
  toggleMod: (id: string) => void;
};

export function useRecordActions({
  activeView,
  celestePath,
  dependencyModDraft,
  enabledMapDraft,
  enabledModDraft,
  filteredMaps,
  filteredMods,
  scan,
  setEnabledExplicitModDraft,
  setEnabledMapDraft,
  setEnabledMapModDraft,
  setLoading,
  setMessage,
  setScan,
  toggleMap,
  toggleMapMod,
  toggleMod
}: RecordActionsOptions) {
  const protectedVisibleMaps = filteredMaps.filter((record) => record.protected);
  const protectedVisibleMods = filteredMods.filter((record) => record.protected);
  const dependentNamesByModId = useMemo(
    () => findDependentNamesByModId(scan, enabledMapDraft, enabledModDraft),
    [enabledMapDraft, enabledModDraft, scan]
  );

  function toggleMapLikeRecord(record: ModRecord) {
    if (!canToggleProfileRecord(record)) return;
    if (record.kind === "mod") toggleMapMod(record.id);
    else toggleMap(record.id);
  }

  function toggleModRecord(record: ModRecord) {
    if (!canToggleProfileRecord(record)) return;
    toggleMod(record.id);
  }

  function enableAllInCurrentView() {
    if (activeView === "maps") {
      enableVisibleMaps();
    } else if (activeView === "mods") {
      const skipped = protectedVisibleMods.length;
      const modIds = filteredMods.filter((modItem) => !modItem.protected).map((modItem) => modItem.id);
      setEnabledExplicitModDraft((current) => new Set([...current, ...modIds]));
      showProtectedSkip(skipped);
    }
  }

  function disableAllInCurrentView() {
    if (activeView === "maps") {
      disableVisibleMaps();
    } else if (activeView === "mods") {
      const skipped = protectedVisibleMods.length;
      const modIds = new Set(filteredMods.filter((modItem) => !modItem.protected).map((modItem) => modItem.id));
      setEnabledExplicitModDraft((current) => new Set([...current].filter((id) => !modIds.has(id))));
      showProtectedSkip(skipped);
    }
  }

  async function updateRecordFavorite(record: ModRecord) {
    const favorite = !record.favorite;
    setLoading(true);
    setMessage("");
    setRecordFavoriteInScan(record.id, favorite);
    try {
      const result = await setRecordFavorite(celestePath, record.id, favorite);
      setScan(result);
      setMessage(favorite ? "已加入收藏。" : "已取消收藏。");
    } catch (error) {
      setRecordFavoriteInScan(record.id, record.favorite);
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function updateRecordProtected(record: ModRecord) {
    setLoading(true);
    setMessage("");
    try {
      const result = await setRecordProtected(celestePath, record.id, !record.protected);
      setScan(result);
      setMessage(record.protected ? "已取消保护。" : "已设为保护。");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  function isMapEnabled(record: ModRecord) {
    return isDraftEnabled(record, enabledMapDraft, enabledModDraft);
  }

  function isModEnabled(id: string) {
    return enabledModDraft.has(id);
  }

  function enableVisibleMaps() {
    const skipped = protectedVisibleMaps.length;
    const mapIds = filteredMaps.filter((record) => record.kind === "map" && !record.protected).map((record) => record.id);
    const modIds = filteredMaps.filter((record) => record.kind === "mod" && !record.protected).map((record) => record.id);
    setEnabledMapDraft((current) => new Set([...current, ...mapIds]));
    setEnabledMapModDraft((current) => new Set([...current, ...modIds]));
    showProtectedSkip(skipped);
  }

  function disableVisibleMaps() {
    const skipped = protectedVisibleMaps.length;
    const mapIds = new Set(filteredMaps.filter((record) => record.kind === "map" && !record.protected).map((record) => record.id));
    const modIds = new Set(filteredMaps.filter((record) => record.kind === "mod" && !record.protected).map((record) => record.id));
    setEnabledMapDraft((current) => new Set([...current].filter((id) => !mapIds.has(id))));
    setEnabledMapModDraft((current) => new Set([...current].filter((id) => !modIds.has(id))));
    showProtectedSkip(skipped);
  }

  function canToggleProfileRecord(record: ModRecord) {
    const enabled = isDraftEnabled(record, enabledMapDraft, enabledModDraft);
    if (record.protected) {
      setMessage(`${record.name} 已设为 Protected，不能通过 Profile 启用或禁用。`);
      return false;
    }
    if (record.kind === "mod" && enabled && dependencyModDraft.has(record.id)) {
      setMessage(`${record.name} 被以下已启用项目依赖，不能直接禁用：${dependentSummary(record)}。`);
      return false;
    }
    return true;
  }

  function dependentSummary(record: ModRecord) {
    const names = dependentNamesByModId.get(record.id) ?? [];
    if (!names.length) return "未知项目";
    const visible = names.slice(0, 6).join("、");
    return names.length > 6 ? `${visible} 等 ${names.length} 个项目` : visible;
  }

  function setRecordFavoriteInScan(recordId: string, favorite: boolean) {
    setScan((current) => ({
      ...current,
      maps: current.maps.map((map) => (map.id === recordId ? { ...map, favorite } : map)),
      otherMods: current.otherMods.map((modItem) => (modItem.id === recordId ? { ...modItem, favorite } : modItem))
    }));
  }

  function showProtectedSkip(skipped: number) {
    if (skipped > 0) setMessage(`已跳过 ${skipped} 个受保护项目。`);
  }

  return {
    disableAllInCurrentView,
    enableAllInCurrentView,
    isMapEnabled,
    isModEnabled,
    toggleMapLikeRecord,
    toggleModRecord,
    updateRecordFavorite,
    updateRecordProtected
  };
}

function findDependentNamesByModId(scan: ScanResult, enabledMapDraft: Set<string>, enabledModDraft: Set<string>) {
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

  const dependentNames = new Map<string, Set<string>>();
  const enabledItems = [
    ...scan.maps.filter((map) => enabledMapDraft.has(map.id)),
    ...scan.otherMods.filter((modItem) => enabledModDraft.has(modItem.id))
  ];
  for (const item of enabledItems) {
    for (const dependency of item.dependencies) {
      const modId = aliasToModId.get(normalizeDependencyName(dependency.name));
      if (!modId || modId === item.id) continue;
      const names = dependentNames.get(modId) ?? new Set<string>();
      names.add(item.name);
      dependentNames.set(modId, names);
    }
  }

  return new Map([...dependentNames].map(([modId, names]) => [modId, [...names].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))]));
}
