import {
  ArrowDownAZ,
  ArrowUpAZ,
  Archive,
  Download,
  Gamepad2,
  Mountain,
  PackageSearch,
  Search,
  Settings2,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  UserRound
} from "lucide-react";
import type { MapDetailControls } from "../hooks/useMapDetailControls";
import type { MapDetailTab } from "../hooks/useUiLayout";
import type { SubMapSortKey } from "../utils/subMapSorting";
import type { ActiveView, EnabledFilter, ProgressFilter, ReferenceFilter, SortKey } from "../viewTypes";
import { Select } from "./common";

type WorkspaceNavProps = {
  activeView: ActiveView;
  dependencyModCount: number;
  enabledFilter: EnabledFilter;
  enabledMapCount: number;
  enabledModCount: number;
  helperMapCount: number;
  mapProfileName: string;
  modProfileName: string;
  progressFilter: ProgressFilter;
  query: string;
  referenceFilter: ReferenceFilter;
  showHelperMaps: boolean;
  sortKey: SortKey;
  mainMode: "list" | "detail";
  mapDetailControls: MapDetailControls;
  mapDetailTab: MapDetailTab;
  totalMapCount: number;
  totalModCount: number;
  onActiveViewChange: (view: ActiveView) => void;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  onProgressFilterChange: (value: ProgressFilter) => void;
  onQueryChange: (value: string) => void;
  onReferenceFilterChange: (value: ReferenceFilter) => void;
  onShowHelperMapsChange: (value: boolean) => void;
  onSortKeyChange: (value: SortKey) => void;
};

export function WorkspaceNav({
  activeView,
  dependencyModCount,
  enabledFilter,
  enabledMapCount,
  enabledModCount,
  helperMapCount,
  mapProfileName,
  modProfileName,
  progressFilter,
  query,
  referenceFilter,
  showHelperMaps,
  sortKey,
  mainMode,
  mapDetailControls,
  mapDetailTab,
  totalMapCount,
  totalModCount,
  onActiveViewChange,
  onEnabledFilterChange,
  onProgressFilterChange,
  onQueryChange,
  onReferenceFilterChange,
  onShowHelperMapsChange,
  onSortKeyChange
}: WorkspaceNavProps) {
  const showsRecordFilters = activeView === "maps" || activeView === "mods";
  const showsSubMapFilters = activeView === "maps" && mainMode === "detail" && mapDetailTab === "submaps";
  const filterTitle = showsSubMapFilters ? "小图筛选" : activeView === "maps" ? "地图筛选" : "Mod 筛选";
  const filterCount = showsSubMapFilters
    ? Number(mapDetailControls.subMapQuery.trim().length > 0) +
      Number(mapDetailControls.subMapSortKey !== "file") +
      Number(mapDetailControls.subMapSortDescending) +
      Number(!mapDetailControls.groupSubMapsByDifficulty)
    : Number(query.trim().length > 0) +
      Number(enabledFilter !== "all") +
      Number(activeView === "maps" ? progressFilter !== "all" : progressFilter === "warnings") +
      Number(activeView === "maps" && sortKey !== "name") +
      Number(activeView === "maps" && showHelperMaps) +
      Number(activeView === "mods" && referenceFilter !== "all");

  return (
    <aside className="workspace-nav">
      <section className="nav-section">
        <button
          className={activeView === "maps" || activeView === "mods" ? "nav-item active" : "nav-item"}
          onClick={() => onActiveViewChange(activeView === "mods" ? "mods" : "maps")}
        >
          <Gamepad2 size={18} />
          <span>本地内容</span>
          <strong
            className="nav-count"
            title={`${enabledMapCount}/${totalMapCount} 地图启用，${enabledModCount}/${totalModCount} Mod 启用`}
          >
            {enabledMapCount + enabledModCount}/{totalMapCount + totalModCount}
          </strong>
        </button>
        <button className={activeView === "everest" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("everest")}>
          <Mountain size={18} />
          <span>Everest</span>
        </button>
        <button className={activeView === "catalog" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("catalog")}>
          <PackageSearch size={18} />
          <span>下载 Mod</span>
        </button>
        <button className={activeView === "downloads" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("downloads")}>
          <Download size={18} />
          <span>下载管理</span>
        </button>
        <button className={activeView === "profiles" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("profiles")}>
          <UserRound size={18} />
          <span>Profile</span>
        </button>
        <button className={activeView === "settings" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("settings")}>
          <Settings2 size={18} />
          <span>设置</span>
        </button>
        <button className={activeView === "backups" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("backups")}>
          <Archive size={18} />
          <span>备份还原</span>
        </button>
      </section>

      <section className="nav-summary">
        <div>
          <span>地图 Profile</span>
          <strong title={mapProfileName || "未选择"}>{mapProfileName || "未选择"}</strong>
          <small>{`${enabledMapCount}/${totalMapCount} 地图`}</small>
        </div>
        <div>
          <span>Mod Profile</span>
          <strong title={modProfileName || "未选择"}>{modProfileName || "未选择"}</strong>
          <small>{`${enabledModCount}/${totalModCount} Mod，${dependencyModCount} 依赖`}</small>
        </div>
      </section>

      {showsRecordFilters && (
        <section className="nav-section filter-dock">
          <div className="filter-heading">
            <SlidersHorizontal size={17} />
            <span>{filterTitle}</span>
            {filterCount > 0 && <small>{filterCount}</small>}
          </div>
          {showsSubMapFilters ? (
            <SubMapFilters controls={mapDetailControls} />
          ) : (
            <div className="filter-content">
              <label className="search-box">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder={activeView === "maps" ? "搜索地图、SID" : "搜索 Mod、依赖"}
                />
              </label>
              <EnabledFilterControl value={enabledFilter} onChange={onEnabledFilterChange} />
              {activeView === "maps" ? (
                <>
                  <Select label="进度" value={progressFilter} onChange={(value) => onProgressFilterChange(value as ProgressFilter)}>
                    <option value="all">全部进度</option>
                    <option value="completed">已完成</option>
                    <option value="unfinished">未完成</option>
                    <option value="withStats">有存档统计</option>
                    <option value="warnings">有依赖警告</option>
                  </Select>
                  <Select label="排序" value={sortKey} onChange={(value) => onSortKeyChange(value as SortKey)}>
                    <option value="name">名称</option>
                    <option value="deaths">死亡数</option>
                    <option value="time">用时</option>
                    <option value="strawberries">草莓</option>
                  </Select>
                  <button
                    className={showHelperMaps ? "inline-toggle active" : "inline-toggle"}
                    onClick={() => onShowHelperMapsChange(!showHelperMaps)}
                    title="显示 Helper 或代码 Mod 附带的测试地图"
                  >
                    {showHelperMaps ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    Helper 测试图
                    <small>{helperMapCount}</small>
                  </button>
                </>
              ) : (
                <>
                  <ReferenceFilterControl value={referenceFilter} onChange={onReferenceFilterChange} />
                  <Select
                    label="警告"
                    value={progressFilter === "warnings" ? "warnings" : "all"}
                    onChange={(value) => onProgressFilterChange(value as ProgressFilter)}
                  >
                    <option value="all">全部 Mod</option>
                    <option value="warnings">有警告</option>
                  </Select>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </aside>
  );
}

function EnabledFilterControl({ value, onChange }: { value: EnabledFilter; onChange: (value: EnabledFilter) => void }) {
  return (
    <div className="filter-segmented-field">
      <span className="filter-segmented-label">启用状态</span>
      <div className="filter-segmented" aria-label="启用状态">
        <button className={value === "all" ? "active" : ""} onClick={() => onChange("all")} title="显示全部条目">
          全部
        </button>
        <button className={value === "enabled" ? "active" : ""} onClick={() => onChange("enabled")} title="只显示当前 Profile 中启用的条目">
          仅启用
        </button>
        <button
          className={value === "disabled" ? "active" : ""}
          onClick={() => onChange("disabled")}
          title="只显示当前 Profile 中禁用的条目"
        >
          仅禁用
        </button>
      </div>
    </div>
  );
}

function ReferenceFilterControl({ value, onChange }: { value: ReferenceFilter; onChange: (value: ReferenceFilter) => void }) {
  return (
    <div className="filter-segmented-field">
      <span className="filter-segmented-label">依赖关系</span>
      <div className="filter-segmented" aria-label="依赖关系">
        <button className={value === "all" ? "active" : ""} onClick={() => onChange("all")} title="显示全部 Mod">
          全部
        </button>
        <button
          className={value === "unreferenced" ? "active" : ""}
          onClick={() => onChange("unreferenced")}
          title="只显示没有被地图或其他 Mod 声明为必需依赖的 Mod"
        >
          不被依赖
        </button>
        <button
          className={value === "unreferencedAndOptional" ? "active" : ""}
          onClick={() => onChange("unreferencedAndOptional")}
          title="只显示没有被声明为必需依赖或可选依赖的 Mod"
        >
          不被依赖与可选依赖
        </button>
      </div>
    </div>
  );
}

function SubMapFilters({ controls }: { controls: MapDetailControls }) {
  return (
    <div className="filter-content">
      <label className="search-box">
        <Search size={17} />
        <input
          value={controls.subMapQuery}
          onChange={(event) => controls.updateSubMapQuery(event.target.value)}
          placeholder="搜索小图名称、SID"
        />
      </label>
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
