import { useMemo, type Dispatch, type SetStateAction } from "react";
import { setRecordFavorite, setRecordProtected } from "../api";
import type { AppNotifier, ModRecord, ScanResult } from "../types";
import type { DependencyReference } from "../utils/dependencies";
import { isDraftEnabled } from "../utils/format";
import { notifyError } from "../utils/notify";
import type { ProfileDraftBatchUpdate } from "./useProfileDraft";
import type { ActiveView } from "../viewTypes";

type RecordActionsOptions = {
  activeView: ActiveView;
  celestePath: string;
  enabledExplicitModDraft: Set<string>;
  enabledMapDraft: Set<string>;
  enabledMapModDraft: Set<string>;
  enabledModDraft: Set<string>;
  dependencyModDraft: Set<string>;
  filteredMaps: ModRecord[];
  filteredMods: ModRecord[];
  notifier: AppNotifier;
  requiredReferencesByModId: Map<string, DependencyReference[]>;
  scan: ScanResult;
  setLoading: (loading: boolean) => void;
  setScan: Dispatch<SetStateAction<ScanResult>>;
  toggleMap: (id: string) => void;
  toggleMapMod: (id: string) => void;
  toggleMod: (id: string) => void;
  updateProfileDraft: (update: ProfileDraftBatchUpdate) => void;
};

export function useRecordActions({
  activeView,
  celestePath,
  dependencyModDraft,
  enabledExplicitModDraft,
  enabledMapDraft,
  enabledMapModDraft,
  enabledModDraft,
  filteredMaps,
  filteredMods,
  notifier,
  requiredReferencesByModId,
  scan,
  setLoading,
  setScan,
  toggleMap,
  toggleMapMod,
  toggleMod,
  updateProfileDraft
}: RecordActionsOptions) {
  const dependentNamesByModId = useMemo(
    () => findDependentNamesByModId(scan, enabledMapDraft, enabledModDraft, requiredReferencesByModId),
    [enabledMapDraft, enabledModDraft, requiredReferencesByModId, scan]
  );
  const recordsById = useMemo(
    () => new Map([...scan.maps, ...scan.otherMods].map((record) => [record.id, record])),
    [scan.maps, scan.otherMods]
  );

  function toggleMapLikeRecord(record: ModRecord) {
    if (!canToggleProfileRecord(record)) return;
    if (record.kind === "mod") toggleMapMod(record.id);
    else toggleMap(record.id);
  }

  function toggleModRecord(record: ModRecord) {
    if (!canToggleProfileRecord(record)) return;
    const enabled = isDraftEnabled(record, enabledMapDraft, enabledModDraft);
    if (!enabled) {
      toggleMod(record.id);
      return;
    }
    if (enabledExplicitModDraft.has(record.id)) {
      updateProfileDraft({
        enabledExplicitModDraft: (current) => new Set([...current].filter((id) => id !== record.id)),
        enabledMapModDraft: (current) => new Set([...current].filter((id) => id !== record.id))
      });
    } else if (enabledMapModDraft.has(record.id)) {
      updateProfileDraft({
        enabledMapModDraft: (current) => new Set([...current].filter((id) => id !== record.id))
      });
    }
  }

  function enableAllInCurrentView() {
    if (activeView === "maps") {
      enableVisibleMaps();
    } else if (activeView === "mods") {
      const modIds = editableProfileRecordIds(filteredMods);
      updateProfileDraft({ enabledExplicitModDraft: (current) => new Set([...current, ...modIds]) });
    }
  }

  function disableAllInCurrentView() {
    if (activeView === "maps") {
      disableVisibleMaps();
    } else if (activeView === "mods") {
      const disabledRecordIds = new Set(filteredMods.filter((modItem) => !modItem.readOnly).map((modItem) => modItem.id));
      const blockedMods = blockedVisibleMods(filteredMods, disabledRecordIds);
      const blockedModIds = new Set(blockedMods.map((modItem) => modItem.id));
      const modIds = new Set(
        filteredMods.filter((modItem) => !modItem.readOnly && !blockedModIds.has(modItem.id)).map((modItem) => modItem.id)
      );
      updateProfileDraft({
        enabledExplicitModDraft: (current) => new Set([...current].filter((id) => !modIds.has(id))),
        enabledMapModDraft: (current) => new Set([...current].filter((id) => !modIds.has(id)))
      });
      showBlockedDisableWarning(blockedMods, disabledRecordIds);
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
    return Boolean(record && isDraftEnabled(record, enabledMapDraft, enabledModDraft));
  }

  function enableVisibleMaps() {
    const mapIds = editableProfileRecordIds(filteredMaps.filter((record) => record.kind === "map"));
    const modIds = editableProfileRecordIds(filteredMaps.filter((record) => record.kind === "mod"));
    updateProfileDraft({
      enabledMapDraft: (current) => new Set([...current, ...mapIds]),
      enabledMapModDraft: (current) => new Set([...current, ...modIds])
    });
  }

  function disableVisibleMaps() {
    const mapIds = new Set(filteredMaps.filter((record) => record.kind === "map" && !record.readOnly).map((record) => record.id));
    const visibleMods = filteredMaps.filter((record) => record.kind === "mod");
    const visibleModIds = new Set(visibleMods.filter((record) => !record.readOnly).map((record) => record.id));
    const disabledRecordIds = new Set([...mapIds, ...visibleModIds]);
    const blockedMods = blockedVisibleMods(visibleMods, disabledRecordIds);
    const blockedModIds = new Set(blockedMods.map((modItem) => modItem.id));
    const modIds = new Set(visibleMods.filter((record) => !record.readOnly && !blockedModIds.has(record.id)).map((record) => record.id));
    updateProfileDraft({
      enabledMapDraft: (current) => new Set([...current].filter((id) => !mapIds.has(id))),
      enabledMapModDraft: (current) => new Set([...current].filter((id) => !modIds.has(id)))
    });
    showBlockedDisableWarning(blockedMods, disabledRecordIds);
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

  function blockedVisibleMods(records: ModRecord[], disabledRecordIds: Set<string>) {
    return findBlockedProfileDisableRecords(records, {
      disabledRecordIds,
      enabledMapDraft,
      enabledModDraft,
      ignoreProtectedDependents: true,
      recordsById,
      requiredReferencesByModId
    });
  }

  function showBlockedDisableWarning(records: ModRecord[], disabledRecordIds: Set<string>) {
    if (!records.length) return;
    const reasons = records.slice(0, 4).map((record) => {
      if (record.readOnly) return `${record.name} 是内置项目`;
      return `${record.name} 被 ${batchDependentSummary(record, disabledRecordIds)} 依赖`;
    });
    const suffix = records.length > 4 ? `，另有 ${records.length - 4} 个 Mod` : "";
    notifier.showWarning(`部分 Mod 未禁用：${reasons.join("；")}${suffix}。`);
  }

  function batchDependentSummary(record: ModRecord, disabledRecordIds: Set<string>) {
    const references = enabledDependentReferencesForProfileDisable(record.id, {
      disabledRecordIds,
      enabledMapDraft,
      enabledModDraft,
      ignoreProtectedDependents: true,
      recordsById,
      requiredReferencesByModId
    });
    if (!references.length) return "未知项目";
    const names = references.map((reference) => reference.name);
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

type ProfileDisableGuardContext = {
  disabledRecordIds: Set<string>;
  enabledMapDraft: Set<string>;
  enabledModDraft: Set<string>;
  ignoreProtectedDependents: boolean;
  recordsById: Map<string, ModRecord>;
  requiredReferencesByModId: Map<string, DependencyReference[]>;
};

export function findBlockedProfileDisableRecords(records: ModRecord[], context: ProfileDisableGuardContext) {
  return records.filter((record) => {
    if (record.readOnly) return true;
    if (record.kind !== "mod" || !isDraftEnabled(record, context.enabledMapDraft, context.enabledModDraft)) return false;
    return enabledDependentReferencesForProfileDisable(record.id, context).length > 0;
  });
}

export function enabledDependentReferencesForProfileDisable(modId: string, context: ProfileDisableGuardContext) {
  return (context.requiredReferencesByModId.get(modId) ?? []).filter((reference) => {
    if (context.disabledRecordIds.has(reference.id)) return false;
    const record = context.recordsById.get(reference.id);
    if (!record) return true;
    if (context.ignoreProtectedDependents && record.protected) return false;
    return record.protected || isDraftEnabled(record, context.enabledMapDraft, context.enabledModDraft);
  });
}

export function editableProfileRecordIds(records: ModRecord[]) {
  return records.filter((record) => !record.readOnly).map((record) => record.id);
}
