import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getConfig,
  refreshModCatalogCache,
  rescanCeleste,
  scanCeleste,
  setAutoBackupCleanupEnabled,
  setAutoCheckAppUpdatesOnStartup,
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
import {
  activeModCatalogSources,
  DEFAULT_AUTO_BACKUP_CLEANUP_ENABLED,
  DEFAULT_AUTO_BACKUP_ENABLED,
  DEFAULT_AUTO_BACKUP_RETENTION_COUNT,
  DEFAULT_AUTO_CHECK_APP_UPDATES_ON_STARTUP,
  DEFAULT_AUTO_CHECK_MOD_UPDATES_ON_STARTUP,
  DEFAULT_AUTO_REFRESH_MOD_CATALOG_CACHE_ON_STARTUP,
  DEFAULT_MOD_CATALOG_SOURCE_ENABLED_COUNT,
  DEFAULT_MOD_CATALOG_SOURCE_ORDER,
  DEFAULT_SELECTED_SAVE_FILES
} from "../utils/configDefaults";
import { createLatestRequestTracker } from "../utils/latestRequest";
import { emptyLoadingState, nextLoadingState } from "../utils/loadingState";
import { notifyError } from "../utils/notify";

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
  selectedSaveFiles: [...DEFAULT_SELECTED_SAVE_FILES],
  warnings: [],
  timings: []
};

export function useCelePkgData() {
  const [celestePath, setPathInput] = useState("");
  const [scan, setScan] = useState<ScanResult>(emptyScan);
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(DEFAULT_AUTO_BACKUP_ENABLED);
  const [autoBackupCleanupEnabled, setAutoBackupCleanupEnabledState] = useState(DEFAULT_AUTO_BACKUP_CLEANUP_ENABLED);
  const [autoBackupRetentionCount, setAutoBackupRetentionCountState] = useState(DEFAULT_AUTO_BACKUP_RETENTION_COUNT);
  const [modCatalogSourceOrder, setModCatalogSourceOrderState] = useState<ModCatalogSourceKind[]>(() => [
    ...DEFAULT_MOD_CATALOG_SOURCE_ORDER
  ]);
  const [modCatalogSourceEnabledCount, setModCatalogSourceEnabledCountState] = useState(DEFAULT_MOD_CATALOG_SOURCE_ENABLED_COUNT);
  const modCatalogSources = useMemo(
    () => activeModCatalogSources(modCatalogSourceOrder, modCatalogSourceEnabledCount),
    [modCatalogSourceEnabledCount, modCatalogSourceOrder]
  );
  const [autoCheckModUpdatesOnStartup, setAutoCheckModUpdatesOnStartupState] = useState(DEFAULT_AUTO_CHECK_MOD_UPDATES_ON_STARTUP);
  const [autoCheckAppUpdatesOnStartup, setAutoCheckAppUpdatesOnStartupState] = useState(DEFAULT_AUTO_CHECK_APP_UPDATES_ON_STARTUP);
  const [startupAutoCheckModUpdatesOnStartup, setStartupAutoCheckModUpdatesOnStartup] = useState(DEFAULT_AUTO_CHECK_MOD_UPDATES_ON_STARTUP);
  const [autoRefreshModCatalogCacheOnStartup, setAutoRefreshModCatalogCacheOnStartupState] = useState(
    DEFAULT_AUTO_REFRESH_MOD_CATALOG_CACHE_ON_STARTUP
  );
  const [catalogCacheRefreshing, setCatalogCacheRefreshing] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
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
        if (scanRequestTrackerRef.current.isLatest(requestId)) notifyError(notifier, error);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading]
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
        if (scanRequestTrackerRef.current.isLatest(requestId)) notifyError(notifier, error);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading, showNotice]
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
    setAutoCheckAppUpdatesOnStartupState(config.autoCheckAppUpdatesOnStartup);
    setStartupAutoCheckModUpdatesOnStartup(config.autoCheckModUpdatesOnStartup);
    setAutoRefreshModCatalogCacheOnStartupState(config.autoRefreshModCatalogCacheOnStartup);
    setConfigLoaded(true);
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
        notifyError(notifier, error);
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading, showNotice]
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
        notifyError(notifier, error);
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading, showNotice]
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
        notifyError(notifier, error);
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading, showNotice]
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
        notifyError(notifier, error);
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading, showNotice]
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
        notifyError(notifier, error);
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading, showNotice]
  );

  const updateAutoCheckAppUpdatesOnStartup = useCallback(
    async (enabled: boolean) => {
      configRequestTrackerRef.current.invalidate();
      setLoading(true, "正在更新应用设置...");
      clearNotice();
      try {
        const config = await setAutoCheckAppUpdatesOnStartup(enabled);
        setAutoCheckAppUpdatesOnStartupState(config.autoCheckAppUpdatesOnStartup);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        showNotice("success", config.autoCheckAppUpdatesOnStartup ? "已开启启动时检查应用更新。" : "已关闭启动时检查应用更新。");
      } catch (error) {
        notifyError(notifier, error);
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading, showNotice]
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
        notifyError(notifier, error);
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading, showNotice]
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
      notifyError(notifier, error);
      return undefined;
    } finally {
      setCatalogCacheRefreshing(false);
    }
  }, [clearNotice, modCatalogSources, notifier, showNotice]);

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
          notifyError(notifier, error);
        }
      } finally {
        setLoading(false);
      }
    },
    [clearNotice, notifier, setLoading]
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
      notifyError(notifier, error);
    } finally {
      setLoading(false);
    }
  }, [celestePath, clearNotice, notifier, refreshPath, setLoading]);

  const savePathAndRescan = useCallback(async () => {
    configRequestTrackerRef.current.invalidate();
    setLoading(true, "正在保存目录...");
    clearNotice();
    try {
      await setCelestePath(celestePath);
      setConfigWarnings([]);
      await rescanPath(celestePath);
    } catch (error) {
      notifyError(notifier, error);
    } finally {
      setLoading(false);
    }
  }, [celestePath, clearNotice, notifier, rescanPath, setLoading]);

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
      notifyError(notifier, error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [clearNotice, notifier, refreshPath, setLoading, setLoadingMessage]);

  useEffect(() => {
    loadConfigAndRefresh().catch((error) => notifyError(notifier, error));
  }, [loadConfigAndRefresh, notifier]);

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
    autoCheckAppUpdatesOnStartup,
    autoCheckModUpdatesOnStartup,
    autoRefreshModCatalogCacheOnStartup,
    catalogCacheRefreshing,
    celestePath,
    clearNotice,
    configLoaded,
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
    updateAutoCheckAppUpdatesOnStartup,
    updateAutoCheckModUpdatesOnStartup,
    updateAutoRefreshModCatalogCacheOnStartup,
    updateModCatalogSources,
    updateSelectedSaveFiles
  };
}
