import { CircleDot, Clock, FolderOpen, Lock, Shield, Skull, Star, ToggleLeft, ToggleRight } from "lucide-react";
import { useScrollMemory, type ScrollMemory } from "../hooks/useScrollMemory";
import type { ModRecord } from "../types";
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
  visibleMapCount: number;
  modCount: number;
  onDisableAll: () => void;
  onEnableAll: () => void;
  onMapSelect: (id: string) => void;
  onMapToggle: (record: ModRecord) => void;
  onModSelect: (id: string) => void;
  onModToggle: (record: ModRecord) => void;
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
  visibleMapCount,
  modCount,
  onDisableAll,
  onEnableAll,
  onMapSelect,
  onMapToggle,
  onModSelect,
  onModToggle,
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
          <h2>{activeView === "maps" ? "地图" : "其他 Mod"}</h2>
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
      </div>

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
          />
        )}
        {!hasRecords && (
          <div className="empty-state table-empty">
            <FolderOpen size={28} />
            <p>{activeView === "maps" ? "没有找到符合条件的地图。" : "没有找到符合条件的 Mod。"}</p>
          </div>
        )}
      </div>
    </section>
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
  isEnabled
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
          <th className="col-actions">操作</th>
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
          return (
            <tr className={selectedMap?.id === map.id ? "active" : ""} key={map.id} onClick={() => onSelect(map.id)}>
              <td className="action-cell">
                <div className="action-group">
                  <ToggleButton disabled={map.readOnly} enabled={enabled} label="地图" onClick={() => onToggle(map)} />
                  <FlagButton active={map.favorite} icon={<Star size={16} />} label="收藏" onClick={() => onFavoriteToggle(map)} />
                  <FlagButton
                    active={map.protected}
                    disabled={map.readOnly}
                    icon={map.protected ? <Lock size={16} /> : <Shield size={16} />}
                    label="保护"
                    onClick={() => onProtectedToggle(map)}
                  />
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
  isEnabled
}: {
  mods: ModRecord[];
  selectedMod?: ModRecord;
  onSelect: (id: string) => void;
  onToggle: (record: ModRecord) => void;
  onFavoriteToggle: (record: ModRecord) => void;
  onProtectedToggle: (record: ModRecord) => void;
  showWarningColumn: boolean;
  isEnabled: (id: string) => boolean;
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
          <th className="col-actions">操作</th>
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
          return (
            <tr className={selectedMod?.id === modItem.id ? "active" : ""} key={modItem.id} onClick={() => onSelect(modItem.id)}>
              <td className="action-cell">
                <div className="action-group">
                  <ToggleButton enabled={enabled} label="Mod" onClick={() => onToggle(modItem)} />
                  <FlagButton active={modItem.favorite} icon={<Star size={16} />} label="收藏" onClick={() => onFavoriteToggle(modItem)} />
                  <FlagButton
                    active={modItem.protected}
                    icon={modItem.protected ? <Lock size={16} /> : <Shield size={16} />}
                    label="保护"
                    onClick={() => onProtectedToggle(modItem)}
                  />
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

function FlagButton({
  active,
  disabled,
  icon,
  label,
  onClick
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "flag-button active" : "flag-button"}
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
      className={enabled ? "switch on" : "switch"}
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
