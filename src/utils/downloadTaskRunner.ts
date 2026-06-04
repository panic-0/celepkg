import type { StagedDownload } from "../types";
import {
  activeDownloadOperationIds,
  createDownloadTask,
  markPendingDownloadsCancelled,
  markPendingInstallsCancelled,
  selectNextInstallItem,
  selectQueuedItemsForDownload,
  skipItemsWithFailedDependencies,
  isRetriableTaskItem,
  type DownloadTask,
  type DownloadTaskItem
} from "./downloadTask";

export type ExecutableDownloadTaskItem = DownloadTaskItem & {
  download: (operationId: string, taskIndex: number, taskTotal: number) => Promise<StagedDownload>;
  prepareInstall?: (staged: StagedDownload) => Promise<ExecutableDownloadTaskItem[]>;
  install: (staged: StagedDownload) => Promise<void>;
};

export type DownloadTaskRunnerOptions = {
  concurrencyLimit?: number;
  createOperationId: (item: DownloadTaskItem) => string;
  cancelOperation: (operationId: string) => Promise<unknown>;
  onChange?: (task: DownloadTask) => void;
};

export class DownloadTaskRunner {
  private executableItems: ExecutableDownloadTaskItem[];
  private readonly stagedByItemId = new Map<string, StagedDownload>();
  private readonly installPreparedItemIds = new Set<string>();
  private readonly pausedDownloadItemIds = new Set<string>();
  private readonly cancelledDownloadItemIds = new Set<string>();
  private readonly cancelledInstallItemIds = new Set<string>();
  private readonly options: DownloadTaskRunnerOptions;
  private activeDownloads = 0;
  private installing = false;
  private started = false;
  private doneResolvers: Array<(task: DownloadTask) => void> = [];
  private task: DownloadTask;

  constructor(id: string, items: ExecutableDownloadTaskItem[], options: DownloadTaskRunnerOptions) {
    this.executableItems = items;
    this.options = options;
    this.task = createDownloadTask(
      id,
      items.map(({ download, prepareInstall, install, ...item }) => {
        void download;
        void prepareInstall;
        void install;
        return item;
      }),
      options.concurrencyLimit
    );
  }

  snapshot() {
    return this.task;
  }

  start(): Promise<DownloadTask> {
    return new Promise((resolve) => {
      this.doneResolvers.push(resolve);
      if (this.started) {
        this.resolveIfComplete();
        return;
      }
      this.started = true;
      this.emit();
      this.pump();
    });
  }

  async pauseDownloads() {
    for (const item of this.task.items) {
      if (item.status === "downloading") this.pausedDownloadItemIds.add(item.id);
    }
    this.setTask({ ...this.task, downloadPaused: true });
    await Promise.allSettled(activeDownloadOperationIds(this.task).map((operationId) => this.options.cancelOperation(operationId)));
    this.resolveIfComplete();
  }

  resumeDownloads() {
    this.setTask({ ...this.task, status: "running", downloadPaused: false });
    this.pump();
  }

  pauseInstalls() {
    this.setTask({ ...this.task, installPaused: true });
    this.resolveIfComplete();
  }

  resumeInstalls() {
    this.setTask({ ...this.task, status: "running", installPaused: false });
    this.pump();
  }

  async cancelPendingDownloads() {
    const operationIds = activeDownloadOperationIds(this.task);
    for (const item of this.task.items) {
      if (item.status === "queued" || item.status === "downloading") this.cancelledDownloadItemIds.add(item.id);
    }
    this.setTask(skipItemsWithFailedDependencies(markPendingDownloadsCancelled(this.task)));
    await Promise.allSettled(operationIds.map((operationId) => this.options.cancelOperation(operationId)));
    this.pump();
  }

  cancelPendingInstalls() {
    for (const item of this.task.items) {
      if (item.status === "downloaded" || item.status === "waitingInstall") this.cancelledInstallItemIds.add(item.id);
    }
    this.setTask(skipItemsWithFailedDependencies(markPendingInstallsCancelled(this.task)));
    this.pump();
  }

  applyProgress(operationId: string, progress: DownloadTaskItem["progress"]) {
    this.updateItemByOperation(operationId, (item) => ({ ...item, progress }));
  }

  retryFailed(): Promise<DownloadTask> {
    if (this.activeDownloads > 0 || this.installing) {
      return Promise.resolve(this.task);
    }
    const retryIds = new Set(this.task.items.filter(isRetriableTaskItem).map((item) => item.id));
    if (!retryIds.size) return Promise.resolve(this.task);
    const shouldReturnImmediately = this.task.downloadPaused || this.task.installPaused || this.hasIncompleteItems();
    const completion = shouldReturnImmediately
      ? null
      : new Promise<DownloadTask>((resolve) => {
          this.doneResolvers.push(resolve);
        });
    for (const itemId of retryIds) {
      this.stagedByItemId.delete(itemId);
      this.installPreparedItemIds.delete(itemId);
      this.pausedDownloadItemIds.delete(itemId);
      this.cancelledDownloadItemIds.delete(itemId);
      this.cancelledInstallItemIds.delete(itemId);
    }
    this.setTask({
      ...this.task,
      status: "running",
      items: this.task.items.map((item) =>
        retryIds.has(item.id) ? { ...item, status: "queued", operationId: undefined, progress: undefined, error: undefined } : item
      )
    });
    this.pump();
    if (shouldReturnImmediately) return Promise.resolve(this.task);
    return completion as Promise<DownloadTask>;
  }

  private pump() {
    for (const item of selectQueuedItemsForDownload(this.task)) {
      void this.startDownload(item.id);
    }
    void this.startInstallIfReady();
    this.resolveIfComplete();
  }

  private async startDownload(itemId: string) {
    const executable = this.executableItems.find((item) => item.id === itemId);
    if (!executable) return;
    const operationId = this.options.createOperationId(executable);
    const taskIndex = this.executableItems.findIndex((item) => item.id === itemId) + 1;
    const taskTotal = this.executableItems.length;
    this.activeDownloads += 1;
    this.updateItem(itemId, (item) => ({ ...item, status: "downloading", operationId }));
    try {
      const staged = await executable.download(operationId, taskIndex, taskTotal);
      if (this.cancelledDownloadItemIds.has(itemId)) {
        this.updateItem(itemId, (item) => ({ ...item, status: "cancelled", operationId: undefined, progress: undefined, error: "已取消下载" }));
      } else if (this.pausedDownloadItemIds.has(itemId)) {
        this.pausedDownloadItemIds.delete(itemId);
        this.updateItem(itemId, (item) => ({ ...item, status: "queued", operationId: undefined, progress: undefined }));
      } else {
        this.stagedByItemId.set(itemId, staged);
        this.updateItem(itemId, (item) => ({ ...item, status: "downloaded" }));
      }
    } catch (error) {
      if (this.cancelledDownloadItemIds.has(itemId)) {
        this.updateItem(itemId, (item) => ({ ...item, status: "cancelled", operationId: undefined, progress: undefined, error: "已取消下载" }));
      } else if (this.pausedDownloadItemIds.has(itemId)) {
        this.pausedDownloadItemIds.delete(itemId);
        this.updateItem(itemId, (item) => ({ ...item, status: "queued", operationId: undefined, progress: undefined }));
      } else {
        this.updateItem(itemId, (item) => ({
          ...item,
          status: "downloadFailed",
          error: readError(error)
        }));
      }
    } finally {
      this.activeDownloads -= 1;
      this.setTask(skipItemsWithFailedDependencies(this.task));
      this.pump();
    }
  }

  private async startInstallIfReady() {
    if (this.installing) return;
    const item = selectNextInstallItem(this.task);
    if (!item) return;
    const executable = this.executableItems.find((candidate) => candidate.id === item.id);
    const staged = this.stagedByItemId.get(item.id);
    if (!executable || !staged) return;
    if (!this.installPreparedItemIds.has(item.id) && executable.prepareInstall) {
      this.installing = true;
      this.updateItem(item.id, (current) => ({ ...current, status: "waitingInstall" }));
      try {
        const dependencies = await executable.prepareInstall(staged);
        if (this.cancelledInstallItemIds.has(item.id)) {
          this.installPreparedItemIds.add(item.id);
          this.updateItem(item.id, (current) => ({ ...current, status: "installFailed", error: "已取消安装" }));
          return;
        }
        this.installPreparedItemIds.add(item.id);
        const dependencyIds = this.addExecutableItems(dependencies);
        if (dependencyIds.length) {
          this.updateItem(item.id, (current) => ({
            ...current,
            dependsOn: [...new Set([...(current.dependsOn ?? []), ...dependencyIds])]
          }));
        }
      } catch (error) {
        this.installPreparedItemIds.add(item.id);
        this.updateItem(item.id, (current) => ({ ...current, status: "installFailed", error: readError(error) }));
      } finally {
        this.installing = false;
        this.setTask(skipItemsWithFailedDependencies(this.task));
        this.pump();
      }
      return;
    }
    this.installPreparedItemIds.add(item.id);
    this.installing = true;
    this.updateItem(item.id, (current) => ({ ...current, status: "installing" }));
    try {
      await executable.install(staged);
      this.updateItem(item.id, (current) => ({ ...current, status: "installed" }));
    } catch (error) {
      this.updateItem(item.id, (current) => ({ ...current, status: "installFailed", error: readError(error) }));
    } finally {
      this.installing = false;
      this.setTask(skipItemsWithFailedDependencies(this.task));
      this.pump();
    }
  }

  private resolveIfComplete() {
    if (this.activeDownloads > 0 || this.installing) return;
    const incomplete = this.hasIncompleteItems();
    if (incomplete && (this.task.downloadPaused || this.task.installPaused)) return;
    if (incomplete) return;
    const failed = this.task.items.some(
      (item) => item.status === "downloadFailed" || item.status === "installFailed" || item.status === "skipped"
    );
    const cancelled = this.task.items.some((item) => item.status === "cancelled");
    const status = cancelled ? "cancelled" : failed ? "failed" : "done";
    if (this.task.status !== status) this.setTask({ ...this.task, status });
    const resolvers = this.doneResolvers.splice(0);
    for (const resolve of resolvers) resolve(this.task);
  }

  private updateItem(id: string, update: (item: DownloadTaskItem) => DownloadTaskItem) {
    this.setTask({
      ...this.task,
      items: this.task.items.map((item) => (item.id === id ? update(item) : item))
    });
  }

  private addExecutableItems(items: ExecutableDownloadTaskItem[]) {
    const existingIds = new Set(this.executableItems.map((item) => item.id));
    const newItems = items.filter((item) => !existingIds.has(item.id));
    const existingItemsWithNewDependencies = items.filter((item) => existingIds.has(item.id) && item.dependsOn?.length);
    if (!newItems.length) {
      this.mergeExistingItemDependencies(existingItemsWithNewDependencies);
      return items.map((item) => item.id);
    }
    this.executableItems = [...this.executableItems, ...newItems];
    this.setTask({
      ...this.task,
      items: [
        ...this.task.items,
        ...newItems.map(({ download, prepareInstall, install, ...item }) => {
          void download;
          void prepareInstall;
          void install;
          return item;
        })
      ]
    });
    this.mergeExistingItemDependencies(existingItemsWithNewDependencies);
    return items.map((item) => item.id);
  }

  private mergeExistingItemDependencies(items: ExecutableDownloadTaskItem[]) {
    if (!items.length) return;
    const dependenciesById = new Map(items.map((item) => [item.id, item.dependsOn ?? []]));
    this.setTask({
      ...this.task,
      items: this.task.items.map((item) => {
        const dependencies = dependenciesById.get(item.id);
        if (!dependencies?.length || item.status === "installed") return item;
        return {
          ...item,
          dependsOn: [...new Set([...(item.dependsOn ?? []), ...dependencies].filter((id) => id !== item.id))]
        };
      })
    });
  }

  private updateItemByOperation(operationId: string, update: (item: DownloadTaskItem) => DownloadTaskItem) {
    this.setTask({
      ...this.task,
      items: this.task.items.map((item) => (item.operationId === operationId ? update(item) : item))
    });
  }

  private setTask(task: DownloadTask) {
    this.task = task;
    this.emit();
  }

  private emit() {
    this.options.onChange?.(this.task);
  }

  private hasIncompleteItems() {
    return this.task.items.some((item) => ["queued", "downloading", "downloaded", "waitingInstall", "installing"].includes(item.status));
  }
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "任务失败");
}
