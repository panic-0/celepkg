import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listEverestReleases } from "../api";
import type { AppNotifier, EverestRelease, EverestReleaseList, ModRecord } from "../types";
import { readError } from "../utils/format";

type EverestManagerProps = {
  loading: boolean;
  mods: ModRecord[];
  notifier: AppNotifier;
  onInstall: (release: EverestRelease) => void;
};

const channels = [
  { key: "stable", label: "Stable" },
  { key: "beta", label: "Beta" },
  { key: "dev", label: "Dev" }
];

export function EverestManager({ loading, mods, notifier, onInstall }: EverestManagerProps) {
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
