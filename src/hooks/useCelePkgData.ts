import { useEffect, useState } from "react";
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
  profiles: { activeProfileId: "default", profiles: [] },
  warnings: []
};

export function useCelePkgData() {
  const [celestePath, setPathInput] = useState("");
  const [scan, setScan] = useState<ScanResult>(emptyScan);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh(nextPath = celestePath) {
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
  }

  async function savePathAndRefresh() {
    setLoading(true);
    setMessage("");
    try {
      await setCelestePath(celestePath);
      await refresh(celestePath);
    } catch (error) {
      setMessage(readError(error));
      setLoading(false);
    }
  }

  useEffect(() => {
    getConfig()
      .then((config) => {
        setPathInput(config.celestePath);
        setScan((current) => ({ ...current, profiles: config.profiles }));
        return refresh(config.celestePath);
      })
      .catch((error) => setMessage(readError(error)));
  }, []);

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
