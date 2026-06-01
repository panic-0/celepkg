import { CircleDot, Clock, FolderOpen, Skull, ToggleLeft, ToggleRight } from "lucide-react";
import type { ModRecord } from "../types";
import { formatTime } from "../utils/format";
import type { ActiveView } from "../viewTypes";

type RecordView = Exclude<ActiveView, "profiles">;

type RecordListProps = {
  activeView: RecordView;
  filteredMaps: ModRecord[];
  filteredMods: ModRecord[];
  selectedMap?: ModRecord;
  selectedMod?: ModRecord;
  visibleMapCount: number;
  modCount: number;
  onDisableAll: () => void;
  onEnableAll: () => void;
  onMapSelect: (id: string) => void;
  onMapToggle: (record: ModRecord) => void;
  onModSelect: (id: string) => void;
  onModToggle: (id: string) => void;
  isMapEnabled: (record: ModRecord) => boolean;
  isModEnabled: (id: string) => boolean;
};

export function RecordList({
  activeView,
  filteredMaps,
  filteredMods,
  selectedMap,
  selectedMod,
  visibleMapCount,
  modCount,
  onDisableAll,
  onEnableAll,
  onMapSelect,
  onMapToggle,
  onModSelect,
  onModToggle,
  isMapEnabled,
  isModEnabled
}: RecordListProps) {
  const records = activeView === "maps" ? filteredMaps : filteredMods;
  const total = activeView === "maps" ? visibleMapCount : modCount;
  const hasRecords = records.length > 0;

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

      <div className="record-table-scroll">
        {activeView === "maps" ? (
          <MapTable
            maps={filteredMaps}
            selectedMap={selectedMap}
            onSelect={onMapSelect}
            onToggle={onMapToggle}
            isEnabled={isMapEnabled}
          />
        ) : (
          <ModTable
            mods={filteredMods}
            selectedMod={selectedMod}
            onSelect={onModSelect}
            onToggle={onModToggle}
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
  isEnabled
}: {
  maps: ModRecord[];
  selectedMap?: ModRecord;
  onSelect: (id: string) => void;
  onToggle: (record: ModRecord) => void;
  isEnabled: (record: ModRecord) => boolean;
}) {
  return (
    <table className="record-table map-table">
      <thead>
        <tr>
          <th className="col-toggle">状态</th>
          <th>名称</th>
          <th>作者</th>
          <th>版本</th>
          <th className="num">小图</th>
          <th>完成</th>
          <th className="num"><Skull size={14} />死亡</th>
          <th className="num"><Clock size={14} />用时</th>
          <th className="num"><CircleDot size={14} />草莓</th>
          <th>警告</th>
        </tr>
      </thead>
      <tbody>
        {maps.map((map) => {
          const enabled = isEnabled(map);
          return (
            <tr className={selectedMap?.id === map.id ? "active" : ""} key={map.id} onClick={() => onSelect(map.id)}>
              <td className="col-toggle">
                <ToggleButton enabled={enabled} label="地图" onClick={() => onToggle(map)} />
              </td>
              <td className="name-cell">
                <strong title={map.name}>{map.name}</strong>
                <small title={map.fileName}>{map.fileName}</small>
                <div className="inline-pills">
                  {map.kind === "mod" && <span className="helper-map-pill">测试图</span>}
                  {map.stats && <span>有存档</span>}
                </div>
              </td>
              <td title={map.metadata.author || "未知"}>{map.metadata.author || "未知"}</td>
              <td title={map.metadata.version || "无版本号"}>{map.metadata.version || "无版本号"}</td>
              <td className="num">{map.mapCount || 1}</td>
              <td>{map.stats?.completed ? "已完成" : "未完成"}</td>
              <td className="num">{map.stats?.deaths ?? "-"}</td>
              <td className="num">{formatTime(map.stats?.timePlayed)}</td>
              <td className="num">{map.stats?.strawberries ?? "-"}</td>
              <td>{map.warnings.length ? <span className="warning-pill">{map.warnings.length}</span> : "-"}</td>
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
  isEnabled
}: {
  mods: ModRecord[];
  selectedMod?: ModRecord;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  isEnabled: (id: string) => boolean;
}) {
  return (
    <table className="record-table mod-table">
      <thead>
        <tr>
          <th className="col-toggle">状态</th>
          <th>名称</th>
          <th>作者</th>
          <th>版本</th>
          <th>类型</th>
          <th className="num">依赖</th>
          <th>测试图</th>
          <th>警告</th>
        </tr>
      </thead>
      <tbody>
        {mods.map((modItem) => {
          const enabled = isEnabled(modItem.id);
          return (
            <tr className={selectedMod?.id === modItem.id ? "active" : ""} key={modItem.id} onClick={() => onSelect(modItem.id)}>
              <td className="col-toggle">
                <ToggleButton enabled={enabled} label="Mod" onClick={() => onToggle(modItem.id)} />
              </td>
              <td className="name-cell">
                <strong title={modItem.name}>{modItem.name}</strong>
                <small title={modItem.fileName}>{modItem.fileName}</small>
              </td>
              <td title={modItem.metadata.author || "未知"}>{modItem.metadata.author || "未知"}</td>
              <td title={modItem.metadata.version || "无版本号"}>{modItem.metadata.version || "无版本号"}</td>
              <td>{modItem.isArchive ? "zip" : "文件夹"}</td>
              <td className="num">{modItem.dependencies.length}</td>
              <td>{modItem.subMaps.length ? `${modItem.subMaps.length} 张` : "-"}</td>
              <td>{modItem.warnings.length ? <span className="warning-pill">{modItem.warnings.length}</span> : "-"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ToggleButton({ enabled, label, onClick }: { enabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={enabled ? "switch on" : "switch"}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={enabled ? `禁用${label}` : `启用${label}`}
    >
      {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
    </button>
  );
}
