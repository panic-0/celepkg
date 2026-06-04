import { X } from "lucide-react";
import type { DownloadTask, DownloadTaskItem } from "../utils/downloadTask";
import { groupDownloadTaskItems, summarizeDownloadTask } from "../utils/downloadTask";

type DownloadTaskPanelProps = {
  task: DownloadTask | null;
  onCancel: () => void;
};

export function DownloadTaskPanel({ task, onCancel }: DownloadTaskPanelProps) {
  if (!task) return null;
  const groups = groupDownloadTaskItems(task.items);
  const summary = summarizeDownloadTask(task);
  const failureCount = summary.downloadFailed + summary.installFailed;
  const canCancel = task.status === "running" || task.status === "cancelling";

  return (
    <section className="download-task-panel" aria-label="下载任务" aria-live="polite">
      <div className="download-task-header">
        <strong>{`下载中 ${summary.downloading} · 等待安装 ${summary.waitingInstall} · 成功 ${summary.installed} · 失败 ${failureCount}`}</strong>
        <button disabled={!canCancel || task.status === "cancelling"} onClick={onCancel} type="button">
          <X size={14} />
          {task.status === "cancelling" ? "正在取消" : "取消任务"}
        </button>
      </div>
      <div className="download-task-lists">
        <TaskGroup title="下载中" items={groups.downloading} emptyText="没有正在下载的项目" />
        <TaskGroup title="下载失败" items={groups.downloadFailed} emptyText="没有下载失败" />
        <TaskGroup title="等待安装" items={groups.waitingInstall} emptyText="没有等待安装" />
        <TaskGroup title="安装成功" items={groups.installed} emptyText="没有安装成功" />
        <TaskGroup title="安装失败" items={groups.installFailed} emptyText="没有安装失败" />
      </div>
    </section>
  );
}

function TaskGroup({ emptyText, items, title }: { emptyText: string; items: DownloadTaskItem[]; title: string }) {
  return (
    <div className="download-task-group">
      <h3>{`${title} ${items.length}`}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>
                <strong title={item.name}>{item.name}</strong>
                <small>{formatTaskItemKind(item.kind)}</small>
              </span>
              <em>{formatTaskItemMeta(item)}</em>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </div>
  );
}

function formatTaskItemMeta(item: DownloadTaskItem) {
  if (item.error) return item.error;
  if (item.status === "queued") return "等待下载";
  if (item.status === "downloaded") return "等待安装";
  if (item.status === "waitingInstall") return "等待依赖";
  if (item.status === "installing") return "正在安装";
  if (item.status === "installed") return "已安装";
  if (item.status === "cancelled") return "已取消";
  if (item.status === "skipped") return "因依赖失败跳过";
  if (item.status === "downloadFailed") return "下载失败";
  if (item.status === "installFailed") return "安装失败";
  const progress = item.progress;
  if (!progress) return "准备下载";
  const percent = progress.total && progress.total > 0 ? Math.round((progress.downloaded / progress.total) * 100) : null;
  const speed = progress.speedBytesPerSec > 0 ? ` · ${formatBytes(progress.speedBytesPerSec)}/s` : "";
  return percent === null ? `${formatBytes(progress.downloaded)}${speed}` : `${percent}%${speed}`;
}

function formatTaskItemKind(kind: DownloadTaskItem["kind"]) {
  return kind === "everest" ? "Everest" : "Mod";
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}
