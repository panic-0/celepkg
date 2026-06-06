import { useMemo, type Dispatch, type SetStateAction } from "react";
import { setRecordFavorite, setRecordProtected } from "../api";
import type { AppNotifier, ModRecord, ScanResult } from "../types";
import type { DependencyReference } from "../utils/dependencies";
import { isDraftEnabled } from "../utils/format";
import { notifyError } from "../utils/notify";
import type { ActiveView } from "../viewTypes";

type RecordActionsOptions = {
  activeView: ActiveView;
  celestePath: string;
  enabledMapDraft: Set<string>;
  enabledModDraft: Set<string>;
  dependencyModDraft: Set<string>;
  filteredMaps: ModRecord[];
  filteredMods: ModRecord[];
  notifier: AppNotifier;
  requiredReferencesByModId: Map<string, DependencyReference[]>;
  scan: ScanResult;
  setEnabledExplicitModDraft: Dispatch<SetStateAction<Set<string>>>;
  setEnabledMapDraft: Dispatch<SetStateAction<Set<string>>>;
  setEnabledMapModDraft: Dispatch<SetStateAction<Set<string>>>;
  setLoading: (loading: boolean) => void;
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
  notifier,
  requiredReferencesByModId,
  scan,
  setEnabledExplicitModDraft,
  setEnabledMapDraft,
  setEnabledMapModDraft,
  setLoading,
  setScan,
  toggleMap,
  toggleMapMod,
  toggleMod
}: RecordActionsOptions) {
  const dependentNamesByModId = useMemo(
    () => findDependentNamesByModId(scan, enabledMapDraft, enabledModDraft, requiredReferencesByModId),
    [enabledMapDraft, enabledModDraft, requiredReferencesByModId, scan]
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
      const modIds = filteredMods.map((modItem) => modItem.id);
      setEnabledExplicitModDraft((current) => new Set([...current, ...modIds]));
    }
  }

  function disableAllInCurrentView() {
    if (activeView === "maps") {
      disableVisibleMaps();
    } else if (activeView === "mods") {
      const blockedMods = blockedVisibleMods(filteredMods);
      const blockedModIds = new Set(blockedMods.map((modItem) => modItem.id));
      const modIds = new Set(
        filteredMods.filter((modItem) => !modItem.readOnly && !blockedModIds.has(modItem.id)).map((modItem) => modItem.id)
      );
      setEnabledExplicitModDraft((current) => new Set([...current].filter((id) => !modIds.has(id))));
      showBlockedDisableWarning(blockedMods);
    }
  }

  async function updateRecordFavorite(record: ModRecord) {
    const favorite = !record.favorite;
    setLoading(true);
    notifier.clearNotice();
    setRecordFavoriteInScan(record.id, favorite);
    try {
      const result = await setRecordFavorite(celestePath, record.id, favorite);
      setScan(result);
      notifier.showSuccess(favorite ? "已加入收藏。" : "已取消收藏。");
    } catch (error) {
      setRecordFavoriteInScan(record.id, record.favorite);
      notifyError(notifier, error);
    } finally {
      setLoading(false);
    }
  }

  async function updateRecordProtected(record: ModRecord) {
    setLoading(true);
    notifier.clearNotice();
    try {
      const result = await setRecordProtected(celestePath, record.id, !record.protected);
      setScan(result);
      notifier.showSuccess(record.protected ? "已取消始终启用。" : "已设为始终启用，应用 Profile 时不会写入 blacklist。");
    } catch (error) {
      notifyError(notifier, error);
    } finally {
      setLoading(false);
    }
  }

  function isMapEnabled(record: ModRecord) {
    return isDraftEnabled(record, enabledMapDraft, enabledModDraft);
  }

  function isModEnabled(id: string) {
    const record = scan.otherMods.find((modItem) => modItem.id === id);
    return Boolean(record?.readOnly) || enabledModDraft.has(id);
  }

  function enableVisibleMaps() {
    const mapIds = filteredMaps.filter((record) => record.kind === "map").map((record) => record.id);
    const modIds = filteredMaps.filter((record) => record.kind === "mod").map((record) => record.id);
    setEnabledMapDraft((current) => new Set([...current, ...mapIds]));
    setEnabledMapModDraft((current) => new Set([...current, ...modIds]));
  }

  function disableVisibleMaps() {
    const mapIds = new Set(filteredMaps.filter((record) => record.kind === "map" && !record.readOnly).map((record) => record.id));
    const visibleMods = filteredMaps.filter((record) => record.kind === "mod");
    const blockedMods = blockedVisibleMods(visibleMods);
    const blockedModIds = new Set(blockedMods.map((modItem) => modItem.id));
    const modIds = new Set(visibleMods.filter((record) => !record.readOnly && !blockedModIds.has(record.id)).map((record) => record.id));
    setEnabledMapDraft((current) => new Set([...current].filter((id) => !mapIds.has(id))));
    setEnabledMapModDraft((current) => new Set([...current].filter((id) => !modIds.has(id))));
    showBlockedDisableWarning(blockedMods);
  }

  function canToggleProfileRecord(record: ModRecord) {
    const enabled = isDraftEnabled(record, enabledMapDraft, enabledModDraft);
    if (record.readOnly) {
      notifier.showWarning(`${record.name} 是内置项目，不能通过 Profile 启用或禁用。`);
      return false;
    }
    if (record.kind === "mod" && enabled && dependencyModDraft.has(record.id)) {
      notifier.showWarning(`${record.name} 被以下已启用项目依赖，不能直接禁用：${dependentSummary(record)}。`);
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

  function blockedVisibleMods(records: ModRecord[]) {
    return records.filter((record) => record.readOnly || (enabledModDraft.has(record.id) && dependencyModDraft.has(record.id)));
  }

  function showBlockedDisableWarning(records: ModRecord[]) {
    if (!records.length) return;
    const reasons = records.slice(0, 4).map((record) => {
      if (record.readOnly) return `${record.name} 是内置项目`;
      return `${record.name} 被 ${dependentSummary(record)} 依赖`;
    });
    const suffix = records.length > 4 ? `，另有 ${records.length - 4} 个 Mod` : "";
    notifier.showWarning(`部分 Mod 未禁用：${reasons.join("；")}${suffix}。`);
  }

  function setRecordFavoriteInScan(recordId: string, favorite: boolean) {
    setScan((current) => ({
      ...current,
      maps: current.maps.map((map) => (map.id === recordId ? { ...map, favorite } : map)),
      otherMods: current.otherMods.map((modItem) => (modItem.id === recordId ? { ...modItem, favorite } : modItem))
    }));
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

function findDependentNamesByModId(
  scan: ScanResult,
  enabledMapDraft: Set<string>,
  enabledModDraft: Set<string>,
  requiredReferencesByModId: Map<string, DependencyReference[]>
) {
  const enabledReferenceIds = new Set([
    ...scan.maps.filter((map) => map.protected || enabledMapDraft.has(map.id)).map((map) => map.id),
    ...scan.otherMods.filter((modItem) => modItem.protected || enabledModDraft.has(modItem.id)).map((modItem) => modItem.id)
  ]);
  return new Map(
    [...requiredReferencesByModId]
      .map(
        ([modId, records]) => [modId, records.filter((record) => enabledReferenceIds.has(record.id)).map((record) => record.name)] as const
      )
      .filter(([, names]) => names.length > 0)
  );
}
