import { Archive, Download, Gamepad2, Mountain, PackageSearch, Settings2, UserRound } from "lucide-react";
import type { DownloadTask } from "../utils/downloadTask";
import { summarizeDownloadTaskProgress } from "../utils/downloadTask";
import type { ActiveView } from "../viewTypes";

type WorkspaceNavProps = {
  activeView: ActiveView;
  dependencyModCount: number;
  downloadTask: DownloadTask | null;
  enabledMapCount: number;
  enabledModCount: number;
  mapDependencyModCount: number;
  mapProfileName: string;
  modProfileName: string;
  totalMapCount: number;
  totalModCount: number;
  onActiveViewChange: (view: ActiveView) => void;
};

export function WorkspaceNav({
  activeView,
  dependencyModCount,
  downloadTask,
  enabledMapCount,
  enabledModCount,
  mapDependencyModCount,
  mapProfileName,
  modProfileName,
  totalMapCount,
  totalModCount,
  onActiveViewChange
}: WorkspaceNavProps) {
  const downloadProgress = summarizeDownloadTaskProgress(downloadTask);

  return (
    <aside className="workspace-nav">
      <section className="nav-section" aria-labelledby="nav-content-management">
        <div className="nav-section-title" id="nav-content-management">
          内容管理
        </div>
        <button
          className={activeView === "maps" || activeView === "mods" ? "nav-item active" : "nav-item"}
          onClick={() => onActiveViewChange(activeView === "mods" ? "mods" : "maps")}
        >
          <Gamepad2 size={18} />
          <span>本地内容</span>
          <strong
            className="nav-count"
            title={`${enabledMapCount} / ${totalMapCount} 地图启用，${enabledModCount} / ${totalModCount} Mod 启用`}
          >
            {enabledMapCount + enabledModCount} / {totalMapCount + totalModCount}
          </strong>
        </button>
        <button className={activeView === "profiles" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("profiles")}>
          <UserRound size={18} />
          <span>Profile</span>
        </button>
        <div className="nav-profile-summary" aria-label="当前 Profile">
          <button
            className={activeView === "profiles" ? "nav-summary-item active" : "nav-summary-item"}
            onClick={() => onActiveViewChange("profiles")}
            title="打开 Profile 管理"
            type="button"
          >
            <span className="nav-summary-label">地图</span>
            <span className="nav-summary-badge">{`${enabledMapCount} / ${totalMapCount}`}</span>
            <strong className="nav-summary-name" title={mapProfileName || "未选择"}>
              {mapProfileName || "未选择"}
            </strong>
            <small>{`${mapDependencyModCount} 个依赖 Mod`}</small>
          </button>
          <button
            className={activeView === "profiles" ? "nav-summary-item active" : "nav-summary-item"}
            onClick={() => onActiveViewChange("profiles")}
            title="打开 Profile 管理"
            type="button"
          >
            <span className="nav-summary-label">Mod</span>
            <span className="nav-summary-badge">{`${enabledModCount} / ${totalModCount}`}</span>
            <strong className="nav-summary-name" title={modProfileName || "未选择"}>
              {modProfileName || "未选择"}
            </strong>
            <small>{`${dependencyModCount} 个推导依赖`}</small>
          </button>
        </div>
      </section>

      <section className="nav-section" aria-labelledby="nav-install-management">
        <div className="nav-section-title" id="nav-install-management">
          获取与安装
        </div>
        <button className={activeView === "catalog" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("catalog")}>
          <PackageSearch size={18} />
          <span>Mod 获取</span>
        </button>
        <button
          aria-label="下载管理"
          className={activeView === "downloads" ? "nav-item active" : "nav-item"}
          onClick={() => onActiveViewChange("downloads")}
          title={downloadProgress?.detail}
        >
          <Download size={18} />
          <span>下载管理</span>
          {downloadProgress && (
            <strong className={`nav-task-badge ${downloadProgress.tone}`} title={downloadProgress.detail}>
              {downloadProgress.badge}
            </strong>
          )}
        </button>
        <button className={activeView === "everest" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("everest")}>
          <Mountain size={18} />
          <span>Everest</span>
        </button>
      </section>

      <section className="nav-section" aria-labelledby="nav-maintenance">
        <div className="nav-section-title" id="nav-maintenance">
          维护
        </div>
        <button className={activeView === "backups" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("backups")}>
          <Archive size={18} />
          <span>备份还原</span>
        </button>
        <button className={activeView === "settings" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("settings")}>
          <Settings2 size={18} />
          <span>设置</span>
        </button>
      </section>
    </aside>
  );
}
