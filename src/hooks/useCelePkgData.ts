import { useCallback, useEffect, useRef, useState } from "react";
import { getConfig, scanCeleste, setAutoBackupEnabled, setCelestePath, setSelectedSaveFiles } from "../api";
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const selectedSaveRequestRef = useRef(0);

  const refreshPath = useCallback(async (nextPath: string) => {
    setLoading(true);
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
  }, []);

  const refresh = useCallback((nextPath = celestePath) => refreshPath(nextPath), [celestePath, refreshPath]);

  const loadConfigAndRefresh = useCallback(async () => {
    const config = await getConfig();
    setPathInput(config.celestePath);
    setAutoBackupEnabledState(config.autoBackupEnabled);
    setScan((current) => ({ ...current, profiles: config.profiles, selectedSaveFiles: config.selectedSaveFiles }));
    return refreshPath(config.celestePath);
  }, [refreshPath]);

  const updateAutoBackupEnabled = useCallback(async (enabled: boolean) => {
    setLoading(true);
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
  }, []);

  const updateSelectedSaveFiles = useCallback(async (saveFiles: string[]) => {
    const requestId = selectedSaveRequestRef.current + 1;
    selectedSaveRequestRef.current = requestId;
    setScan((current) => ({ ...current, selectedSaveFiles: saveFiles }));
    setLoading(true);
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
  }, []);

  const savePathAndRefresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      await setCelestePath(celestePath);
      await refreshPath(celestePath);
    } catch (error) {
      setMessage(readError(error));
      setLoading(false);
    }
  }, [celestePath, refreshPath]);

  useEffect(() => {
    loadConfigAndRefresh().catch((error) => setMessage(readError(error)));
  }, [loadConfigAndRefresh]);

  return {
    autoBackupEnabled,
    celestePath,
    loading,
    loadConfigAndRefresh,
    message,
    refresh,
    savePathAndRefresh,
    scan,
    setLoading,
    setMessage,
    setPathInput,
    setScan,
    updateAutoBackupEnabled,
    updateSelectedSaveFiles
  };
}
