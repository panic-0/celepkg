import { useCallback, useRef, useState } from "react";
import { cancelModDownload, createOperationId } from "../api";
import type { AppNotifier, ModDownloadProgress } from "../types";
import type { DownloadTask } from "../utils/downloadTask";
import { DownloadTaskRunner, type ExecutableDownloadTaskItem } from "../utils/downloadTaskRunner";
import { readError } from "../utils/format";

export type DownloadControlState = {
  downloadPaused: boolean;
  installPaused: boolean;
};

type DownloadTaskControlsOptions = {
  notifier: AppNotifier;
  setLoading: (loading: boolean, message?: string) => void;
};

export function useDownloadTaskControls({ notifier, setLoading }: DownloadTaskControlsOptions) {
  const [downloadTask, setDownloadTask] = useState<DownloadTask | null>(null);
  const [downloadControls, setDownloadControls] = useState<DownloadControlState>({ downloadPaused: false, installPaused: false });
  const downloadTaskRunner = useRef<DownloadTaskRunner | null>(null);
  const downloadControlsRef = useRef<DownloadControlState>(downloadControls);

  const startDownloadTask = useCallback(async (taskId: string, items: ExecutableDownloadTaskItem[], operationIdPrefix = "mod-task") => {
    const runner = new DownloadTaskRunner(taskId, items, {
      concurrencyLimit: 3,
      initialDownloadPaused: downloadControlsRef.current.downloadPaused,
      initialInstallPaused: downloadControlsRef.current.installPaused,
      createOperationId: () => createOperationId(operationIdPrefix),
      cancelOperation: cancelModDownload,
      onChange: setDownloadTask
    });
    downloadTaskRunner.current = runner;
    return await runner.start();
  }, []);

  const runExecutableDownloadTask = useCallback(
    async (taskId: string, items: ExecutableDownloadTaskItem[], message: string, successMessage: string) => {
      try {
        setLoading(true, message);
        const result = await startDownloadTask(taskId, items);
        if (result.status === "cancelled") {
          notifier.showInfo("已取消下载任务");
          return false;
        }
        if (result.status !== "done") {
          const failedItem = result.items.find((item) => item.error);
          notifier.showError(failedItem?.error ?? "下载或安装失败");
          return false;
        }
        notifier.showSuccess(successMessage);
        return true;
      } catch (error) {
        notifier.showError(readError(error));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [notifier, setLoading, startDownloadTask]
  );

  const applyProgress = useCallback((progress: ModDownloadProgress) => {
    downloadTaskRunner.current?.applyProgress(progress.operationId, progress);
  }, []);

  const updateDownloadControls = useCallback((update: (current: DownloadControlState) => DownloadControlState) => {
    setDownloadControls((current) => {
      const next = update(current);
      downloadControlsRef.current = next;
      return next;
    });
  }, []);

  const pauseTaskDownloads = useCallback(async () => {
    updateDownloadControls((current) => ({ ...current, downloadPaused: true }));
    const runner = downloadTaskRunner.current;
    try {
      if (runner) await runner.pauseDownloads();
      notifier.showInfo("已停止下载，新项目会停在待下载列表");
    } catch (error) {
      notifier.showError(readError(error));
    }
  }, [notifier, updateDownloadControls]);

  const resumeTaskDownloads = useCallback(() => {
    updateDownloadControls((current) => ({ ...current, downloadPaused: false }));
    const runner = downloadTaskRunner.current;
    if (runner) runner.resumeDownloads();
    notifier.showInfo("已恢复下载");
  }, [notifier, updateDownloadControls]);

  const pauseTaskInstalls = useCallback(() => {
    updateDownloadControls((current) => ({ ...current, installPaused: true }));
    const runner = downloadTaskRunner.current;
    if (runner) runner.pauseInstalls();
    notifier.showInfo("已停止安装，新下载完成的项目会停在等待安装列表");
  }, [notifier, updateDownloadControls]);

  const resumeTaskInstalls = useCallback(() => {
    updateDownloadControls((current) => ({ ...current, installPaused: false }));
    const runner = downloadTaskRunner.current;
    if (runner) runner.resumeInstalls();
    notifier.showInfo("已恢复安装");
  }, [notifier, updateDownloadControls]);

  const cancelTaskDownloads = useCallback(async () => {
    const runner = downloadTaskRunner.current;
    if (!runner) return;
    try {
      await runner.cancelPendingDownloads();
      notifier.showInfo("已取消当前待下载项目");
    } catch (error) {
      notifier.showError(readError(error));
    }
  }, [notifier]);

  const cancelTaskInstalls = useCallback(() => {
    const runner = downloadTaskRunner.current;
    if (!runner) return;
    runner.cancelPendingInstalls();
    notifier.showInfo("已取消当前待安装项目");
  }, [notifier]);

  const retryFailedDownloadTask = useCallback(async () => {
    const runner = downloadTaskRunner.current;
    if (!runner) return;
    try {
      setLoading(true, "正在重试失败任务...");
      const result = await runner.retryFailed();
      const installedCount = result.items.filter((item) => item.status === "installed").length;
      const failedCount = result.items.filter(
        (item) => item.status === "downloadFailed" || item.status === "installFailed" || item.status === "skipped"
      ).length;
      if (result.status === "running") notifier.showInfo("已将失败项目重新加入重试队列");
      else if (result.status === "cancelled") notifier.showInfo("已取消重试任务");
      else if (failedCount) notifier.showWarning(`重试完成，成功 ${installedCount} 个，失败 ${failedCount} 个`);
      else notifier.showSuccess(`重试完成，成功 ${installedCount} 个`);
    } catch (error) {
      notifier.showError(readError(error));
    } finally {
      setLoading(false);
    }
  }, [notifier, setLoading]);

  return {
    applyProgress,
    cancelTaskDownloads,
    cancelTaskInstalls,
    downloadControls,
    downloadTask,
    pauseTaskDownloads,
    pauseTaskInstalls,
    resumeTaskDownloads,
    resumeTaskInstalls,
    retryFailedDownloadTask,
    runExecutableDownloadTask,
    startDownloadTask
  };
}
