import type { ModDownloadProgress } from "../types";

export const defaultDownloadConcurrencyLimit = 3;

export type DownloadTaskStatus = "running" | "done" | "failed" | "cancelled";
export type DownloadTaskItemKind = "mod" | "everest";
export type DownloadTaskItemStatus =
  | "queued"
  | "downloading"
  | "downloaded"
  | "waitingInstall"
  | "installing"
  | "installed"
  | "downloadFailed"
  | "installFailed"
  | "cancelled"
  | "skipped";

export type DownloadTaskItem = {
  id: string;
  name: string;
  kind: DownloadTaskItemKind;
  status: DownloadTaskItemStatus;
  operationId?: string;
  dependsOn?: string[];
  progress?: ModDownloadProgress;
  error?: string;
};

export type DownloadTask = {
  id: string;
  status: DownloadTaskStatus;
  concurrencyLimit: number;
  downloadPaused: boolean;
  installPaused: boolean;
  items: DownloadTaskItem[];
};

export type DownloadTaskGroups = {
  downloading: DownloadTaskItem[];
  downloadFailed: DownloadTaskItem[];
  waitingInstall: DownloadTaskItem[];
  installed: DownloadTaskItem[];
  installFailed: DownloadTaskItem[];
};

export function createDownloadTask(
  id: string,
  items: DownloadTaskItem[],
  concurrencyLimit = defaultDownloadConcurrencyLimit
): DownloadTask {
  return {
    id,
    status: "running",
    concurrencyLimit: Math.max(1, concurrencyLimit),
    downloadPaused: false,
    installPaused: false,
    items
  };
}

export function groupDownloadTaskItems(items: DownloadTaskItem[]): DownloadTaskGroups {
  return {
    downloading: items.filter((item) => item.status === "queued" || item.status === "downloading"),
    downloadFailed: items.filter((item) => item.status === "downloadFailed" || item.status === "cancelled"),
    waitingInstall: items.filter(
      (item) => item.status === "downloaded" || item.status === "waitingInstall" || item.status === "installing"
    ),
    installed: items.filter((item) => item.status === "installed"),
    installFailed: items.filter((item) => item.status === "installFailed" || item.status === "skipped")
  };
}

export function activeDownloadOperationIds(task: DownloadTask): string[] {
  return task.items.filter((item) => item.status === "downloading" && item.operationId).map((item) => item.operationId as string);
}

export function selectQueuedItemsForDownload(task: DownloadTask): DownloadTaskItem[] {
  if (task.downloadPaused) return [];
  const activeCount = task.items.filter((item) => item.status === "downloading").length;
  const availableSlots = Math.max(0, task.concurrencyLimit - activeCount);
  if (availableSlots === 0) return [];
  return task.items.filter((item) => item.status === "queued").slice(0, availableSlots);
}

export function selectNextInstallItem(task: DownloadTask): DownloadTaskItem | null {
  if (task.installPaused) return null;
  if (task.items.some((item) => item.status === "installing")) return null;
  const installedIds = new Set(task.items.filter((item) => item.status === "installed").map((item) => item.id));
  return (
    task.items.find((item) => {
      if (item.status !== "downloaded" && item.status !== "waitingInstall") return false;
      return (item.dependsOn ?? []).every((dependencyId) => installedIds.has(dependencyId));
    }) ?? null
  );
}

export function markPendingDownloadsCancelled(task: DownloadTask): DownloadTask {
  return {
    ...task,
    items: task.items.map((item) => {
      if (item.status === "queued" || item.status === "downloading") {
        return { ...item, status: "cancelled", operationId: undefined, progress: undefined, error: "已取消下载" };
      }
      return item;
    })
  };
}

export function markPendingInstallsCancelled(task: DownloadTask): DownloadTask {
  return {
    ...task,
    items: task.items.map((item) => {
      if (item.status === "downloaded" || item.status === "waitingInstall") {
        return { ...item, status: "installFailed", error: "已取消安装" };
      }
      return item;
    })
  };
}

export function skipItemsWithFailedDependencies(task: DownloadTask): DownloadTask {
  const failedIds = new Set(
    task.items
      .filter(
        (item) =>
          item.status === "downloadFailed" || item.status === "installFailed" || item.status === "cancelled" || item.status === "skipped"
      )
      .map((item) => item.id)
  );
  if (!failedIds.size) return task;
  return {
    ...task,
    items: task.items.map((item) => {
      if (item.status !== "downloaded" && item.status !== "waitingInstall" && item.status !== "queued") return item;
      const failedDependency = (item.dependsOn ?? []).find((dependencyId) => failedIds.has(dependencyId));
      if (!failedDependency) return item;
      return { ...item, status: "skipped", error: "依赖失败，已跳过安装" };
    })
  };
}

export function summarizeDownloadTask(task: DownloadTask) {
  const groups = groupDownloadTaskItems(task.items);
  return {
    downloading: groups.downloading.length,
    downloadFailed: groups.downloadFailed.length,
    waitingInstall: groups.waitingInstall.length,
    installed: groups.installed.length,
    installFailed: groups.installFailed.length
  };
}

export function isRetriableTaskItem(item: DownloadTaskItem) {
  return item.status === "downloadFailed" || item.status === "installFailed" || item.status === "skipped" || item.status === "cancelled";
}

export function canRetryFailedTask(task: DownloadTask) {
  if (!task.items.some(isRetriableTaskItem)) return false;
  return !task.items.some((item) => item.status === "downloading" || item.status === "installing");
}
