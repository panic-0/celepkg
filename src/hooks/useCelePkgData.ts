import { useCallback, useEffect, useRef, useState } from "react";
import { getConfig, rescanCeleste, scanCeleste, setAutoBackupEnabled, setCelestePath, setSelectedSaveFiles } from "../api";
import type { ScanResult } from "../types";
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
  warnings: []
};

export function useCelePkgData() {
  const [celestePath, setPathInput] = useState("");
  const [scan, setScan] = useState<ScanResult>(emptyScan);
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(true);
  const [loading, setLoadingState] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [message, setMessage] = useState("");
  const selectedSaveRequestRef = useRef(0);

  const setLoading = useCallback((nextLoading: boolean) => {
    setLoadingState(nextLoading);
    if (!nextLoading) setLoadingMessage("");
  }, []);

  const refreshPath = useCallback(
    async (nextPath: string) => {
      setLoading(true);
      setLoadingMessage("正在读取扫描缓存并扫描地图...");
      setMessage("");
      try {
        const result = await scanCeleste(nextPath);
        setScan(result);
        setPathInput(result.celestePath);
        return result;
      } catch (error) {
        setMessage(readError(error));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [setLoading]
  );

  const rescanPath = useCallback(
    async (nextPath: string) => {
      setLoading(true);
      setLoadingMessage("正在刷新缓存并重新扫描地图...");
      setMessage("");
      try {
        const result = await rescanCeleste(nextPath);
        setScan(result);
        setPathInput(result.celestePath);
        setMessage("已刷新缓存并重新扫描地图。");
        return result;
      } catch (error) {
        setMessage(readError(error));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [setLoading]
  );

  const refresh = useCallback((nextPath = celestePath) => refreshPath(nextPath), [celestePath, refreshPath]);

  const loadConfigAndRefresh = useCallback(async () => {
    const config = await getConfig();
    setPathInput(config.celestePath);
    setAutoBackupEnabledState(config.autoBackupEnabled);
    setScan((current) => ({ ...current, profiles: config.profiles, selectedSaveFiles: config.selectedSaveFiles }));
    return refreshPath(config.celestePath);
  }, [refreshPath]);

  const updateAutoBackupEnabled = useCallback(
    async (enabled: boolean) => {
      setLoading(true);
      setLoadingMessage("正在更新备份设置...");
      setMessage("");
      try {
        const config = await setAutoBackupEnabled(enabled);
        setAutoBackupEnabledState(config.autoBackupEnabled);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        setMessage(config.autoBackupEnabled ? "已开启修改前自动备份。" : "已关闭修改前自动备份。");
      } catch (error) {
        setMessage(readError(error));
      } finally {
        setLoading(false);
      }
    },
    [setLoading]
  );

  const updateSelectedSaveFiles = useCallback(
    async (saveFiles: string[]) => {
      const requestId = selectedSaveRequestRef.current + 1;
      selectedSaveRequestRef.current = requestId;
      setScan((current) => ({ ...current, selectedSaveFiles: saveFiles }));
      setLoading(true);
      setLoadingMessage("正在更新存档统计...");
      setMessage("");
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
          setMessage(readError(error));
        }
      } finally {
        if (selectedSaveRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [setLoading]
  );

  const savePathAndRefresh = useCallback(async () => {
    setLoading(true);
    setLoadingMessage("正在保存目录...");
    setMessage("");
    try {
      await setCelestePath(celestePath);
      await refreshPath(celestePath);
    } catch (error) {
      setMessage(readError(error));
      setLoading(false);
    }
  }, [celestePath, refreshPath, setLoading]);

  const savePathAndRescan = useCallback(async () => {
    setLoading(true);
    setLoadingMessage("正在保存目录...");
    setMessage("");
    try {
      await setCelestePath(celestePath);
      await rescanPath(celestePath);
    } catch (error) {
      setMessage(readError(error));
      setLoading(false);
    }
  }, [celestePath, rescanPath, setLoading]);

  useEffect(() => {
    loadConfigAndRefresh().catch((error) => setMessage(readError(error)));
  }, [loadConfigAndRefresh]);

  return {
    autoBackupEnabled,
    celestePath,
    loading,
    loadingMessage,
    loadConfigAndRefresh,
    message,
    refresh,
    savePathAndRefresh,
    savePathAndRescan,
    scan,
    setLoading,
    setMessage,
    setPathInput,
    setScan,
    updateAutoBackupEnabled,
    updateSelectedSaveFiles
  };
}
