import { useState } from "react";
import { cleanupAutoBackups, createBackup, deleteBackup, listBackups, openBackupFolder, openBackupLocation, restoreBackup } from "../api";
import type { AppNotifier, BackupInfo, RestoreScope, ScanResult } from "../types";
import { notifyError } from "../utils/notify";

type BackupsOptions = {
  celestePath: string;
  notifier: AppNotifier;
  refresh: (nextPath?: string) => Promise<ScanResult | undefined>;
  setLoading: (loading: boolean) => void;
};

export function useBackups({ celestePath, notifier, refresh, setLoading }: BackupsOptions) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupsRefreshing, setBackupsRefreshing] = useState(false);

  async function refreshBackups() {
    setBackupsRefreshing(true);
    notifier.clearNotice();
    try {
      setBackups(await listBackups());
    } catch (error) {
      notifyError(notifier, error);
    } finally {
      setBackupsRefreshing(false);
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
      notifyError(notifier, error);
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
      notifyError(notifier, error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteSelectedBackup(backupId: string) {
    setLoading(true);
    notifier.clearNotice();
    try {
      await deleteBackup(backupId);
      setBackups(await listBackups());
      notifier.showSuccess("已删除备份。");
    } catch (error) {
      notifyError(notifier, error);
    } finally {
      setLoading(false);
    }
  }

  async function cleanupOldAutoBackups() {
    setLoading(true);
    notifier.clearNotice();
    try {
      const nextBackups = await cleanupAutoBackups();
      setBackups(nextBackups);
      notifier.showSuccess("已清理旧自动备份。");
    } catch (error) {
      notifyError(notifier, error);
    } finally {
      setLoading(false);
    }
  }

  async function openCurrentBackupFolder() {
    notifier.clearNotice();
    try {
      await openBackupFolder(celestePath);
    } catch (error) {
      notifyError(notifier, error);
    }
  }

  async function openSelectedBackupLocation(backupPath: string) {
    notifier.clearNotice();
    try {
      await openBackupLocation(backupPath);
    } catch (error) {
      notifyError(notifier, error);
    }
  }

  return {
    backups,
    backupsRefreshing,
    cleanupOldAutoBackups,
    createManualBackup,
    deleteSelectedBackup,
    openCurrentBackupFolder,
    openSelectedBackupLocation,
    refreshBackups,
    restoreSelectedBackup
  };
}
