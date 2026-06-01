import { ChevronDown, ChevronRight, Search, SlidersHorizontal, ToggleLeft, ToggleRight, UserRound } from "lucide-react";
import { useState } from "react";
import type { ActiveView, EnabledFilter, ProgressFilter, SortKey } from "../viewTypes";
import { Select } from "./common";

type SidebarProps = {
  activeView: ActiveView;
  enabledFilter: EnabledFilter;
  helperMapCount: number;
  progressFilter: ProgressFilter;
  query: string;
  referencedModCount: number;
  showHelperMaps: boolean;
  showOnlyUnreferencedMods: boolean;
  sortKey: SortKey;
  onActiveViewChange: (view: ActiveView) => void;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  onProgressFilterChange: (value: ProgressFilter) => void;
  onQueryChange: (value: string) => void;
  onShowHelperMapsChange: (value: boolean) => void;
  onShowOnlyUnreferencedModsChange: (value: boolean) => void;
  onSortKeyChange: (value: SortKey) => void;
};

export function Sidebar({
  activeView,
  enabledFilter,
  helperMapCount,
  progressFilter,
  query,
  referencedModCount,
  showHelperMaps,
  showOnlyUnreferencedMods,
  sortKey,
  onActiveViewChange,
  onEnabledFilterChange,
  onProgressFilterChange,
  onQueryChange,
  onShowHelperMapsChange,
  onShowOnlyUnreferencedModsChange,
  onSortKeyChange
}: SidebarProps) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const filterCount =
    Number(query.trim().length > 0) +
    Number(enabledFilter !== "all") +
    Number(activeView === "maps" ? progressFilter !== "all" : progressFilter === "warnings") +
    Number(activeView === "maps" && sortKey !== "name") +
    Number(activeView === "maps" && showHelperMaps) +
    Number(activeView === "mods" && showOnlyUnreferencedMods);

  return (
    <aside className="sidebar">
      <div className="panel">
        <div className="segmented">
          <button className={activeView === "maps" ? "active" : ""} onClick={() => onActiveViewChange("maps")}>
            地图
          </button>
          <button className={activeView === "mods" ? "active" : ""} onClick={() => onActiveViewChange("mods")}>
            其他 Mod
          </button>
          <button className={activeView === "profiles" ? "active" : ""} onClick={() => onActiveViewChange("profiles")}>
            <UserRound size={16} />
            Profile
          </button>
        </div>
      </div>

      {activeView !== "profiles" && (
        <div className="panel filter-panel">
          <button className="filter-toggle" onClick={() => setFiltersExpanded((value) => !value)}>
            {filtersExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            <SlidersHorizontal size={17} />
            筛选
            {filterCount > 0 && <small>{filterCount} 项</small>}
          </button>
          {!filtersExpanded && (
            <p className="filter-summary">
              {filterCount > 0 ? "筛选条件已生效，展开可调整。" : "筛选已折叠。"}
            </p>
          )}
          {filtersExpanded && (
            <div className="filter-content">
              <label className="search-box">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder={activeView === "maps" ? "搜索地图、SID" : "搜索 Mod、依赖"}
                />
              </label>
              <Select label="启用状态" value={enabledFilter} onChange={(value) => onEnabledFilterChange(value as EnabledFilter)}>
                <option value="all">全部</option>
                <option value="enabled">仅启用</option>
                <option value="disabled">仅禁用</option>
              </Select>
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
                  <Select
                    label="警告"
                    value={progressFilter === "warnings" ? "warnings" : "all"}
                    onChange={(value) => onProgressFilterChange(value as ProgressFilter)}
                  >
                    <option value="all">全部 Mod</option>
                    <option value="warnings">有警告</option>
                  </Select>
                  <button
                    className={showOnlyUnreferencedMods ? "inline-toggle active" : "inline-toggle"}
                    onClick={() => onShowOnlyUnreferencedModsChange(!showOnlyUnreferencedMods)}
                    title="只显示没有被地图或其他 Mod 声明为依赖的 Mod"
                  >
                    {showOnlyUnreferencedMods ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    不被依赖
                    <small>{referencedModCount}</small>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
