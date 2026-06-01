import { useState } from "react";
import { createBackup, listBackups, openBackupFolder, openBackupLocation, restoreBackup } from "../api";
import type { BackupInfo, RestoreScope, ScanResult } from "../types";
import { readError } from "../utils/format";

type BackupsOptions = {
  celestePath: string;
  refresh: (nextPath?: string) => Promise<ScanResult | undefined>;
  setLoading: (loading: boolean) => void;
  setMessage: (message: string) => void;
};

export function useBackups({ celestePath, refresh, setLoading, setMessage }: BackupsOptions) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  async function refreshBackups() {
    setLoading(true);
    setMessage("");
    try {
      setBackups(await listBackups());
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function createManualBackup() {
    setLoading(true);
    setMessage("");
    try {
      const backup = await createBackup(celestePath, "manual");
      setBackups(await listBackups());
      setMessage(`已创建备份：${backup.id}`);
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function restoreSelectedBackup(backupId: string, scope: RestoreScope) {
    setLoading(true);
    setMessage("");
    try {
      await restoreBackup(backupId, scope);
      setBackups(await listBackups());
      await refresh(celestePath);
      setMessage("已还原游戏文件。");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function openCurrentBackupFolder() {
    setLoading(true);
    setMessage("");
    try {
      await openBackupFolder(celestePath);
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function openSelectedBackupLocation(backupPath: string) {
    setLoading(true);
    setMessage("");
    try {
      await openBackupLocation(backupPath);
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  return {
    backups,
    createManualBackup,
    openCurrentBackupFolder,
    openSelectedBackupLocation,
    refreshBackups,
    restoreSelectedBackup
  };
}
