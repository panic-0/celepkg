import { X } from "lucide-react";
import type { ModDownloadProgress } from "../types";

type DownloadProgressStripProps = {
  batchLabel?: string;
  className?: string;
  doneLabel?: string;
  errorLabel?: string;
  progress: ModDownloadProgress | null;
  onCancel: () => void;
};

export function DownloadProgressStrip({
  batchLabel = "",
  className = "",
  doneLabel = "已更新",
  errorLabel = "更新失败",
  progress,
  onCancel
}: DownloadProgressStripProps) {
  const percent =
    progress?.total && progress.total > 0 ? Math.max(0, Math.min(100, Math.round((progress.downloaded / progress.total) * 100))) : null;
  const active = Boolean(progress);
  const classes = ["record-download-progress-slot", className, active ? "active" : ""].filter(Boolean).join(" ");

  return (
    <div className={classes} aria-live="polite">
      {progress && (
        <>
          <div className="record-download-progress-copy">
            <span>{formatDownloadProgressText(progress, percent, batchLabel, doneLabel, errorLabel)}</span>
            {progress.phase === "downloading" && <small>{formatDownloadProgressMeta(progress, percent)}</small>}
            {progress.phase === "downloading" && (
              <button className="record-download-cancel-button" onClick={onCancel} title="取消下载" type="button">
                <X size={13} />
              </button>
            )}
          </div>
          <div
            className={percent === null && progress.phase === "downloading" ? "record-download-bar indeterminate" : "record-download-bar"}
          >
            <span style={{ width: `${progress.phase === "done" ? 100 : (percent ?? 35)}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

function formatDownloadProgressText(
  progress: ModDownloadProgress,
  percent: number | null,
  batchLabel: string,
  doneLabel: string,
  errorLabel: string
) {
  const task = progress.taskTotal > 1 ? ` (${progress.taskIndex}/${progress.taskTotal})` : "";
  const batch = task || (batchLabel ? ` ${batchLabel}` : "");
  const modName = progress.modName || "Mod";
  if (progress.phase === "verifying") return `正在校验 ${modName}${batch}`;
  if (progress.phase === "installing") return `正在安装 ${modName}${batch}`;
  if (progress.phase === "done") return `${doneLabel} ${modName}${batch}`;
  if (progress.phase === "error") return `${errorLabel} ${modName}${batch}`;
  return `正在下载 ${modName}${batch}${percent === null ? "" : ` ${percent}%`}`;
}

function formatDownloadProgressMeta(progress: ModDownloadProgress, percent: number | null) {
  const bytes =
    percent === null ? formatBytes(progress.downloaded) : `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total ?? 0)}`;
  const speed = progress.speedBytesPerSec > 0 ? ` · ${formatBytes(progress.speedBytesPerSec)}/s` : "";
  return `${bytes}${speed}`;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}
