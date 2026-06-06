import {
  CircleDot,
  Clock,
  Download,
  FolderOpen,
  LoaderCircle,
  Lock,
  SearchCheck,
  Shield,
  Skull,
  Star,
  ToggleLeft,
  ToggleRight
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useScrollMemory, type ScrollMemory } from "../hooks/useScrollMemory";
import type { ModRecord, ModUpdateCandidate } from "../types";
import type { DependencyReference } from "../utils/dependencies";
import { formatCompletionStatus, formatStrawberries, formatTime, strawberryCollected } from "../utils/format";
import { formatModUpdateVersionChange } from "../utils/modUpdateTask";
import { clampPage, paginateItems } from "../utils/pagination";
import { rangesForField, type SearchMatch } from "../utils/search";
import type { ActiveView, EnabledFilter, ProgressFilter, ReferenceFilter, SortKey, StrawberryDenominator } from "../viewTypes";
import { Pagination } from "./Pagination";
import { HighlightedText, SearchBox, Select } from "./common";

type RecordView = Extract<ActiveView, "maps" | "mods">;

type RecordListProps = {
  activeView: RecordView;
  filteredMaps: ModRecord[];
  filteredMods: ModRecord[];
  enabledFilter: EnabledFilter;
  helperMapCount: number;
  progressFilter: ProgressFilter;
  query: string;
  referenceFilter: ReferenceFilter;
  selectedMap?: ModRecord;
  selectedMod?: ModRecord;
  showHelperMaps: boolean;
  showWarningColumn: boolean;
  sortKey: SortKey;
  strawberryDenominator: StrawberryDenominator;
  scrollMemory: ScrollMemory;
  loading: boolean;
  loadingMessage: string;
  modUpdateChecking: boolean;
  modUpdateCount: number;
  modUpdatesByRecordId: Map<string, ModUpdateCandidate>;
  recordSearchMatches: Map<string, SearchMatch>;
  requiredReferencesByModId: Map<string, DependencyReference[]>;
  visibleMapCount: number;
  modCount: number;
  onDisableAll: () => void;
  onEnableAll: () => void;
  onCheckModUpdates: () => void;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  onMapSelect: (id: string) => void;
  onMapToggle: (record: ModRecord) => void;
  onModSelect: (id: string) => void;
  onModToggle: (record: ModRecord) => void;
  onModUpdate: (candidate: ModUpdateCandidate) => void;
  onProgressFilterChange: (value: ProgressFilter) => void;
  onQueryChange: (value: string) => void;
  onRecordViewChange: (view: RecordView) => void;
  onReferenceFilterChange: (value: ReferenceFilter) => void;
  onShowHelperMapsChange: (value: boolean) => void;
  onSortKeyChange: (value: SortKey) => void;
  onUpdateAllMods: () => void;
  onFavoriteToggle: (record: ModRecord) => void;
  onProtectedToggle: (record: ModRecord) => void;
  isMapEnabled: (record: ModRecord) => boolean;
  isModEnabled: (id: string) => boolean;
};

export function RecordList({
  activeView,
  filteredMaps,
  filteredMods,
  enabledFilter,
  helperMapCount,
  progressFilter,
  query,
  referenceFilter,
  selectedMap,
  selectedMod,
  showHelperMaps,
  showWarningColumn,
  sortKey,
  strawberryDenominator,
  scrollMemory,
  loading,
  loadingMessage,
  modUpdateChecking,
  modUpdateCount,
  modUpdatesByRecordId,
  recordSearchMatches,
  requiredReferencesByModId,
  visibleMapCount,
  modCount,
  onDisableAll,
  onEnableAll,
  onCheckModUpdates,
  onEnabledFilterChange,
  onMapSelect,
  onMapToggle,
  onModSelect,
  onModToggle,
  onModUpdate,
  onProgressFilterChange,
  onQueryChange,
  onRecordViewChange,
  onReferenceFilterChange,
  onShowHelperMapsChange,
  onSortKeyChange,
  onUpdateAllMods,
  onFavoriteToggle,
  onProtectedToggle,
  isMapEnabled,
  isModEnabled
}: RecordListProps) {
  const records = activeView === "maps" ? filteredMaps : filteredMods;
  const total = activeView === "maps" ? visibleMapCount : modCount;
  const title = activeView === "maps" ? "地图" : "其他 Mod";
  const hasRecords = records.length > 0;
  const [page, setPage] = useState(1);
  const pagedRecords = useMemo(() => paginateItems(records, page), [page, records]);
  const recordsKey = useMemo(() => records.map((record) => record.id).join("\n"), [records]);
  const tableScrollRef = useScrollMemory<HTMLDivElement>(`records:${activeView}`, scrollMemory);

  useEffect(() => {
    setPage(1);
  }, [activeView, recordsKey]);

  useEffect(() => {
    setPage((current) => clampPage(current, records.length));
  }, [records.length]);

  return (
    <section className="ui-panel record-panel" aria-label={activeView === "maps" ? "地图列表" : "其他 Mod 列表"}>
      <div className="list-header">
        <div className="record-list-heading">
          <div className="record-list-title">
            <h2>{title}</h2>
            <p>{`${records.length} / ${total} 个结果`}</p>
          </div>
          <div className="record-view-switch" aria-label="本地内容类型">
            <button className={activeView === "maps" ? "active" : ""} onClick={() => onRecordViewChange("maps")}>
              地图
            </button>
            <button className={activeView === "mods" ? "active" : ""} onClick={() => onRecordViewChange("mods")}>
              其他 Mod
            </button>
          </div>
        </div>
        <button onClick={onEnableAll} disabled={!hasRecords} title="只启用当前筛选结果中的条目">
          <ToggleRight size={16} />
          启用当前结果
        </button>
        <button onClick={onDisableAll} disabled={!hasRecords} title="只禁用当前筛选结果中的条目">
          <ToggleLeft size={16} />
          禁用当前结果
        </button>
        <button onClick={onCheckModUpdates} disabled={modUpdateChecking} title="检查本地 zip Mod 是否有更新">
          {modUpdateChecking ? <LoaderCircle className="spin-icon" size={16} /> : <SearchCheck size={16} />}
          检查更新
        </button>
        <button
          className="primary-button update-all-button"
          onClick={onUpdateAllMods}
          disabled={loading || modUpdateCount === 0}
          title={modUpdateCount ? `更新全部 ${modUpdateCount} 个 Mod` : "先检查更新"}
        >
          <Download size={16} />
          <span>{formatUpdateAllLabel(modUpdateCount)}</span>
        </button>
      </div>
      <div className="record-filter-stack">
        <div className="catalog-actions record-search-actions">
          <SearchBox
            className="catalog-search record-search"
            value={query}
            onChange={onQueryChange}
            placeholder="搜索地图、SID、Mod、依赖"
          />
        </div>
        <RecordFilterBar
          activeView={activeView}
          enabledFilter={enabledFilter}
          helperMapCount={helperMapCount}
          progressFilter={progressFilter}
          referenceFilter={referenceFilter}
          showHelperMaps={showHelperMaps}
          sortKey={sortKey}
          onEnabledFilterChange={onEnabledFilterChange}
          onProgressFilterChange={onProgressFilterChange}
          onReferenceFilterChange={onReferenceFilterChange}
          onShowHelperMapsChange={onShowHelperMapsChange}
          onSortKeyChange={onSortKeyChange}
        />
      </div>
      <div className="record-table-scroll" ref={tableScrollRef}>
        {activeView === "maps" ? (
          <MapTable
            maps={pagedRecords.items}
            selectedMap={selectedMap}
            onSelect={onMapSelect}
            onToggle={onMapToggle}
            onFavoriteToggle={onFavoriteToggle}
            onProtectedToggle={onProtectedToggle}
            showWarningColumn={showWarningColumn}
            strawberryDenominator={strawberryDenominator}
            isEnabled={isMapEnabled}
            searchMatches={recordSearchMatches}
            updatesByRecordId={modUpdatesByRecordId}
            onUpdate={onModUpdate}
          />
        ) : (
          <ModTable
            mods={pagedRecords.items}
            selectedMod={selectedMod}
            onSelect={onModSelect}
            onToggle={onModToggle}
            onFavoriteToggle={onFavoriteToggle}
            onProtectedToggle={onProtectedToggle}
            showWarningColumn={showWarningColumn}
            isEnabled={isModEnabled}
            updatesByRecordId={modUpdatesByRecordId}
            requiredReferencesByModId={requiredReferencesByModId}
            searchMatches={recordSearchMatches}
            onUpdate={onModUpdate}
          />
        )}
        {!hasRecords && <RecordListEmpty activeView={activeView} loading={loading} loadingMessage={loadingMessage} />}
      </div>
      <Pagination
        ariaLabel={activeView === "maps" ? "地图列表分页" : "Mod 列表分页"}
        page={pagedRecords.page}
        pageCount={pagedRecords.pageCount}
        onPageChange={setPage}
      />
    </section>
  );
}

function RecordFilterBar({
  activeView,
  enabledFilter,
  helperMapCount,
  progressFilter,
  referenceFilter,
  showHelperMaps,
  sortKey,
  onEnabledFilterChange,
  onProgressFilterChange,
  onReferenceFilterChange,
  onShowHelperMapsChange,
  onSortKeyChange
}: {
  activeView: RecordView;
  enabledFilter: EnabledFilter;
  helperMapCount: number;
  progressFilter: ProgressFilter;
  referenceFilter: ReferenceFilter;
  showHelperMaps: boolean;
  sortKey: SortKey;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  onProgressFilterChange: (value: ProgressFilter) => void;
  onReferenceFilterChange: (value: ReferenceFilter) => void;
  onShowHelperMapsChange: (value: boolean) => void;
  onSortKeyChange: (value: SortKey) => void;
}) {
  return (
    <div
      className={
        activeView === "maps" ? "catalog-filter-bar record-filter-bar map-filters" : "catalog-filter-bar record-filter-bar mod-filters"
      }
    >
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
          <label className={`catalog-downloadable-toggle record-helper-toggle ${showHelperMaps ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={showHelperMaps}
              onChange={(event) => onShowHelperMapsChange(event.target.checked)}
              title="显示 Helper 或代码 Mod 附带的测试地图"
            />
            <span>Helper 测试图</span>
            <small>{helperMapCount}</small>
          </label>
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
  );
}

function EnabledFilterControl({ value, onChange }: { value: EnabledFilter; onChange: (value: EnabledFilter) => void }) {
  return (
    <Select label="启用状态" value={value} onChange={(nextValue) => onChange(nextValue as EnabledFilter)}>
      <option value="all">全部</option>
      <option value="enabled">仅启用</option>
      <option value="disabled">仅禁用</option>
    </Select>
  );
}

function ReferenceFilterControl({ value, onChange }: { value: ReferenceFilter; onChange: (value: ReferenceFilter) => void }) {
  return (
    <Select label="依赖关系" value={value} onChange={(nextValue) => onChange(nextValue as ReferenceFilter)}>
      <option value="all">全部</option>
      <option value="unreferenced">不被依赖</option>
      <option value="unreferencedAndOptional">不被依赖与可选依赖</option>
    </Select>
  );
}

function formatUpdateAllLabel(count: number) {
  if (!count) return "更新全部";
  const displayCount = count > 99 ? "99+" : String(count);
  return `更新全部 ${displayCount} 个 Mod`;
}

function RecordListEmpty({ activeView, loading, loadingMessage }: { activeView: RecordView; loading: boolean; loadingMessage: string }) {
  return (
    <div className="ui-empty-state empty-state table-empty">
      {loading ? <LoaderCircle className="spin-icon" size={28} /> : <FolderOpen size={28} />}
      <p>{loading ? loadingMessage || "正在加载..." : activeView === "maps" ? "没有找到符合条件的地图。" : "没有找到符合条件的 Mod。"}</p>
    </div>
  );
}

function MapTable({
  maps,
  selectedMap,
  onSelect,
  onToggle,
  onFavoriteToggle,
  onProtectedToggle,
  showWarningColumn,
  strawberryDenominator,
  isEnabled,
  updatesByRecordId,
  searchMatches,
  onUpdate
}: {
  maps: ModRecord[];
  selectedMap?: ModRecord;
  onSelect: (id: string) => void;
  onToggle: (record: ModRecord) => void;
  onFavoriteToggle: (record: ModRecord) => void;
  onProtectedToggle: (record: ModRecord) => void;
  showWarningColumn: boolean;
  strawberryDenominator: StrawberryDenominator;
  isEnabled: (record: ModRecord) => boolean;
  searchMatches: Map<string, SearchMatch>;
  updatesByRecordId: Map<string, ModUpdateCandidate>;
  onUpdate: (candidate: ModUpdateCandidate) => void;
}) {
  return (
    <table className={showWarningColumn ? "record-table map-table show-warning" : "record-table map-table"}>
      <colgroup>
        <col className="w-actions" />
        <col className="w-name" />
        <col className="w-small" />
        <col className="w-progress" />
        <col className="w-number" />
        <col className="w-time" />
        <col className="w-number" />
        {showWarningColumn && <col className="w-warning" />}
      </colgroup>
      <thead>
        <tr>
          <th className="col-actions">状态/标记</th>
          <th>名称</th>
          <th className="num">小图</th>
          <th>完成</th>
          <th className="num">
            <Skull size={14} />
            死亡
          </th>
          <th className="num">
            <Clock size={14} />
            用时
          </th>
          <th className="num">
            <CircleDot size={14} />
            草莓
          </th>
          {showWarningColumn && <th>警告</th>}
        </tr>
      </thead>
      <tbody>
        {maps.map((map) => {
          const enabled = isEnabled(map);
          const searchMatch = searchMatches.get(map.id);
          const updateCandidate = updatesByRecordId.get(map.id);
          return (
            <tr className={selectedMap?.id === map.id ? "active" : ""} key={map.id} onClick={() => onSelect(map.id)}>
              <RecordActionCell
                enabled={enabled}
                flagLabel="地图标记"
                record={map}
                toggleLabel="地图"
                onFavoriteToggle={onFavoriteToggle}
                onProtectedToggle={onProtectedToggle}
                onToggle={onToggle}
              />
              <RecordNameCell record={map} searchMatch={searchMatch} updateCandidate={updateCandidate} onUpdate={onUpdate}>
                <div className="inline-pills">
                  {map.readOnly && <span>官图</span>}
                  {map.kind === "mod" && <span className="helper-map-pill">测试图</span>}
                  {map.stats && <span>有存档</span>}
                </div>
              </RecordNameCell>
              <td className="num">{map.mapCount || 1}</td>
              <td>{formatCompletionStatus(map.completionStatus)}</td>
              <td className="num">{map.stats?.deaths ?? "-"}</td>
              <td className="num">{formatTime(map.stats?.timePlayed)}</td>
              <td className="num">
                {formatStrawberries(
                  strawberryCollected(map.stats, strawberryDenominator),
                  strawberryDenominator === "total" ? map.strawberryTotalCount : map.strawberryCount,
                  map.stats?.strawberriesKnown ?? true
                )}
              </td>
              {showWarningColumn && <td>{map.warnings.length ? <span className="warning-pill">{map.warnings.length}</span> : "-"}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ModTable({
  mods,
  selectedMod,
  onSelect,
  onToggle,
  onFavoriteToggle,
  onProtectedToggle,
  showWarningColumn,
  isEnabled,
  updatesByRecordId,
  requiredReferencesByModId,
  searchMatches,
  onUpdate
}: {
  mods: ModRecord[];
  selectedMod?: ModRecord;
  onSelect: (id: string) => void;
  onToggle: (record: ModRecord) => void;
  onFavoriteToggle: (record: ModRecord) => void;
  onProtectedToggle: (record: ModRecord) => void;
  showWarningColumn: boolean;
  isEnabled: (id: string) => boolean;
  updatesByRecordId: Map<string, ModUpdateCandidate>;
  requiredReferencesByModId: Map<string, DependencyReference[]>;
  searchMatches: Map<string, SearchMatch>;
  onUpdate: (candidate: ModUpdateCandidate) => void;
}) {
  return (
    <table className={showWarningColumn ? "record-table mod-table show-warning" : "record-table mod-table"}>
      <colgroup>
        <col className="w-actions" />
        <col className="w-name" />
        <col className="w-kind" />
        <col className="w-number" />
        <col className="w-number" />
        <col className="w-progress" />
        {showWarningColumn && <col className="w-warning" />}
      </colgroup>
      <thead>
        <tr>
          <th className="col-actions">状态/标记</th>
          <th>名称</th>
          <th>类型</th>
          <th className="num">依赖</th>
          <th className="num">被依赖</th>
          <th>测试图</th>
          {showWarningColumn && <th>警告</th>}
        </tr>
      </thead>
      <tbody>
        {mods.map((modItem) => {
          const enabled = isEnabled(modItem.id);
          const searchMatch = searchMatches.get(modItem.id);
          const updateCandidate = updatesByRecordId.get(modItem.id);
          const requiredReferences = requiredReferencesByModId.get(modItem.id) ?? [];
          return (
            <tr className={selectedMod?.id === modItem.id ? "active" : ""} key={modItem.id} onClick={() => onSelect(modItem.id)}>
              <RecordActionCell
                enabled={enabled}
                flagLabel="Mod 标记"
                record={modItem}
                toggleLabel="Mod"
                onFavoriteToggle={onFavoriteToggle}
                onProtectedToggle={onProtectedToggle}
                onToggle={onToggle}
              />
              <RecordNameCell record={modItem} searchMatch={searchMatch} updateCandidate={updateCandidate} onUpdate={onUpdate} />
              <td>{modItem.isArchive ? "zip" : "文件夹"}</td>
              <td className="num">{modItem.dependencies.length}</td>
              <td className="num" title={formatDependencyReferenceTitle(requiredReferences)}>
                {requiredReferences.length || "-"}
              </td>
              <td>{modItem.subMaps.length ? `${modItem.subMaps.length} 张` : "-"}</td>
              {showWarningColumn && (
                <td>{modItem.warnings.length ? <span className="warning-pill">{modItem.warnings.length}</span> : "-"}</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatDependencyReferenceTitle(references: DependencyReference[]) {
  if (!references.length) return "没有被其他地图或 Mod 声明为必需依赖";
  return references.map((reference) => reference.name).join("、");
}

function RecordActionCell({
  enabled,
  flagLabel,
  record,
  toggleLabel,
  onFavoriteToggle,
  onProtectedToggle,
  onToggle
}: {
  enabled: boolean;
  flagLabel: string;
  record: ModRecord;
  toggleLabel: string;
  onFavoriteToggle: (record: ModRecord) => void;
  onProtectedToggle: (record: ModRecord) => void;
  onToggle: (record: ModRecord) => void;
}) {
  return (
    <td className="action-cell">
      <div className="record-actions">
        <ToggleButton
          blockedReason={record.readOnly ? `${record.name} 是内置项目，不能通过 Profile 启用或禁用。` : undefined}
          enabled={enabled}
          label={toggleLabel}
          onClick={() => onToggle(record)}
        />
        <div className="record-flag-actions" aria-label={flagLabel}>
          <FlagButton
            active={record.favorite}
            icon={<Star size={16} />}
            label="收藏"
            variant="favorite"
            onClick={() => onFavoriteToggle(record)}
          />
          <FlagButton
            active={record.protected}
            disabled={record.readOnly}
            icon={record.protected ? <Lock size={16} /> : <Shield size={16} />}
            label="始终启用"
            variant="protected"
            onClick={() => onProtectedToggle(record)}
          />
        </div>
      </div>
    </td>
  );
}

function RecordNameCell({
  children,
  record,
  searchMatch,
  updateCandidate,
  onUpdate
}: {
  children?: React.ReactNode;
  record: ModRecord;
  searchMatch?: SearchMatch;
  updateCandidate?: ModUpdateCandidate;
  onUpdate: (candidate: ModUpdateCandidate) => void;
}) {
  return (
    <td className="name-cell">
      <div className="name-title-row">
        <strong title={record.name}>
          <HighlightedText ranges={rangesForField(searchMatch, "name")} text={record.name} />
        </strong>
        {record.metadata.version && (
          <span className="version-text" title={record.metadata.version}>
            <HighlightedText ranges={rangesForField(searchMatch, "version")} text={record.metadata.version} />
          </span>
        )}
        {updateCandidate && (
          <span className="update-version-text" title={formatModUpdateVersionChange(updateCandidate)}>
            {formatModUpdateVersionChange(updateCandidate)}
          </span>
        )}
        {updateCandidate && <InlineUpdateButton candidate={updateCandidate} onUpdate={onUpdate} />}
      </div>
      {children}
    </td>
  );
}

function InlineUpdateButton({ candidate, onUpdate }: { candidate: ModUpdateCandidate; onUpdate: (candidate: ModUpdateCandidate) => void }) {
  const hasDownloadUrl = candidate.entry.downloadUrl.trim().length > 0;
  return (
    <button
      className="record-update-button"
      disabled={!hasDownloadUrl}
      onClick={(event) => {
        event.stopPropagation();
        if (!hasDownloadUrl) return;
        onUpdate(candidate);
      }}
      title={hasDownloadUrl ? `更新 ${formatModUpdateVersionChange(candidate)}` : "该目录条目没有下载地址"}
    >
      <Download size={13} />
      更新
    </button>
  );
}

function FlagButton({
  active,
  disabled,
  icon,
  label,
  variant,
  onClick
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  variant: "favorite" | "protected";
  onClick: () => void;
}) {
  return (
    <button
      className={active ? `flag-button ${variant} active` : `flag-button ${variant}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onClick();
      }}
      title={disabled ? `${label}不能修改` : active ? `取消 ${label}` : `设为 ${label}`}
    >
      {icon}
    </button>
  );
}

function ToggleButton({
  blockedReason,
  enabled,
  label,
  onClick
}: {
  blockedReason?: string;
  enabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const blocked = Boolean(blockedReason);
  return (
    <button
      aria-disabled={blocked}
      className={`${enabled ? "record-toggle enabled" : "record-toggle disabled"}${blocked ? " blocked" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={blockedReason ?? (enabled ? `禁用${label}` : `启用${label}`)}
    >
      {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
    </button>
  );
}
