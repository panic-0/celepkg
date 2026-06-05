import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getConfig,
  refreshModCatalogCache,
  rescanCeleste,
  scanCeleste,
  setAutoBackupCleanupEnabled,
  setAutoCheckModUpdatesOnStartup,
  setAutoRefreshModCatalogCacheOnStartup,
  selectCelesteDirectory,
  setAutoBackupEnabled,
  setAutoBackupRetentionCount,
  setCelestePath,
  setModCatalogSources,
  setSelectedSaveFiles
} from "../api";
import type { AppNotice, AppNoticeTone, AppNotifier, ModCatalogSourceKind, ScanResult } from "../types";
import { readError } from "../utils/format";
import { createLatestRequestTracker } from "../utils/latestRequest";
import { emptyLoadingState, nextLoadingState } from "../utils/loadingState";

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
  const [autoCheckModUpdatesOnStartup, setAutoCheckModUpdatesOnStartupState] = useState(true);
  const [startupAutoCheckModUpdatesOnStartup, setStartupAutoCheckModUpdatesOnStartup] = useState(true);
  const [autoRefreshModCatalogCacheOnStartup, setAutoRefreshModCatalogCacheOnStartupState] = useState(true);
  const [catalogCacheRefreshing, setCatalogCacheRefreshing] = useState(false);
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);
  const [loadingState, setLoadingState] = useState(emptyLoadingState);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const noticeIdRef = useRef(0);
  const selectedSaveRequestRef = useRef(0);
  const startupCatalogCacheRefreshRef = useRef(false);
  const configRequestTrackerRef = useRef(createLatestRequestTracker());
  const scanRequestTrackerRef = useRef(createLatestRequestTracker());

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
    setLoadingState((current) => nextLoadingState(current, nextLoading, message));
  }, []);

  const setLoadingMessage = useCallback((message: string) => {
    setLoadingState((current) => (current.loading ? { ...current, message } : current));
  }, []);

  const refreshPath = useCallback(
    async (nextPath: string) => {
      const requestId = scanRequestTrackerRef.current.begin();
      setLoading(true, "正在读取扫描缓存并扫描地图...");
      clearNotice();
      try {
        const result = await scanCeleste(nextPath);
        if (!scanRequestTrackerRef.current.isLatest(requestId)) return undefined;
        setScan(result);
        setPathInput(result.celestePath);
        return result;
      } catch (error) {
        if (scanRequestTrackerRef.current.isLatest(requestId)) showNotice("error", readError(error));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const rescanPath = useCallback(
    async (nextPath: string) => {
      const requestId = scanRequestTrackerRef.current.begin();
      setLoading(true, "正在刷新缓存并重新扫描地图...");
      clearNotice();
      try {
        const result = await rescanCeleste(nextPath);
        if (!scanRequestTrackerRef.current.isLatest(requestId)) return undefined;
        setScan(result);
        setPathInput(result.celestePath);
        showNotice("success", "已刷新缓存并重新扫描地图。");
        return result;
      } catch (error) {
        if (scanRequestTrackerRef.current.isLatest(requestId)) showNotice("error", readError(error));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const refresh = useCallback((nextPath = celestePath) => refreshPath(nextPath), [celestePath, refreshPath]);

  const loadConfigAndRefresh = useCallback(async () => {
    const requestId = configRequestTrackerRef.current.begin();
    const config = await getConfig();
    if (!configRequestTrackerRef.current.isLatest(requestId)) return undefined;
    setConfigWarnings(config.warnings);
    setPathInput(config.celestePath);
    setAutoBackupEnabledState(config.autoBackupEnabled);
    setAutoBackupCleanupEnabledState(config.autoBackupCleanupEnabled);
    setAutoBackupRetentionCountState(config.autoBackupRetentionCount);
    setModCatalogSourceOrderState(config.modCatalogSourceOrder);
    setModCatalogSourceEnabledCountState(config.modCatalogSourceEnabledCount);
    setAutoCheckModUpdatesOnStartupState(config.autoCheckModUpdatesOnStartup);
    setStartupAutoCheckModUpdatesOnStartup(config.autoCheckModUpdatesOnStartup);
    setAutoRefreshModCatalogCacheOnStartupState(config.autoRefreshModCatalogCacheOnStartup);
    if (config.autoRefreshModCatalogCacheOnStartup && !startupCatalogCacheRefreshRef.current) {
      startupCatalogCacheRefreshRef.current = true;
      const sources = activeModCatalogSources(config.modCatalogSourceOrder, config.modCatalogSourceEnabledCount);
      void refreshModCatalogCache(sources).catch(() => undefined);
    }
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
      configRequestTrackerRef.current.invalidate();
      setLoading(true, "正在更新备份设置...");
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
      configRequestTrackerRef.current.invalidate();
      const normalizedCount = Math.max(1, Math.min(100, Math.trunc(count)));
      setLoading(true, "正在更新备份设置...");
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
      configRequestTrackerRef.current.invalidate();
      setLoading(true, "正在更新备份设置...");
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
      configRequestTrackerRef.current.invalidate();
      setLoading(true, "正在更新 Mod 设置...");
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
      configRequestTrackerRef.current.invalidate();
      setLoading(true, "正在更新 Mod 设置...");
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

  const updateAutoRefreshModCatalogCacheOnStartup = useCallback(
    async (enabled: boolean) => {
      configRequestTrackerRef.current.invalidate();
      setLoading(true, "正在更新 Mod 设置...");
      clearNotice();
      try {
        const config = await setAutoRefreshModCatalogCacheOnStartup(enabled);
        setAutoRefreshModCatalogCacheOnStartupState(config.autoRefreshModCatalogCacheOnStartup);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        showNotice(
          "success",
          config.autoRefreshModCatalogCacheOnStartup ? "已开启启动时静默拉取 Mod 列表缓存。" : "已关闭启动时静默拉取 Mod 列表缓存。"
        );
      } catch (error) {
        showNotice("error", readError(error));
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const refreshModCatalogCacheNow = useCallback(async () => {
    setCatalogCacheRefreshing(true);
    clearNotice();
    try {
      const result = await refreshModCatalogCache(modCatalogSources);
      if (result.warnings.length) {
        showNotice("warning", result.warnings.join("；"));
      } else {
        showNotice("success", `已刷新 ${result.sources.length} 个 Mod 数据源缓存。`);
      }
      return result;
    } catch (error) {
      showNotice("error", readError(error));
      return undefined;
    } finally {
      setCatalogCacheRefreshing(false);
    }
  }, [clearNotice, modCatalogSources, showNotice]);

  const updateSelectedSaveFiles = useCallback(
    async (saveFiles: string[]) => {
      configRequestTrackerRef.current.invalidate();
      const requestId = selectedSaveRequestRef.current + 1;
      selectedSaveRequestRef.current = requestId;
      const scanRequestId = scanRequestTrackerRef.current.begin();
      const isLatestRequest = () => selectedSaveRequestRef.current === requestId && scanRequestTrackerRef.current.isLatest(scanRequestId);
      setScan((current) => ({ ...current, selectedSaveFiles: saveFiles }));
      setLoading(true, "正在更新存档统计...");
      clearNotice();
      try {
        const config = await setSelectedSaveFiles(saveFiles);
        if (!isLatestRequest()) return;
        setScan((current) => ({ ...current, profiles: config.profiles, selectedSaveFiles: config.selectedSaveFiles }));
        const result = await scanCeleste(config.celestePath);
        if (!isLatestRequest()) return;
        setScan(result);
        setPathInput(result.celestePath);
      } catch (error) {
        if (isLatestRequest()) {
          showNotice("error", readError(error));
        }
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, setLoading, showNotice]
  );

  const savePathAndRefresh = useCallback(async () => {
    configRequestTrackerRef.current.invalidate();
    setLoading(true, "正在保存目录...");
    clearNotice();
    try {
      await setCelestePath(celestePath);
      setConfigWarnings([]);
      await refreshPath(celestePath);
    } catch (error) {
      showNotice("error", readError(error));
    } finally {
      setLoading(false);
    }
  }, [celestePath, clearNotice, refreshPath, setLoading, showNotice]);

  const savePathAndRescan = useCallback(async () => {
    configRequestTrackerRef.current.invalidate();
    setLoading(true, "正在保存目录...");
    clearNotice();
    try {
      await setCelestePath(celestePath);
      setConfigWarnings([]);
      await rescanPath(celestePath);
    } catch (error) {
      showNotice("error", readError(error));
    } finally {
      setLoading(false);
    }
  }, [celestePath, clearNotice, rescanPath, setLoading, showNotice]);

  const selectPathAndRefresh = useCallback(async () => {
    configRequestTrackerRef.current.invalidate();
    setLoading(true, "正在选择目录...");
    clearNotice();
    try {
      const selectedPath = await selectCelesteDirectory();
      if (!selectedPath) {
        return undefined;
      }
      setPathInput(selectedPath);
      setLoadingMessage("正在保存目录...");
      const saved = await setCelestePath(selectedPath);
      setConfigWarnings([]);
      return await refreshPath(saved.celestePath);
    } catch (error) {
      showNotice("error", readError(error));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [clearNotice, refreshPath, setLoading, setLoadingMessage, showNotice]);

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
    autoRefreshModCatalogCacheOnStartup,
    catalogCacheRefreshing,
    celestePath,
    clearNotice,
    configWarnings,
    loading: loadingState.loading,
    loadingMessage: loadingState.message,
    loadConfigAndRefresh,
    modCatalogSources,
    modCatalogSourceEnabledCount,
    modCatalogSourceOrder,
    notice,
    notifier,
    refresh,
    refreshModCatalogCacheNow,
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
    updateAutoRefreshModCatalogCacheOnStartup,
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
