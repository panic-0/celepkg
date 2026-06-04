import { Download, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listEverestReleases } from "../api";
import { DownloadTaskPanel } from "./DownloadTaskPanel";
import type { AppNotifier, EverestRelease, EverestReleaseList, ModDownloadProgress, ModRecord } from "../types";
import type { DownloadTask } from "../utils/downloadTask";
import { readError } from "../utils/format";

type EverestManagerProps = {
  downloadTask: DownloadTask | null;
  loading: boolean;
  mods: ModRecord[];
  notifier: AppNotifier;
  progress: ModDownloadProgress | null;
  onCancelDownloadTask: () => void;
  onCancelDownload: () => void;
  onInstall: (release: EverestRelease) => void;
};

const channels = [
  { key: "stable", label: "Stable" },
  { key: "beta", label: "Beta" },
  { key: "dev", label: "Dev" }
];

export function EverestManager({
  downloadTask,
  loading,
  mods,
  notifier,
  progress,
  onCancelDownloadTask,
  onCancelDownload,
  onInstall
}: EverestManagerProps) {
  const [releaseList, setReleaseList] = useState<EverestReleaseList>({ releases: [], warnings: [] });
  const [activeChannel, setActiveChannel] = useState("stable");
  const [loadingReleases, setLoadingReleases] = useState(false);
  const currentEverest = mods.find((mod) => mod.name.toLowerCase() === "everest");
  const currentEverestCore = mods.find((mod) => mod.name.toLowerCase() === "everestcore");
  const currentVersion = currentEverest?.metadata.version || currentEverestCore?.metadata.version || "";
  const currentBuild = parseEverestBuild(currentVersion);
  const channelReleases = useMemo(
    () => releaseList.releases.filter((release) => release.branch.toLowerCase() === activeChannel),
    [activeChannel, releaseList.releases]
  );

  const refreshReleases = useCallback(async () => {
    setLoadingReleases(true);
    try {
      const result = await listEverestReleases();
      setReleaseList(result);
      if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
    } catch (error) {
      notifier.showError(readError(error));
    } finally {
      setLoadingReleases(false);
    }
  }, [notifier]);

  useEffect(() => {
    void refreshReleases();
  }, [refreshReleases]);

  return (
    <section className="everest-manager">
      <div className="list-header">
        <div>
          <h2>Everest</h2>
          <p>{currentVersion ? `当前版本 ${currentVersion}` : "未识别到 Everest 版本"}</p>
        </div>
        <button onClick={refreshReleases} disabled={loadingReleases || loading} title="刷新 Everest 版本列表">
          <RefreshCw size={16} className={loadingReleases ? "spin-icon" : ""} />
          刷新
        </button>
      </div>

      <div className="everest-layout">
        <section className="everest-status">
          <div>
            <span>Everest</span>
            <strong>{currentEverest?.metadata.version || "未识别"}</strong>
          </div>
          <div>
            <span>EverestCore</span>
            <strong>{currentEverestCore?.metadata.version || "未识别"}</strong>
          </div>
        </section>

        <section className="everest-channel-panel">
          <div className="everest-channel-heading">
            <div className="segmented three" aria-label="Everest 通道">
              {channels.map((channel) => (
                <button
                  className={activeChannel === channel.key ? "active" : ""}
                  key={channel.key}
                  onClick={() => setActiveChannel(channel.key)}
                >
                  {channel.label}
                </button>
              ))}
            </div>
          </div>

          {downloadTask ? (
            <DownloadTaskPanel task={downloadTask} onCancel={onCancelDownloadTask} />
          ) : (
            <EverestProgress progress={progress} onCancel={onCancelDownload} />
          )}

          <div className="everest-release-list">
            {loadingReleases ? (
              <div className="empty-state compact">
                <LoaderCircle className="spin-icon" size={24} />
                <p>正在加载 Everest 版本...</p>
              </div>
            ) : channelReleases.length ? (
              channelReleases.map((release) => {
                const isCurrent = isSameVersion(currentVersion, release.version);
                const isOlder = currentBuild !== null && release.version < currentBuild;
                return (
                  <article className="everest-release-row" key={`${release.branch}:${release.version}`}>
                    <div>
                      <strong>{formatEverestVersion(release.version)}</strong>
                      <span>{formatDate(release.date)}</span>
                      <small title={release.commit}>{release.commit.slice(0, 7) || "-"}</small>
                    </div>
                    <button
                      className={isCurrent ? "everest-reinstall-button" : isOlder ? "everest-light-button" : "primary-button"}
                      disabled={loading}
                      onClick={() => onInstall(release)}
                      title={`安装 ${formatEverestVersion(release.version)}`}
                    >
                      <Download size={15} />
                      {isCurrent ? "重装" : "安装"}
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="empty-state compact">
                <Download size={24} />
                <p>这个通道暂时没有版本数据。</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function EverestProgress({ progress, onCancel }: { progress: ModDownloadProgress | null; onCancel: () => void }) {
  if (!progress || progress.modName !== "Everest") return <div className="everest-progress-slot" />;
  const percent =
    progress.total && progress.total > 0 ? Math.max(0, Math.min(100, Math.round((progress.downloaded / progress.total) * 100))) : null;
  return (
    <div className="everest-progress-slot active" aria-live="polite">
      <div className="everest-progress-copy">
        <span>{formatProgressText(progress, percent)}</span>
        {progress.phase === "downloading" && <small>{formatProgressMeta(progress, percent)}</small>}
        {progress.phase === "downloading" && (
          <button className="record-download-cancel-button" onClick={onCancel} title="取消下载" type="button">
            <X size={13} />
          </button>
        )}
      </div>
      <div className={percent === null && progress.phase === "downloading" ? "record-download-bar indeterminate" : "record-download-bar"}>
        <span style={{ width: `${progress.phase === "done" ? 100 : (percent ?? 35)}%` }} />
      </div>
    </div>
  );
}

function formatEverestVersion(version: number) {
  return `1.${version}.0`;
}

function isSameVersion(currentVersion: string, releaseVersion: number) {
  return currentVersion.trim() === formatEverestVersion(releaseVersion);
}

function parseEverestBuild(version: string) {
  const parts = version.match(/\d+/g);
  if (!parts?.length) return null;
  const build = parts.length >= 2 ? Number.parseInt(parts[1], 10) : Number.parseInt(parts[0], 10);
  return Number.isFinite(build) ? build : null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleDateString();
}

function formatProgressText(progress: ModDownloadProgress, percent: number | null) {
  if (progress.phase === "verifying") return "正在校验 Everest";
  if (progress.phase === "installing") return "正在安装 Everest";
  if (progress.phase === "done") return "Everest 安装完成";
  if (progress.phase === "error") return "Everest 安装失败";
  return `正在下载 Everest${percent === null ? "" : ` ${percent}%`}`;
}

function formatProgressMeta(progress: ModDownloadProgress, percent: number | null) {
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
