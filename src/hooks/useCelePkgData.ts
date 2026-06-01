import { useCallback, useEffect, useState } from "react";
import { getConfig, scanCeleste, setCelestePath } from "../api";
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
  warnings: []
};

export function useCelePkgData() {
  const [celestePath, setPathInput] = useState("");
  const [scan, setScan] = useState<ScanResult>(emptyScan);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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
    getConfig()
      .then((config) => {
        setPathInput(config.celestePath);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        return refreshPath(config.celestePath);
      })
      .catch((error) => setMessage(readError(error)));
  }, [refreshPath]);

  return {
    celestePath,
    loading,
    message,
    refresh,
    savePathAndRefresh,
    scan,
    setLoading,
    setMessage,
    setPathInput,
    setScan
  };
}
