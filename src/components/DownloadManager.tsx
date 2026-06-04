import { DownloadCloud } from "lucide-react";
import { DownloadTaskPanel } from "./DownloadTaskPanel";
import type { DownloadTask } from "../utils/downloadTask";

type DownloadManagerProps = {
  task: DownloadTask | null;
  onCancelTask: () => void;
};

export function DownloadManager({ task, onCancelTask }: DownloadManagerProps) {
  return (
    <section className="download-manager">
      <div className="list-header">
        <div>
          <h2>下载管理</h2>
          <p>{task ? formatTaskStatus(task.status) : "暂无下载任务"}</p>
        </div>
      </div>
      {task ? (
        <DownloadTaskPanel task={task} onCancel={onCancelTask} />
      ) : (
        <div className="empty-state download-manager-empty">
          <DownloadCloud size={30} />
          <p>没有正在进行或最近完成的下载任务。</p>
        </div>
      )}
    </section>
  );
}

function formatTaskStatus(status: DownloadTask["status"]) {
  if (status === "running") return "任务正在运行";
  if (status === "cancelling") return "正在取消任务";
  if (status === "cancelled") return "任务已取消";
  if (status === "failed") return "任务已完成，有失败项目";
  return "任务已完成";
}
