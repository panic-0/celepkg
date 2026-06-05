import { DownloadTaskPanel } from "./DownloadTaskPanel";
import type { DownloadTask } from "../utils/downloadTask";

type DownloadManagerProps = {
  task: DownloadTask | null;
  downloadPaused: boolean;
  installPaused: boolean;
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
  downloadPaused,
  installPaused,
  onPauseDownloads,
  onResumeDownloads,
  onPauseInstalls,
  onResumeInstalls,
  onCancelDownloads,
  onCancelInstalls,
  onRetryFailed
}: DownloadManagerProps) {
  const displayTask: DownloadTask = task ?? {
    id: "download-controls",
    status: "running",
    concurrencyLimit: 3,
    downloadPaused,
    installPaused,
    items: []
  };

  return (
    <section className="ui-panel download-manager">
      <div className="list-header">
        <div>
          <h2>下载管理</h2>
          <p>{formatTaskStatus(displayTask.status, displayTask)}</p>
        </div>
      </div>
      <DownloadTaskPanel
        task={displayTask}
        onPauseDownloads={onPauseDownloads}
        onResumeDownloads={onResumeDownloads}
        onPauseInstalls={onPauseInstalls}
        onResumeInstalls={onResumeInstalls}
        onCancelDownloads={onCancelDownloads}
        onCancelInstalls={onCancelInstalls}
        onRetryFailed={onRetryFailed}
      />
    </section>
  );
}

function formatTaskStatus(status: DownloadTask["status"], task?: DownloadTask) {
  if (status === "running") {
    const downloadStatus = task?.downloadPaused ? "下载已停止" : "下载运行中";
    const installStatus = task?.installPaused ? "安装已停止" : "安装运行中";
    return `${downloadStatus} · ${installStatus}`;
  }
  if (status === "cancelled") return "任务已取消";
  if (status === "failed") return "任务已完成，有失败项目";
  return "任务已完成";
}
