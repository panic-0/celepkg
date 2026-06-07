import {
  ArrowDownAZ,
  ArrowUpAZ,
  Archive,
  Download,
  Gamepad2,
  Mountain,
  PackageSearch,
  Settings2,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  UserRound
} from "lucide-react";
import type { MapDetailControls } from "../hooks/useMapDetailControls";
import type { MapDetailTab } from "../hooks/useUiLayout";
import type { DownloadTask } from "../utils/downloadTask";
import { summarizeDownloadTaskProgress } from "../utils/downloadTask";
import type { SubMapSortKey } from "../utils/subMapSorting";
import type { ActiveView } from "../viewTypes";
import { SearchBox, Select } from "./common";

type WorkspaceNavProps = {
  activeView: ActiveView;
  dependencyModCount: number;
  downloadTask: DownloadTask | null;
  enabledMapCount: number;
  enabledModCount: number;
  mapDependencyModCount: number;
  mapProfileName: string;
  modProfileName: string;
  mainMode: "list" | "detail";
  mapDetailControls: MapDetailControls;
  mapDetailTab: MapDetailTab;
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
  mainMode,
  mapDetailControls,
  mapDetailTab,
  totalMapCount,
  totalModCount,
  onActiveViewChange
}: WorkspaceNavProps) {
  const showsSubMapFilters = activeView === "maps" && mainMode === "detail" && mapDetailTab === "submaps";
  const downloadProgress = summarizeDownloadTaskProgress(downloadTask);
  const filterCount =
    Number(mapDetailControls.subMapQuery.trim().length > 0) +
    Number(mapDetailControls.subMapSortKey !== "file") +
    Number(mapDetailControls.subMapSortDescending) +
    Number(!mapDetailControls.groupSubMapsByDifficulty);

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

      {showsSubMapFilters && (
        <section className="nav-section filter-dock">
          <div className="filter-heading">
            <SlidersHorizontal size={17} />
            <span>小图筛选</span>
            {filterCount > 0 && <small>{filterCount}</small>}
          </div>
          <SubMapFilters controls={mapDetailControls} />
        </section>
      )}
    </aside>
  );
}

function SubMapFilters({ controls }: { controls: MapDetailControls }) {
  return (
    <div className="filter-content">
      <SearchBox value={controls.subMapQuery} onChange={controls.updateSubMapQuery} placeholder="搜索小图名称、SID" />
      <Select label="排序" value={controls.subMapSortKey} onChange={(value) => controls.updateSubMapSortKey(value as SubMapSortKey)}>
        <option value="file">文件顺序</option>
        <option value="name">名称</option>
        <option value="completion">完成</option>
        <option value="deaths">死亡</option>
        <option value="time">用时</option>
        <option value="strawberries">草莓</option>
      </Select>
      <button
        className={controls.subMapSortDescending ? "inline-toggle active" : "inline-toggle"}
        onClick={() => controls.updateSubMapSortDescending(!controls.subMapSortDescending)}
        title="反转当前排序关键字的组内顺序"
      >
        {controls.subMapSortDescending ? <ArrowDownAZ size={18} /> : <ArrowUpAZ size={18} />}
        倒序
      </button>
      <button
        className={controls.groupSubMapsByDifficulty ? "inline-toggle active" : "inline-toggle"}
        onClick={() => controls.updateGroupSubMapsByDifficulty(!controls.groupSubMapsByDifficulty)}
        title="先按 Easy、Medium、Hard、高难组分组，再按排序关键字排列"
      >
        {controls.groupSubMapsByDifficulty ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
        按难度分组
      </button>
    </div>
  );
}
