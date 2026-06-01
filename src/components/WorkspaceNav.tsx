import {
  Archive,
  ChevronDown,
  ChevronRight,
  Gamepad2,
  Layers,
  Search,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  UserRound
} from "lucide-react";
import { useState } from "react";
import type { SaveFileInfo } from "../types";
import type { ActiveView, EnabledFilter, ProgressFilter, SortKey } from "../viewTypes";
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
  referencedModCount: number;
  saveFiles: SaveFileInfo[];
  selectedSaveFiles: string[];
  showHelperMaps: boolean;
  showOnlyUnreferencedMods: boolean;
  showWarningColumn: boolean;
  sortKey: SortKey;
  totalMapCount: number;
  totalModCount: number;
  onActiveViewChange: (view: ActiveView) => void;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  onProgressFilterChange: (value: ProgressFilter) => void;
  onQueryChange: (value: string) => void;
  onSelectedSaveFilesChange: (value: string[]) => void;
  onShowHelperMapsChange: (value: boolean) => void;
  onShowOnlyUnreferencedModsChange: (value: boolean) => void;
  onShowWarningColumnChange: (value: boolean) => void;
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
  referencedModCount,
  saveFiles,
  selectedSaveFiles,
  showHelperMaps,
  showOnlyUnreferencedMods,
  showWarningColumn,
  sortKey,
  totalMapCount,
  totalModCount,
  onActiveViewChange,
  onEnabledFilterChange,
  onProgressFilterChange,
  onQueryChange,
  onSelectedSaveFilesChange,
  onShowHelperMapsChange,
  onShowOnlyUnreferencedModsChange,
  onShowWarningColumnChange,
  onSortKeyChange
}: WorkspaceNavProps) {
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const showsRecordFilters = activeView === "maps" || activeView === "mods";
  const selectedSaveSet = new Set(selectedSaveFiles);
  const filterCount =
    Number(query.trim().length > 0) +
    Number(enabledFilter !== "all") +
    Number(activeView === "maps" ? progressFilter !== "all" : progressFilter === "warnings") +
    Number(activeView === "maps" && sortKey !== "name") +
    Number(activeView === "maps" && showHelperMaps) +
    Number(activeView === "mods" && showOnlyUnreferencedMods);

  return (
    <aside className="workspace-nav">
      <section className="nav-section">
        <button className={activeView === "maps" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("maps")}>
          <Gamepad2 size={18} />
          <span>地图</span>
          <strong>{totalMapCount}</strong>
        </button>
        <button className={activeView === "mods" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("mods")}>
          <Layers size={18} />
          <span>其他 Mod</span>
          <strong>{totalModCount}</strong>
        </button>
        <button className={activeView === "profiles" ? "nav-item active" : "nav-item"} onClick={() => onActiveViewChange("profiles")}>
          <UserRound size={18} />
          <span>Profile</span>
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
          <button className="filter-toggle" onClick={() => setFiltersExpanded((value) => !value)}>
            {filtersExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            <SlidersHorizontal size={17} />
            筛选
            {filterCount > 0 && <small>{filterCount}</small>}
          </button>
          {!filtersExpanded && <p className="filter-summary">{filterCount > 0 ? "筛选条件已生效，展开可调整。" : "筛选已折叠。"}</p>}
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
              <button
                className={showWarningColumn ? "inline-toggle active" : "inline-toggle"}
                onClick={() => onShowWarningColumnChange(!showWarningColumn)}
                title="在列表中显示警告数量列"
              >
                {showWarningColumn ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                警告栏
              </button>
              {activeView === "maps" ? (
                <>
                  <SaveFilePicker
                    saveFiles={saveFiles}
                    selectedSaveFiles={selectedSaveFiles}
                    selectedSaveSet={selectedSaveSet}
                    onChange={onSelectedSaveFilesChange}
                  />
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
        </section>
      )}
    </aside>
  );
}

function SaveFilePicker({
  saveFiles,
  selectedSaveFiles,
  selectedSaveSet,
  onChange
}: {
  saveFiles: SaveFileInfo[];
  selectedSaveFiles: string[];
  selectedSaveSet: Set<string>;
  onChange: (value: string[]) => void;
}) {
  const selectedAvailableCount = saveFiles.filter((save) => selectedSaveSet.has(save.name)).length;

  function toggleSave(name: string) {
    if (selectedSaveSet.has(name)) {
      if (selectedSaveFiles.length <= 1) return;
      onChange(selectedSaveFiles.filter((item) => item !== name));
      return;
    }
    onChange([...selectedSaveFiles, name]);
  }

  return (
    <div className="save-picker">
      <div className="select-label">
        存档
        <small>{saveFiles.length ? `${selectedAvailableCount}/${saveFiles.length}` : "未找到"}</small>
      </div>
      {saveFiles.length ? (
        <div className="save-list">
          {saveFiles.map((save) => {
            const selected = selectedSaveSet.has(save.name);
            return (
              <button
                className={selected ? "save-option active" : "save-option"}
                disabled={selected && selectedSaveFiles.length <= 1}
                key={save.name}
                onClick={() => toggleSave(save.name)}
                title={save.currentMap || "未知当前地图"}
              >
                <span>{save.name}</span>
                <strong>{save.playerName || "未知玩家"}</strong>
                <small>{save.currentMap || "未知当前地图"}</small>
                <small>{formatSaveModified(save.lastModified)}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="filter-summary">没有找到数字存档。</p>
      )}
    </div>
  );
}

function formatSaveModified(value: string) {
  try {
    const nanos = BigInt(value);
    if (nanos <= 0n) return "未知时间";
    const milliseconds = Number(nanos / 1_000_000n);
    return new Date(milliseconds).toLocaleString();
  } catch {
    return "未知时间";
  }
}
