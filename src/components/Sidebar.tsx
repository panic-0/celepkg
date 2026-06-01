import { Check, Gamepad2, Save, Search, SlidersHorizontal, Sparkles, ToggleLeft, ToggleRight } from "lucide-react";
import type { Profile } from "../types";
import type { ActiveView, EnabledFilter, ProgressFilter, SortKey } from "../viewTypes";
import { profileSummary } from "../utils/format";
import { Select } from "./common";

type SidebarProps = {
  activeView: ActiveView;
  enabledFilter: EnabledFilter;
  helperMapCount: number;
  launchArgs: string;
  loading: boolean;
  profileName: string;
  profiles: Profile[];
  progressFilter: ProgressFilter;
  query: string;
  selectedProfileId: string;
  showHelperMaps: boolean;
  sortKey: SortKey;
  onActiveViewChange: (view: ActiveView) => void;
  onApplyProfile: () => void;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  onLaunchArgsChange: (value: string) => void;
  onProfileNameChange: (value: string) => void;
  onProfileSelect: (profile: Profile) => void;
  onProgressFilterChange: (value: ProgressFilter) => void;
  onQueryChange: (value: string) => void;
  onSaveAsProfile: () => void;
  onSaveProfile: (applyAfterSave: boolean) => void;
  onShowHelperMapsChange: (value: boolean) => void;
  onSortKeyChange: (value: SortKey) => void;
};

export function Sidebar({
  activeView,
  enabledFilter,
  helperMapCount,
  launchArgs,
  loading,
  profileName,
  profiles,
  progressFilter,
  query,
  selectedProfileId,
  showHelperMaps,
  sortKey,
  onActiveViewChange,
  onApplyProfile,
  onEnabledFilterChange,
  onLaunchArgsChange,
  onProfileNameChange,
  onProfileSelect,
  onProgressFilterChange,
  onQueryChange,
  onSaveAsProfile,
  onSaveProfile,
  onShowHelperMapsChange,
  onSortKeyChange
}: SidebarProps) {
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
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <SlidersHorizontal size={17} />
          筛选
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={activeView === "maps" ? "搜索地图、作者、SID" : "搜索 Mod、作者、依赖"}
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
          <Select
            label="警告"
            value={progressFilter === "warnings" ? "warnings" : "all"}
            onChange={(value) => onProgressFilterChange(value as ProgressFilter)}
          >
            <option value="all">全部 Mod</option>
            <option value="warnings">有警告</option>
          </Select>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">
          <Gamepad2 size={17} />
          Profiles
        </div>
        <div className="profile-list">
          {profiles.map((profile) => (
            <button
              className={profile.id === selectedProfileId ? "profile active" : "profile"}
              key={profile.id}
              onClick={() => onProfileSelect(profile)}
            >
              <span>{profile.name}</span>
              <small>{profileSummary(profile)}</small>
            </button>
          ))}
        </div>
        <label className="field">
          <span>启动参数</span>
          <input value={launchArgs} onChange={(event) => onLaunchArgsChange(event.target.value)} placeholder="-debug" />
        </label>
        <label className="field">
          <span>另存为</span>
          <input value={profileName} onChange={(event) => onProfileNameChange(event.target.value)} />
        </label>
        <div className="button-row">
          <button onClick={() => onSaveProfile(false)} disabled={loading}>
            <Save size={16} />
            保存
          </button>
          <button onClick={() => onSaveProfile(true)} disabled={loading}>
            <Check size={16} />
            保存并应用
          </button>
        </div>
        <div className="button-row">
          <button onClick={onSaveAsProfile} disabled={loading}>
            <Sparkles size={16} />
            新建 Profile
          </button>
          <button onClick={onApplyProfile} disabled={loading}>
            <ToggleRight size={16} />
            应用
          </button>
        </div>
      </div>
    </aside>
  );
}
