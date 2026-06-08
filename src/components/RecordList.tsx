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
type UpdateStatusGroup = "available" | "latest" | "unknown";
type UpdateStatusGroupCounts = Record<UpdateStatusGroup, number>;
type UpdateStatusGroups = { counts: UpdateStatusGroupCounts; groups: Map<string, UpdateStatusGroup> };

type RecordListProps = {
  activeView: RecordView;
  filteredMaps: ModRecord[];
  filteredMods: ModRecord[];
  enabledFilter: EnabledFilter;
  groupByUpdateStatus: boolean;
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
  latestUpdatesByRecordId: Map<string, ModUpdateCandidate>;
  modUpdatesByRecordId: Map<string, ModUpdateCandidate>;
  recordSearchMatches: Map<string, SearchMatch>;
  requiredReferencesByModId: Map<string, DependencyReference[]>;
  visibleMapCount: number;
  writeActionsDisabled: boolean;
  modCount: number;
  onDisableAll: () => void;
  onEnableAll: () => void;
  onCheckModUpdates: () => void;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  onGroupByUpdateStatusChange: (value: boolean) => void;
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
  groupByUpdateStatus,
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
  latestUpdatesByRecordId,
  modUpdatesByRecordId,
  recordSearchMatches,
  requiredReferencesByModId,
  visibleMapCount,
  writeActionsDisabled,
  modCount,
  onDisableAll,
  onEnableAll,
  onCheckModUpdates,
  onEnabledFilterChange,
  onGroupByUpdateStatusChange,
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
  const updateStatusGroups = useMemo(
    () =>
      groupByUpdateStatus
        ? buildUpdateStatusGroups(activeView === "maps" ? filteredMaps : filteredMods, modUpdatesByRecordId, latestUpdatesByRecordId)
        : null,
    [activeView, filteredMaps, filteredMods, groupByUpdateStatus, latestUpdatesByRecordId, modUpdatesByRecordId]
  );

  useEffect(() => {
    setPage(1);
  }, [activeView, recordsKey]);

  useEffect(() => {
    setPage((current) => clampPage(current, records.length));
  }, [records.length]);

  return (
    <section className="ui-panel record-panel">
      <div className="list-header">
        <div className="record-list-heading">
          <div className="record-list-title">
            <h2>{title}</h2>
            <p>{`${records.length} / ${total} 个结果`}</p>
          </div>
          <div className="record-view-switch">
            <button className={activeView === "maps" ? "active" : ""} onClick={() => onRecordViewChange("maps")}>
              地图
            </button>
            <button className={activeView === "mods" ? "active" : ""} onClick={() => onRecordViewChange("mods")}>
              其他 Mod
            </button>
          </div>
        </div>
        <button
          onClick={onEnableAll}
          disabled={!hasRecords || writeActionsDisabled}
          title={writeActionsDisabled ? "Celeste 运行中，停止游戏后再修改启用状态" : "只启用当前筛选结果中的条目"}
        >
          <ToggleRight size={16} />
          启用当前结果
        </button>
        <button
          onClick={onDisableAll}
          disabled={!hasRecords || writeActionsDisabled}
          title={writeActionsDisabled ? "Celeste 运行中，停止游戏后再修改启用状态" : "只禁用当前筛选结果中的条目"}
        >
          <ToggleLeft size={16} />
          禁用当前结果
        </button>
        <button
          onClick={onCheckModUpdates}
          disabled={modUpdateChecking || writeActionsDisabled}
          title={writeActionsDisabled ? "Celeste 运行中，停止游戏后再检查更新" : "检查本地 zip Mod 是否有更新"}
        >
          {modUpdateChecking ? <LoaderCircle className="spin-icon" size={16} /> : <SearchCheck size={16} />}
          检查更新
        </button>
        <button
          className="primary-button update-all-button"
          onClick={onUpdateAllMods}
          disabled={loading || writeActionsDisabled || modUpdateCount === 0}
          title={
            writeActionsDisabled
              ? "Celeste 运行中，停止游戏后再更新 Mod"
              : modUpdateCount
                ? `更新全部 ${modUpdateCount} 个 Mod`
                : "先检查更新"
          }
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
          groupByUpdateStatus={groupByUpdateStatus}
          helperMapCount={helperMapCount}
          progressFilter={progressFilter}
          referenceFilter={referenceFilter}
          showHelperMaps={showHelperMaps}
          sortKey={sortKey}
          onEnabledFilterChange={onEnabledFilterChange}
          onGroupByUpdateStatusChange={onGroupByUpdateStatusChange}
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
            writeActionsDisabled={writeActionsDisabled}
            showWarningColumn={showWarningColumn}
            strawberryDenominator={strawberryDenominator}
            isEnabled={isMapEnabled}
            searchMatches={recordSearchMatches}
            updatesByRecordId={modUpdatesByRecordId}
            updateStatusGroups={updateStatusGroups}
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
            writeActionsDisabled={writeActionsDisabled}
            showWarningColumn={showWarningColumn}
            isEnabled={isModEnabled}
            updatesByRecordId={modUpdatesByRecordId}
            updateStatusGroups={updateStatusGroups}
            requiredReferencesByModId={requiredReferencesByModId}
            searchMatches={recordSearchMatches}
            onUpdate={onModUpdate}
          />
        )}
        {!hasRecords && <RecordListEmpty activeView={activeView} loading={loading} loadingMessage={loadingMessage} />}
      </div>
      <Pagination page={pagedRecords.page} pageCount={pagedRecords.pageCount} onPageChange={setPage} />
    </section>
  );
}

function RecordFilterBar({
  activeView,
  enabledFilter,
  groupByUpdateStatus,
  helperMapCount,
  progressFilter,
  referenceFilter,
  showHelperMaps,
  sortKey,
  onEnabledFilterChange,
  onGroupByUpdateStatusChange,
  onProgressFilterChange,
  onReferenceFilterChange,
  onShowHelperMapsChange,
  onSortKeyChange
}: {
  activeView: RecordView;
  enabledFilter: EnabledFilter;
  groupByUpdateStatus: boolean;
  helperMapCount: number;
  progressFilter: ProgressFilter;
  referenceFilter: ReferenceFilter;
  showHelperMaps: boolean;
  sortKey: SortKey;
  onEnabledFilterChange: (value: EnabledFilter) => void;
  onGroupByUpdateStatusChange: (value: boolean) => void;
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
            <option value="updates">有更新</option>
            <option value="completed">已完成</option>
            <option value="unfinished">未完成</option>
            <option value="withStats">有存档统计</option>
            <option value="warnings">有依赖警告</option>
          </Select>
          <UpdateStatusGroupToggle value={groupByUpdateStatus} onChange={onGroupByUpdateStatusChange} />
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
            label="状态"
            value={progressFilter === "warnings" || progressFilter === "updates" ? progressFilter : "all"}
            onChange={(value) => onProgressFilterChange(value as ProgressFilter)}
          >
            <option value="all">全部 Mod</option>
            <option value="updates">有更新</option>
            <option value="warnings">有警告</option>
          </Select>
          <UpdateStatusGroupToggle value={groupByUpdateStatus} onChange={onGroupByUpdateStatusChange} />
        </>
      )}
    </div>
  );
}

function UpdateStatusGroupToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`catalog-downloadable-toggle record-update-group-toggle ${value ? "active" : ""}`}>
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        title="按可更新、未知状态、已是最新分组"
      />
      <span>按更新状态分组</span>
    </label>
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
  writeActionsDisabled,
  showWarningColumn,
  strawberryDenominator,
  isEnabled,
  updatesByRecordId,
  updateStatusGroups,
  searchMatches,
  onUpdate
}: {
  maps: ModRecord[];
  selectedMap?: ModRecord;
  onSelect: (id: string) => void;
  onToggle: (record: ModRecord) => void;
  onFavoriteToggle: (record: ModRecord) => void;
  onProtectedToggle: (record: ModRecord) => void;
  writeActionsDisabled: boolean;
  showWarningColumn: boolean;
  strawberryDenominator: StrawberryDenominator;
  isEnabled: (record: ModRecord) => boolean;
  searchMatches: Map<string, SearchMatch>;
  updatesByRecordId: Map<string, ModUpdateCandidate>;
  updateStatusGroups: UpdateStatusGroups | null;
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
        {maps.flatMap((map, index) => {
          const enabled = isEnabled(map);
          const searchMatch = searchMatches.get(map.id);
          const updateCandidate = updatesByRecordId.get(map.id);
          const updateStatus = updateStatusGroups?.groups.get(map.id) ?? null;
          const previousUpdateStatus = index > 0 ? (updateStatusGroups?.groups.get(maps[index - 1].id) ?? null) : null;
          const rows: React.ReactNode[] = [];
          if (updateStatusGroups && updateStatus && updateStatus !== previousUpdateStatus) {
            rows.push(
              <UpdateStatusGroupRow
                colSpan={showWarningColumn ? 8 : 7}
                count={updateStatusGroups.counts[updateStatus]}
                group={updateStatus}
                key={`group:${updateStatus}:${map.id}`}
              />
            );
          }
          rows.push(
            <tr className={selectedMap?.id === map.id ? "active" : ""} key={map.id} onClick={() => onSelect(map.id)}>
              <RecordActionCell
                enabled={enabled}
                record={map}
                toggleLabel="地图"
                onFavoriteToggle={onFavoriteToggle}
                onProtectedToggle={onProtectedToggle}
                writeActionsDisabled={writeActionsDisabled}
                onToggle={onToggle}
              />
              <RecordNameCell
                record={map}
                searchMatch={searchMatch}
                updateCandidate={updateCandidate}
                writeActionsDisabled={writeActionsDisabled}
                onUpdate={onUpdate}
              >
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
          return rows;
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
  writeActionsDisabled,
  showWarningColumn,
  isEnabled,
  updatesByRecordId,
  updateStatusGroups,
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
  writeActionsDisabled: boolean;
  showWarningColumn: boolean;
  isEnabled: (id: string) => boolean;
  updatesByRecordId: Map<string, ModUpdateCandidate>;
  updateStatusGroups: UpdateStatusGroups | null;
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
        {mods.flatMap((modItem, index) => {
          const enabled = isEnabled(modItem.id);
          const searchMatch = searchMatches.get(modItem.id);
          const updateCandidate = updatesByRecordId.get(modItem.id);
          const updateStatus = updateStatusGroups?.groups.get(modItem.id) ?? null;
          const previousUpdateStatus = index > 0 ? (updateStatusGroups?.groups.get(mods[index - 1].id) ?? null) : null;
          const requiredReferences = requiredReferencesByModId.get(modItem.id) ?? [];
          const rows: React.ReactNode[] = [];
          if (updateStatusGroups && updateStatus && updateStatus !== previousUpdateStatus) {
            rows.push(
              <UpdateStatusGroupRow
                colSpan={showWarningColumn ? 7 : 6}
                count={updateStatusGroups.counts[updateStatus]}
                group={updateStatus}
                key={`group:${updateStatus}:${modItem.id}`}
              />
            );
          }
          rows.push(
            <tr className={selectedMod?.id === modItem.id ? "active" : ""} key={modItem.id} onClick={() => onSelect(modItem.id)}>
              <RecordActionCell
                enabled={enabled}
                record={modItem}
                toggleLabel="Mod"
                onFavoriteToggle={onFavoriteToggle}
                onProtectedToggle={onProtectedToggle}
                writeActionsDisabled={writeActionsDisabled}
                onToggle={onToggle}
              />
              <RecordNameCell
                record={modItem}
                searchMatch={searchMatch}
                updateCandidate={updateCandidate}
                writeActionsDisabled={writeActionsDisabled}
                onUpdate={onUpdate}
              />
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
          return rows;
        })}
      </tbody>
    </table>
  );
}

function buildUpdateStatusGroups(
  mods: ModRecord[],
  updatesByRecordId: Map<string, ModUpdateCandidate>,
  latestUpdatesByRecordId: Map<string, ModUpdateCandidate>
) {
  const groups = new Map<string, UpdateStatusGroup>();
  const counts: UpdateStatusGroupCounts = { available: 0, latest: 0, unknown: 0 };
  for (const modItem of mods) {
    const group = updatesByRecordId.has(modItem.id)
      ? "available"
      : latestUpdatesByRecordId.has(modItem.id) || (modItem.kind === "map" && modItem.readOnly)
        ? "latest"
        : "unknown";
    groups.set(modItem.id, group);
    counts[group] += 1;
  }
  return { counts, groups };
}

function UpdateStatusGroupRow({ colSpan, count, group }: { colSpan: number; count: number; group: UpdateStatusGroup }) {
  return (
    <tr className="record-group-row">
      <td colSpan={colSpan}>
        <span>{updateStatusGroupLabel(group)}</span>
        <small>{`${count} 个`}</small>
      </td>
    </tr>
  );
}

function updateStatusGroupLabel(group: UpdateStatusGroup) {
  if (group === "available") return "可更新";
  if (group === "latest") return "已是最新";
  return "未知状态";
}

function formatDependencyReferenceTitle(references: DependencyReference[]) {
  if (!references.length) return "没有被其他地图或 Mod 声明为必需依赖";
  return references.map((reference) => reference.name).join("、");
}

function RecordActionCell({
  enabled,
  record,
  toggleLabel,
  writeActionsDisabled,
  onFavoriteToggle,
  onProtectedToggle,
  onToggle
}: {
  enabled: boolean;
  record: ModRecord;
  toggleLabel: string;
  writeActionsDisabled: boolean;
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
          writeActionsDisabled={writeActionsDisabled}
          onClick={() => onToggle(record)}
        />
        <div className="record-flag-actions">
          <FlagButton
            active={record.favorite}
            disabled={writeActionsDisabled}
            icon={<Star size={16} />}
            label="收藏"
            variant="favorite"
            onClick={() => onFavoriteToggle(record)}
          />
          <FlagButton
            active={record.protected}
            disabled={record.readOnly || writeActionsDisabled}
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
  writeActionsDisabled,
  onUpdate
}: {
  children?: React.ReactNode;
  record: ModRecord;
  searchMatch?: SearchMatch;
  updateCandidate?: ModUpdateCandidate;
  writeActionsDisabled: boolean;
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
        {updateCandidate && (
          <InlineUpdateButton candidate={updateCandidate} writeActionsDisabled={writeActionsDisabled} onUpdate={onUpdate} />
        )}
      </div>
      {children}
    </td>
  );
}

function InlineUpdateButton({
  candidate,
  writeActionsDisabled,
  onUpdate
}: {
  candidate: ModUpdateCandidate;
  writeActionsDisabled: boolean;
  onUpdate: (candidate: ModUpdateCandidate) => void;
}) {
  const hasDownloadUrl = candidate.entry.downloadUrl.trim().length > 0;
  return (
    <button
      className="record-update-button"
      disabled={!hasDownloadUrl || writeActionsDisabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!hasDownloadUrl || writeActionsDisabled) return;
        onUpdate(candidate);
      }}
      title={
        writeActionsDisabled
          ? "Celeste 运行中，停止游戏后再更新 Mod"
          : hasDownloadUrl
            ? `更新 ${formatModUpdateVersionChange(candidate)}`
            : "该目录条目没有下载地址"
      }
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
  writeActionsDisabled,
  onClick
}: {
  blockedReason?: string;
  enabled: boolean;
  label: string;
  writeActionsDisabled: boolean;
  onClick: () => void;
}) {
  const blocked = Boolean(blockedReason) || writeActionsDisabled;
  const title = writeActionsDisabled
    ? "Celeste 运行中，停止游戏后再修改启用状态"
    : (blockedReason ?? (enabled ? `禁用${label}` : `启用${label}`));
  return (
    <button
      className={`${enabled ? "record-toggle enabled" : "record-toggle disabled"}${blocked ? " blocked" : ""}`}
      disabled={blocked}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
    >
      {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
    </button>
  );
}
