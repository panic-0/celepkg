import { CircleDot, FolderOpen, Skull, ToggleLeft, ToggleRight } from "lucide-react";
import type { ModRecord } from "../types";
import type { ActiveView } from "../viewTypes";
import { StatIcon } from "./common";

type RecordListProps = {
  activeView: ActiveView;
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
  const hasRecords = activeView === "maps" ? visibleMapCount > 0 : modCount > 0;

  return (
    <section className="map-list" aria-label={activeView === "maps" ? "地图列表" : "其他 Mod 列表"}>
      <div className="list-header">
        <div>
          <h2>{activeView === "maps" ? "地图" : "其他 Mod"}</h2>
          <p>
            {activeView === "maps"
              ? `${filteredMaps.length} / ${visibleMapCount} 个结果`
              : `${filteredMods.length} / ${modCount} 个结果`}
          </p>
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

      <div className="map-scroll">
        {activeView === "maps" ? (
          filteredMaps.map((map) => (
            <MapRow
              key={map.id}
              map={map}
              active={selectedMap?.id === map.id}
              draftEnabled={isMapEnabled(map)}
              onSelect={() => onMapSelect(map.id)}
              onToggle={() => onMapToggle(map)}
            />
          ))
        ) : (
          filteredMods.map((modItem) => (
            <ModRow
              key={modItem.id}
              modItem={modItem}
              active={selectedMod?.id === modItem.id}
              draftEnabled={isModEnabled(modItem.id)}
              onSelect={() => onModSelect(modItem.id)}
              onToggle={() => onModToggle(modItem.id)}
            />
          ))
        )}
        {((activeView === "maps" && !filteredMaps.length) || (activeView === "mods" && !filteredMods.length)) && (
          <div className="empty-state">
            <FolderOpen size={28} />
            <p>{activeView === "maps" ? "没有找到符合条件的地图。" : "没有找到符合条件的 Mod。"}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function MapRow({
  map,
  active,
  draftEnabled,
  onSelect,
  onToggle
}: {
  map: ModRecord;
  active: boolean;
  draftEnabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <article className={active ? "map-row active" : "map-row"} onClick={onSelect}>
      <button
        className={draftEnabled ? "switch on" : "switch"}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        title={draftEnabled ? "禁用地图" : "启用地图"}
      >
        {draftEnabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </button>
      <div className="map-main">
        <div className="map-title-line">
          <h3>{map.name}</h3>
          {map.kind === "mod" && <span className="helper-map-pill">测试图</span>}
          {map.warnings.length > 0 && <span className="warning-pill">缺依赖</span>}
        </div>
        <p>{map.metadata.author || map.fileName}</p>
        <div className="map-meta">
          <span>{map.mapCount || 1} 个地图文件</span>
          <span>{map.metadata.version || "无版本号"}</span>
          {map.kind === "mod" ? <span>随 Mod 管理</span> : map.stats ? <span>有存档</span> : <span>暂无统计</span>}
        </div>
      </div>
      <div className="row-stats">
        <StatIcon icon={<Skull size={15} />} value={map.stats?.deaths ?? "-"} />
        <StatIcon icon={<CircleDot size={15} />} value={map.stats?.strawberries ?? "-"} />
      </div>
    </article>
  );
}

function ModRow({
  modItem,
  active,
  draftEnabled,
  onSelect,
  onToggle
}: {
  modItem: ModRecord;
  active: boolean;
  draftEnabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <article className={active ? "map-row active" : "map-row"} onClick={onSelect}>
      <button
        className={draftEnabled ? "switch on" : "switch"}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        title={draftEnabled ? "禁用 Mod" : "启用 Mod"}
      >
        {draftEnabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </button>
      <div className="map-main">
        <div className="map-title-line">
          <h3>{modItem.name}</h3>
          {modItem.warnings.length > 0 && <span className="warning-pill">有警告</span>}
        </div>
        <p>{modItem.metadata.author || modItem.fileName}</p>
        <div className="map-meta">
          <span>{modItem.isArchive ? "zip" : "文件夹"}</span>
          <span>{modItem.metadata.version || "无版本号"}</span>
          <span>{modItem.dependencies.length} 个依赖</span>
        </div>
      </div>
    </article>
  );
}
