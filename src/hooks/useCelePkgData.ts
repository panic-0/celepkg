import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getConfig,
  rescanCeleste,
  scanCeleste,
  setAutoBackupCleanupEnabled,
  setAutoCheckModUpdatesOnStartup,
  selectCelesteDirectory,
  setAutoBackupEnabled,
  setAutoBackupRetentionCount,
  setCelestePath,
  setModCatalogSources,
  setSelectedSaveFiles
} from "../api";
import type { AppNotice, AppNoticeTone, AppNotifier, ModCatalogSourceKind, ScanResult } from "../types";
import { readError } from "../utils/format";

const emptyScan: ScanResult = {
  celestePath: "",
  modsPath: "",
  blacklistPath: "",
  blacklistEntries: [],
  gameExecutable: "",
  maps: [],
  otherMods: [],
  profiles: { activeMapProfileId: "default-maps", activeModProfileId: "default-mods", profiles: [] },
  availableSaveFiles: [],
  selectedSaveFiles: ["0.celeste"],
  warnings: [],
  timings: []
};

export function useCelePkgData() {
  const [celestePath, setPathInput] = useState("");
  const [scan, setScan] = useState<ScanResult>(emptyScan);
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(true);
  const [autoBackupCleanupEnabled, setAutoBackupCleanupEnabledState] = useState(true);
  const [autoBackupRetentionCount, setAutoBackupRetentionCountState] = useState(20);
  const [modCatalogSourceOrder, setModCatalogSourceOrderState] = useState<ModCatalogSourceKind[]>(["wegfan", "everestMirror", "everest"]);
  const [modCatalogSourceEnabledCount, setModCatalogSourceEnabledCountState] = useState(2);
  const modCatalogSources = useMemo(
    () => activeModCatalogSources(modCatalogSourceOrder, modCatalogSourceEnabledCount),
    [modCatalogSourceEnabledCount, modCatalogSourceOrder]
  );
  const [autoCheckModUpdatesOnStartup, setAutoCheckModUpdatesOnStartupState] = useState(false);
  const [startupAutoCheckModUpdatesOnStartup, setStartupAutoCheckModUpdatesOnStartup] = useState(false);
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);
  const [loading, setLoadingState] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const noticeIdRef = useRef(0);
  const selectedSaveRequestRef = useRef(0);

  const showNotice = useCallback((tone: AppNoticeTone, text: string) => {
    noticeIdRef.current += 1;
    setNotice({ id: noticeIdRef.current, tone, text });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const notifier: AppNotifier = useMemo(
    () => ({
      clearNotice,
      showError: (text) => showNotice("error", text),
      showInfo: (text) => showNotice("info", text),
      showSuccess: (text) => showNotice("success", text),
      showWarning: (text) => showNotice("warning", text)
    }),
    [clearNotice, showNotice]
  );

  const setLoading = useCallback((nextLoading: boolean, message?: string) => {
    setLoadingState(nextLoading);
    if (message) setLoadingMessage(message);
    if (!nextLoading) setLoadingMessage("");
  }, []);

  const refreshPath = useCallback(
    async (nextPath: string) => {
      setLoading(true);
      setLoadingMessage("正在读取扫描缓存并扫描地图...");
      clearNotice();
      try {
        const result = await scanCeleste(nextPath);
        setScan(result);
        setPathInput(result.celestePath);
        return result;
      } catch (error) {
        showNotice("error", readError(error));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const rescanPath = useCallback(
    async (nextPath: string) => {
      setLoading(true);
      setLoadingMessage("正在刷新缓存并重新扫描地图...");
      clearNotice();
      try {
        const result = await rescanCeleste(nextPath);
        setScan(result);
        setPathInput(result.celestePath);
        showNotice("success", "已刷新缓存并重新扫描地图。");
        return result;
      } catch (error) {
        showNotice("error", readError(error));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const refresh = useCallback((nextPath = celestePath) => refreshPath(nextPath), [celestePath, refreshPath]);

  const loadConfigAndRefresh = useCallback(async () => {
    const config = await getConfig();
    setConfigWarnings(config.warnings);
    setPathInput(config.celestePath);
    setAutoBackupEnabledState(config.autoBackupEnabled);
    setAutoBackupCleanupEnabledState(config.autoBackupCleanupEnabled);
    setAutoBackupRetentionCountState(config.autoBackupRetentionCount);
    setModCatalogSourceOrderState(config.modCatalogSourceOrder);
    setModCatalogSourceEnabledCountState(config.modCatalogSourceEnabledCount);
    setAutoCheckModUpdatesOnStartupState(config.autoCheckModUpdatesOnStartup);
    setStartupAutoCheckModUpdatesOnStartup(config.autoCheckModUpdatesOnStartup);
    setScan((current) => ({
      ...(config.celestePath.trim() && !config.warnings.length ? current : emptyScan),
      profiles: config.profiles,
      selectedSaveFiles: config.selectedSaveFiles
    }));
    if (!config.celestePath.trim() || config.warnings.length) {
      return undefined;
    }
    return refreshPath(config.celestePath);
  }, [refreshPath]);

  const updateAutoBackupEnabled = useCallback(
    async (enabled: boolean) => {
      setLoading(true);
      setLoadingMessage("正在更新备份设置...");
      clearNotice();
      try {
        const config = await setAutoBackupEnabled(enabled);
        setAutoBackupEnabledState(config.autoBackupEnabled);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        showNotice("success", config.autoBackupEnabled ? "已开启修改前自动备份。" : "已关闭修改前自动备份。");
      } catch (error) {
        showNotice("error", readError(error));
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const updateAutoBackupRetentionCount = useCallback(
    async (count: number) => {
      const normalizedCount = Math.max(1, Math.min(100, Math.trunc(count)));
      setLoading(true);
      setLoadingMessage("正在更新备份设置...");
      clearNotice();
      try {
        const config = await setAutoBackupRetentionCount(normalizedCount);
        setAutoBackupRetentionCountState(config.autoBackupRetentionCount);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        showNotice("success", `已设置为保留最近 ${config.autoBackupRetentionCount} 个自动备份。`);
      } catch (error) {
        showNotice("error", readError(error));
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const updateAutoBackupCleanupEnabled = useCallback(
    async (enabled: boolean) => {
      setLoading(true);
      setLoadingMessage("正在更新备份设置...");
      clearNotice();
      try {
        const config = await setAutoBackupCleanupEnabled(enabled);
        setAutoBackupCleanupEnabledState(config.autoBackupCleanupEnabled);
        setAutoBackupRetentionCountState(config.autoBackupRetentionCount);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        showNotice("success", config.autoBackupCleanupEnabled ? "已开启自动清理旧备份。" : "已关闭自动清理旧备份。");
      } catch (error) {
        showNotice("error", readError(error));
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const updateModCatalogSources = useCallback(
    async (sourceOrder: ModCatalogSourceKind[], enabledCount: number) => {
      setLoading(true);
      setLoadingMessage("正在更新 Mod 设置...");
      clearNotice();
      try {
        const config = await setModCatalogSources(sourceOrder, enabledCount);
        setModCatalogSourceOrderState(config.modCatalogSourceOrder);
        setModCatalogSourceEnabledCountState(config.modCatalogSourceEnabledCount);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        showNotice("success", "已更新 Mod 数据源。");
      } catch (error) {
        showNotice("error", readError(error));
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const updateAutoCheckModUpdatesOnStartup = useCallback(
    async (enabled: boolean) => {
      setLoading(true);
      setLoadingMessage("正在更新 Mod 设置...");
      clearNotice();
      try {
        const config = await setAutoCheckModUpdatesOnStartup(enabled);
        setAutoCheckModUpdatesOnStartupState(config.autoCheckModUpdatesOnStartup);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        showNotice("success", config.autoCheckModUpdatesOnStartup ? "已开启启动时自动检查 Mod 更新。" : "已关闭启动时自动检查 Mod 更新。");
      } catch (error) {
        showNotice("error", readError(error));
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const updateSelectedSaveFiles = useCallback(
    async (saveFiles: string[]) => {
      const requestId = selectedSaveRequestRef.current + 1;
      selectedSaveRequestRef.current = requestId;
      setScan((current) => ({ ...current, selectedSaveFiles: saveFiles }));
      setLoading(true);
      setLoadingMessage("正在更新存档统计...");
      clearNotice();
      try {
        const config = await setSelectedSaveFiles(saveFiles);
        if (selectedSaveRequestRef.current !== requestId) return;
        setScan((current) => ({ ...current, profiles: config.profiles, selectedSaveFiles: config.selectedSaveFiles }));
        const result = await scanCeleste(config.celestePath);
        if (selectedSaveRequestRef.current !== requestId) return;
        setScan(result);
        setPathInput(result.celestePath);
      } catch (error) {
        if (selectedSaveRequestRef.current === requestId) {
          showNotice("error", readError(error));
        }
      } finally {
        if (selectedSaveRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const savePathAndRefresh = useCallback(async () => {
    setLoading(true);
    setLoadingMessage("正在保存目录...");
    clearNotice();
    try {
      await setCelestePath(celestePath);
      setConfigWarnings([]);
      await refreshPath(celestePath);
    } catch (error) {
      showNotice("error", readError(error));
      setLoading(false);
    }
  }, [celestePath, clearNotice, refreshPath, setLoading, showNotice]);

  const savePathAndRescan = useCallback(async () => {
    setLoading(true);
    setLoadingMessage("正在保存目录...");
    clearNotice();
    try {
      await setCelestePath(celestePath);
      setConfigWarnings([]);
      await rescanPath(celestePath);
    } catch (error) {
      showNotice("error", readError(error));
      setLoading(false);
    }
  }, [celestePath, clearNotice, rescanPath, setLoading, showNotice]);

  const selectPathAndRefresh = useCallback(async () => {
    setLoading(true);
    setLoadingMessage("正在选择目录...");
    clearNotice();
    try {
      const selectedPath = await selectCelesteDirectory();
      if (!selectedPath) {
        setLoading(false);
        return undefined;
      }
      setPathInput(selectedPath);
      setLoadingMessage("正在保存目录...");
      const saved = await setCelestePath(selectedPath);
      setConfigWarnings([]);
      return await refreshPath(saved.celestePath);
    } catch (error) {
      showNotice("error", readError(error));
      setLoading(false);
      return undefined;
    }
  }, [clearNotice, refreshPath, setLoading, showNotice]);

  useEffect(() => {
    loadConfigAndRefresh().catch((error) => showNotice("error", readError(error)));
  }, [loadConfigAndRefresh, showNotice]);

  useEffect(() => {
    if (!notice || (notice.tone !== "success" && notice.tone !== "info")) return;
    const timer = window.setTimeout(() => {
      setNotice((current) => (current?.id === notice.id ? null : current));
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return {
    autoBackupCleanupEnabled,
    autoBackupEnabled,
    autoBackupRetentionCount,
    autoCheckModUpdatesOnStartup,
    celestePath,
    clearNotice,
    configWarnings,
    loading,
    loadingMessage,
    loadConfigAndRefresh,
    modCatalogSources,
    modCatalogSourceEnabledCount,
    modCatalogSourceOrder,
    notice,
    notifier,
    refresh,
    savePathAndRefresh,
    savePathAndRescan,
    scan,
    selectPathAndRefresh,
    setLoading,
    setPathInput,
    setScan,
    startupAutoCheckModUpdatesOnStartup,
    updateAutoBackupCleanupEnabled,
    updateAutoBackupEnabled,
    updateAutoBackupRetentionCount,
    updateAutoCheckModUpdatesOnStartup,
    updateModCatalogSources,
    updateSelectedSaveFiles
  };
}

function activeModCatalogSources(order: ModCatalogSourceKind[], enabledCount: number) {
  const normalizedOrder = normalizeModCatalogSourceOrder(order);
  return normalizedOrder.slice(0, Math.max(1, Math.min(enabledCount, normalizedOrder.length)));
}

function normalizeModCatalogSourceOrder(order: ModCatalogSourceKind[]) {
  const allSources: ModCatalogSourceKind[] = ["wegfan", "everestMirror", "everest"];
  const seen = new Set<ModCatalogSourceKind>();
  const normalized = order.filter((source) => {
    if (!allSources.includes(source) || seen.has(source)) return false;
    seen.add(source);
    return true;
  });
  for (const source of allSources) {
    if (!seen.has(source)) normalized.push(source);
  }
  return normalized;
}
