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
  ToggleRight,
  X
} from "lucide-react";
import { useScrollMemory, type ScrollMemory } from "../hooks/useScrollMemory";
import type { ModDownloadProgress, ModRecord, ModUpdateCandidate } from "../types";
import { formatCompletionStatus, formatStrawberries, formatTime } from "../utils/format";
import type { ActiveView, StrawberryDenominator } from "../viewTypes";

type RecordView = Extract<ActiveView, "maps" | "mods">;

type RecordListProps = {
  activeView: RecordView;
  filteredMaps: ModRecord[];
  filteredMods: ModRecord[];
  selectedMap?: ModRecord;
  selectedMod?: ModRecord;
  showWarningColumn: boolean;
  strawberryDenominator: StrawberryDenominator;
  scrollMemory: ScrollMemory;
  loading: boolean;
  loadingMessage: string;
  modDownloadBatchLabel: string;
  modDownloadProgress: ModDownloadProgress | null;
  modUpdateCount: number;
  modUpdatesByRecordId: Map<string, ModUpdateCandidate>;
  visibleMapCount: number;
  modCount: number;
  onDisableAll: () => void;
  onEnableAll: () => void;
  onCheckModUpdates: () => void;
  onCancelModDownload: () => void;
  onMapSelect: (id: string) => void;
  onMapToggle: (record: ModRecord) => void;
  onModSelect: (id: string) => void;
  onModToggle: (record: ModRecord) => void;
  onModUpdate: (candidate: ModUpdateCandidate) => void;
  onRecordViewChange: (view: RecordView) => void;
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
  selectedMap,
  selectedMod,
  showWarningColumn,
  strawberryDenominator,
  scrollMemory,
  loading,
  loadingMessage,
  modDownloadBatchLabel,
  modDownloadProgress,
  modUpdateCount,
  modUpdatesByRecordId,
  visibleMapCount,
  modCount,
  onDisableAll,
  onEnableAll,
  onCheckModUpdates,
  onCancelModDownload,
  onMapSelect,
  onMapToggle,
  onModSelect,
  onModToggle,
  onModUpdate,
  onRecordViewChange,
  onUpdateAllMods,
  onFavoriteToggle,
  onProtectedToggle,
  isMapEnabled,
  isModEnabled
}: RecordListProps) {
  const records = activeView === "maps" ? filteredMaps : filteredMods;
  const total = activeView === "maps" ? visibleMapCount : modCount;
  const hasRecords = records.length > 0;
  const tableScrollRef = useScrollMemory<HTMLDivElement>(`records:${activeView}`, scrollMemory);

  return (
    <section className="record-panel" aria-label={activeView === "maps" ? "地图列表" : "其他 Mod 列表"}>
      <div className="list-header">
        <div>
          <div className="record-view-switch" aria-label="本地内容类型">
            <button className={activeView === "maps" ? "active" : ""} onClick={() => onRecordViewChange("maps")}>
              地图
            </button>
            <button className={activeView === "mods" ? "active" : ""} onClick={() => onRecordViewChange("mods")}>
              其他 Mod
            </button>
          </div>
          <p>{`${records.length} / ${total} 个结果`}</p>
        </div>
        <button onClick={onEnableAll} disabled={!hasRecords}>
          <ToggleRight size={16} />
          全部启用
        </button>
        <button onClick={onDisableAll} disabled={!hasRecords}>
          <ToggleLeft size={16} />
          全部禁用
        </button>
        <button onClick={onCheckModUpdates} disabled={loading} title="检查本地 zip Mod 是否有更新">
          <SearchCheck size={16} />
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
      <DownloadProgressStrip batchLabel={modDownloadBatchLabel} progress={modDownloadProgress} onCancel={onCancelModDownload} />

      <div className="record-table-scroll" ref={tableScrollRef}>
        {activeView === "maps" ? (
          <MapTable
            maps={filteredMaps}
            selectedMap={selectedMap}
            onSelect={onMapSelect}
            onToggle={onMapToggle}
            onFavoriteToggle={onFavoriteToggle}
            onProtectedToggle={onProtectedToggle}
            showWarningColumn={showWarningColumn}
            strawberryDenominator={strawberryDenominator}
            isEnabled={isMapEnabled}
            updatesByRecordId={modUpdatesByRecordId}
            onUpdate={onModUpdate}
          />
        ) : (
          <ModTable
            mods={filteredMods}
            selectedMod={selectedMod}
            onSelect={onModSelect}
            onToggle={onModToggle}
            onFavoriteToggle={onFavoriteToggle}
            onProtectedToggle={onProtectedToggle}
            showWarningColumn={showWarningColumn}
            isEnabled={isModEnabled}
            updatesByRecordId={modUpdatesByRecordId}
            onUpdate={onModUpdate}
          />
        )}
        {!hasRecords && <RecordListEmpty activeView={activeView} loading={loading} loadingMessage={loadingMessage} />}
      </div>
    </section>
  );
}

function DownloadProgressStrip({
  batchLabel,
  progress,
  onCancel
}: {
  batchLabel: string;
  progress: ModDownloadProgress | null;
  onCancel: () => void;
}) {
  const percent =
    progress?.total && progress.total > 0 ? Math.max(0, Math.min(100, Math.round((progress.downloaded / progress.total) * 100))) : null;
  const active = Boolean(progress);
  return (
    <div className={active ? "record-download-progress-slot active" : "record-download-progress-slot"} aria-live="polite">
      {progress && (
        <>
          <div className="record-download-progress-copy">
            <span>{formatDownloadProgressText(progress, percent, batchLabel)}</span>
            {progress.phase === "downloading" && <small>{formatDownloadProgressMeta(progress, percent)}</small>}
            {progress.phase === "downloading" && (
              <button className="record-download-cancel-button" onClick={onCancel} title="取消下载" type="button">
                <X size={13} />
              </button>
            )}
          </div>
          <div
            className={percent === null && progress.phase === "downloading" ? "record-download-bar indeterminate" : "record-download-bar"}
          >
            <span style={{ width: `${progress.phase === "done" ? 100 : (percent ?? 35)}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

function formatDownloadProgressText(progress: ModDownloadProgress, percent: number | null, batchLabel: string) {
  const task = progress.taskTotal > 1 ? ` (${progress.taskIndex}/${progress.taskTotal})` : "";
  const batch = task || (batchLabel ? ` ${batchLabel}` : "");
  const modName = progress.modName || "Mod";
  if (progress.phase === "verifying") return `正在校验 ${modName}${batch}`;
  if (progress.phase === "installing") return `正在安装 ${modName}${batch}`;
  if (progress.phase === "done") return `已更新 ${modName}${batch}`;
  if (progress.phase === "error") return `更新失败 ${modName}${batch}`;
  return `正在下载 ${modName}${batch}${percent === null ? "" : ` ${percent}%`}`;
}

function formatDownloadProgressMeta(progress: ModDownloadProgress, percent: number | null) {
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

function formatUpdateAllLabel(count: number) {
  if (!count) return "更新全部";
  const displayCount = count > 99 ? "99+" : String(count);
  return `更新全部 ${displayCount} 个 Mod`;
}

function RecordListEmpty({ activeView, loading, loadingMessage }: { activeView: RecordView; loading: boolean; loadingMessage: string }) {
  return (
    <div className="empty-state table-empty">
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
          const updateCandidate = updatesByRecordId.get(map.id);
          return (
            <tr className={selectedMap?.id === map.id ? "active" : ""} key={map.id} onClick={() => onSelect(map.id)}>
              <td className="action-cell">
                <div className="record-actions">
                  <ToggleButton disabled={map.readOnly} enabled={enabled} label="地图" onClick={() => onToggle(map)} />
                  <div className="record-flag-actions" aria-label="地图标记">
                    <FlagButton
                      active={map.favorite}
                      icon={<Star size={16} />}
                      label="收藏"
                      variant="favorite"
                      onClick={() => onFavoriteToggle(map)}
                    />
                    <FlagButton
                      active={map.protected}
                      disabled={map.readOnly}
                      icon={map.protected ? <Lock size={16} /> : <Shield size={16} />}
                      label="始终启用"
                      variant="protected"
                      onClick={() => onProtectedToggle(map)}
                    />
                  </div>
                </div>
              </td>
              <td className="name-cell">
                <div className="name-title-row">
                  <strong title={map.name}>{map.name}</strong>
                  {map.metadata.version && (
                    <span className="version-text" title={map.metadata.version}>
                      {map.metadata.version}
                    </span>
                  )}
                  {updateCandidate && <InlineUpdateButton candidate={updateCandidate} onUpdate={onUpdate} />}
                </div>
                <div className="inline-pills">
                  {map.readOnly && <span>官图</span>}
                  {map.kind === "mod" && <span className="helper-map-pill">测试图</span>}
                  {map.stats && <span>有存档</span>}
                </div>
              </td>
              <td className="num">{map.mapCount || 1}</td>
              <td>{formatCompletionStatus(map.completionStatus)}</td>
              <td className="num">{map.stats?.deaths ?? "-"}</td>
              <td className="num">{formatTime(map.stats?.timePlayed)}</td>
              <td className="num">
                {formatStrawberries(
                  map.stats?.strawberries,
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
  onUpdate: (candidate: ModUpdateCandidate) => void;
}) {
  return (
    <table className={showWarningColumn ? "record-table mod-table show-warning" : "record-table mod-table"}>
      <colgroup>
        <col className="w-actions" />
        <col className="w-name" />
        <col className="w-kind" />
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
          <th>测试图</th>
          {showWarningColumn && <th>警告</th>}
        </tr>
      </thead>
      <tbody>
        {mods.map((modItem) => {
          const enabled = isEnabled(modItem.id);
          const updateCandidate = updatesByRecordId.get(modItem.id);
          return (
            <tr className={selectedMod?.id === modItem.id ? "active" : ""} key={modItem.id} onClick={() => onSelect(modItem.id)}>
              <td className="action-cell">
                <div className="record-actions">
                  <ToggleButton enabled={enabled} label="Mod" onClick={() => onToggle(modItem)} />
                  <div className="record-flag-actions" aria-label="Mod 标记">
                    <FlagButton
                      active={modItem.favorite}
                      icon={<Star size={16} />}
                      label="收藏"
                      variant="favorite"
                      onClick={() => onFavoriteToggle(modItem)}
                    />
                    <FlagButton
                      active={modItem.protected}
                      icon={modItem.protected ? <Lock size={16} /> : <Shield size={16} />}
                      label="始终启用"
                      variant="protected"
                      onClick={() => onProtectedToggle(modItem)}
                    />
                  </div>
                </div>
              </td>
              <td className="name-cell">
                <div className="name-title-row">
                  <strong title={modItem.name}>{modItem.name}</strong>
                  {modItem.metadata.version && (
                    <span className="version-text" title={modItem.metadata.version}>
                      {modItem.metadata.version}
                    </span>
                  )}
                  {updateCandidate && <InlineUpdateButton candidate={updateCandidate} onUpdate={onUpdate} />}
                </div>
              </td>
              <td>{modItem.isArchive ? "zip" : "文件夹"}</td>
              <td className="num">{modItem.dependencies.length}</td>
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
      title={hasDownloadUrl ? `更新到 ${candidate.entry.version || "目录最新版本"}` : "该目录条目没有下载地址"}
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

function ToggleButton({ disabled, enabled, label, onClick }: { disabled?: boolean; enabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={enabled ? "record-toggle enabled" : "record-toggle disabled"}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onClick();
      }}
      title={disabled ? `${label}不能修改启用状态` : enabled ? `禁用${label}` : `启用${label}`}
    >
      {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
    </button>
  );
}
