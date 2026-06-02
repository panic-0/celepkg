import { useState } from "react";
import { createBackup, listBackups, openBackupFolder, openBackupLocation, restoreBackup } from "../api";
import type { AppNotifier, BackupInfo, RestoreScope, ScanResult } from "../types";
import { readError } from "../utils/format";

type BackupsOptions = {
  celestePath: string;
  notifier: AppNotifier;
  refresh: (nextPath?: string) => Promise<ScanResult | undefined>;
  setLoading: (loading: boolean) => void;
};

export function useBackups({ celestePath, notifier, refresh, setLoading }: BackupsOptions) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  async function refreshBackups() {
    setLoading(true);
    notifier.clearNotice();
    try {
      setBackups(await listBackups());
    } catch (error) {
      notifier.showError(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function createManualBackup() {
    setLoading(true);
    notifier.clearNotice();
    try {
      const backup = await createBackup(celestePath, "manual");
      setBackups(await listBackups());
      notifier.showSuccess(`已创建备份：${backup.id}`);
    } catch (error) {
      notifier.showError(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function restoreSelectedBackup(backupId: string, scope: RestoreScope) {
    setLoading(true);
    notifier.clearNotice();
    try {
      await restoreBackup(backupId, scope);
      setBackups(await listBackups());
      await refresh(celestePath);
      notifier.showSuccess("已还原游戏文件。");
    } catch (error) {
      notifier.showError(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function openCurrentBackupFolder() {
    setLoading(true);
    notifier.clearNotice();
    try {
      await openBackupFolder(celestePath);
    } catch (error) {
      notifier.showError(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function openSelectedBackupLocation(backupPath: string) {
    setLoading(true);
    notifier.clearNotice();
    try {
      await openBackupLocation(backupPath);
    } catch (error) {
      notifier.showError(readError(error));
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
