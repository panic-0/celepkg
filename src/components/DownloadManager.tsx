import { DownloadCloud } from "lucide-react";
import { DownloadTaskPanel } from "./DownloadTaskPanel";
import type { DownloadTask } from "../utils/downloadTask";

type DownloadManagerProps = {
  task: DownloadTask | null;
  onPauseDownloads: () => void;
  onResumeDownloads: () => void;
  onPauseInstalls: () => void;
  onResumeInstalls: () => void;
  onCancelDownloads: () => void;
  onCancelInstalls: () => void;
  onRetryFailed: () => void;
};

export function DownloadManager({
  task,
  onPauseDownloads,
  onResumeDownloads,
  onPauseInstalls,
  onResumeInstalls,
  onCancelDownloads,
  onCancelInstalls,
  onRetryFailed
}: DownloadManagerProps) {
  return (
    <section className="download-manager">
      <div className="list-header">
        <div>
          <h2>下载管理</h2>
          <p>{task ? formatTaskStatus(task.status, task) : "暂无下载任务"}</p>
        </div>
      </div>
      {task ? (
        <DownloadTaskPanel
          task={task}
          onPauseDownloads={onPauseDownloads}
          onResumeDownloads={onResumeDownloads}
          onPauseInstalls={onPauseInstalls}
          onResumeInstalls={onResumeInstalls}
          onCancelDownloads={onCancelDownloads}
          onCancelInstalls={onCancelInstalls}
          onRetryFailed={onRetryFailed}
        />
      ) : (
        <div className="empty-state download-manager-empty">
          <DownloadCloud size={30} />
          <p>没有正在进行或最近完成的下载任务。</p>
        </div>
      )}
    </section>
  );
}

function formatTaskStatus(status: DownloadTask["status"], task?: DownloadTask) {
  if (status === "running") {
    const downloadStatus = task?.downloadPaused ? "下载已停止" : "下载运行中";
    const installStatus = task?.installPaused ? "安装已停止" : "安装运行中";
    return `${downloadStatus} · ${installStatus}`;
  }
  if (status === "cancelling") return "正在取消任务";
  if (status === "cancelled") return "任务已取消";
  if (status === "failed") return "任务已完成，有失败项目";
  return "任务已完成";
}
