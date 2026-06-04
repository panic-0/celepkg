import type { StagedDownload } from "../types";
import {
  activeDownloadOperationIds,
  createDownloadTask,
  markTaskCancelling,
  selectNextInstallItem,
  selectQueuedItemsForDownload,
  skipItemsWithFailedDependencies,
  type DownloadTask,
  type DownloadTaskItem
} from "./downloadTask";

export type ExecutableDownloadTaskItem = DownloadTaskItem & {
  download: (operationId: string, taskIndex: number, taskTotal: number) => Promise<StagedDownload>;
  install: (staged: StagedDownload) => Promise<void>;
};

export type DownloadTaskRunnerOptions = {
  concurrencyLimit?: number;
  createOperationId: (item: DownloadTaskItem) => string;
  cancelOperation: (operationId: string) => Promise<unknown>;
  onChange?: (task: DownloadTask) => void;
};

export class DownloadTaskRunner {
  private readonly executableItems: ExecutableDownloadTaskItem[];
  private readonly stagedByItemId = new Map<string, StagedDownload>();
  private readonly options: DownloadTaskRunnerOptions;
  private activeDownloads = 0;
  private installing = false;
  private resolveDone: ((task: DownloadTask) => void) | null = null;
  private task: DownloadTask;

  constructor(id: string, items: ExecutableDownloadTaskItem[], options: DownloadTaskRunnerOptions) {
    this.executableItems = items;
    this.options = options;
    this.task = createDownloadTask(
      id,
      items.map(({ download, install, ...item }) => item),
      options.concurrencyLimit
    );
  }

  snapshot() {
    return this.task;
  }

  start(): Promise<DownloadTask> {
    if (this.resolveDone) return new Promise((resolve) => resolve(this.task));
    this.emit();
    this.pump();
    return new Promise((resolve) => {
      this.resolveDone = resolve;
      this.resolveIfComplete();
    });
  }

  async cancel() {
    this.setTask(markTaskCancelling(this.task));
    await Promise.allSettled(activeDownloadOperationIds(this.task).map((operationId) => this.options.cancelOperation(operationId)));
    this.resolveIfComplete();
  }

  applyProgress(operationId: string, progress: DownloadTaskItem["progress"]) {
    this.updateItemByOperation(operationId, (item) => ({ ...item, progress }));
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
    if (!executable || this.task.cancelRequested) return;
    const operationId = this.options.createOperationId(executable);
    const taskIndex = this.executableItems.findIndex((item) => item.id === itemId) + 1;
    const taskTotal = this.executableItems.length;
    this.activeDownloads += 1;
    this.updateItem(itemId, (item) => ({ ...item, status: "downloading", operationId }));
    try {
      const staged = await executable.download(operationId, taskIndex, taskTotal);
      if (this.task.cancelRequested) {
        this.updateItem(itemId, (item) => ({ ...item, status: "cancelled", error: "已取消" }));
      } else {
        this.stagedByItemId.set(itemId, staged);
        this.updateItem(itemId, (item) => ({ ...item, status: "downloaded" }));
      }
    } catch (error) {
      this.updateItem(itemId, (item) => ({ ...item, status: this.task.cancelRequested ? "cancelled" : "downloadFailed", error: readError(error) }));
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
    const incomplete = this.task.items.some((item) =>
      ["queued", "downloading", "downloaded", "waitingInstall", "installing"].includes(item.status)
    );
    if (incomplete) return;
    const failed = this.task.items.some((item) => item.status === "downloadFailed" || item.status === "installFailed" || item.status === "skipped");
    const cancelled = this.task.items.some((item) => item.status === "cancelled");
    const status = cancelled ? "cancelled" : failed ? "failed" : "done";
    if (this.task.status !== status) this.setTask({ ...this.task, status });
    this.resolveDone?.(this.task);
  }

  private updateItem(id: string, update: (item: DownloadTaskItem) => DownloadTaskItem) {
    this.setTask({
      ...this.task,
      items: this.task.items.map((item) => (item.id === id ? update(item) : item))
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
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "任务失败");
}
