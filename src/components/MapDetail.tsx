import { ArrowLeft, Clock, CircleDot, FolderOpen, Heart, Search, Skull } from "lucide-react";
import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { useScrollMemory, type ScrollMemory } from "../hooks/useScrollMemory";
import type { ModRecord } from "../types";
import { formatCompletionStatus, formatHeartCassette, formatTime } from "../utils/format";
import type { MapDetailTab } from "../hooks/useUiLayout";
import { DetailStat, Info } from "./common";

export type MapDetailMemoryState = {
  selectedSubMapId: string;
  subMapQuery: string;
};

type MapDetailProps = {
  activeTab: MapDetailTab;
  draftEnabled: boolean;
  map?: ModRecord;
  mapDetailMemory: MutableRefObject<Record<string, MapDetailMemoryState>>;
  scrollMemory: ScrollMemory;
  onBack: () => void;
  onTabChange: (tab: MapDetailTab) => void;
};

export function MapDetail({ activeTab, draftEnabled, map, mapDetailMemory, scrollMemory, onBack, onTabChange }: MapDetailProps) {
  const [selectedSubMapId, setSelectedSubMapId] = useState("");
  const [subMapQuery, setSubMapQuery] = useState("");
  const mapId = map?.id ?? "empty";
  const detailPanelRef = useScrollMemory<HTMLDivElement>(`map:${mapId}:${activeTab}:panel`, scrollMemory);
  const subMapTableRef = useScrollMemory<HTMLDivElement>(`map:${mapId}:submaps:table`, scrollMemory);
  const selectedSubMap = useMemo(() => {
    if (!map) return undefined;
    return map.subMaps.find((subMap) => subMap.id === selectedSubMapId) ?? map.subMaps[0];
  }, [map, selectedSubMapId]);
  const filteredSubMaps = useMemo(() => {
    if (!map) return [];
    const needle = subMapQuery.trim().toLowerCase();
    if (!needle) return map.subMaps;
    return map.subMaps.filter((subMap) =>
      [subMap.displayName, subMap.sid, subMap.chapter, subMap.filePath].join(" ").toLowerCase().includes(needle)
    );
  }, [map, subMapQuery]);

  useEffect(() => {
    const saved = map ? mapDetailMemory.current[map.id] : undefined;
    setSelectedSubMapId(saved?.selectedSubMapId ?? "");
    setSubMapQuery(saved?.subMapQuery ?? "");
  }, [map?.id, mapDetailMemory]);

  function updateMapDetailMemory(value: Partial<MapDetailMemoryState>) {
    if (!map) return;
    const current = mapDetailMemory.current[map.id] ?? {
      selectedSubMapId: "",
      subMapQuery: ""
    };
    mapDetailMemory.current[map.id] = {
      ...current,
      ...value
    };
  }

  function updateSubMapQuery(value: string) {
    setSubMapQuery(value);
    updateMapDetailMemory({ subMapQuery: value });
  }

  function selectSubMap(id: string) {
    setSelectedSubMapId(id);
    updateMapDetailMemory({ selectedSubMapId: id });
  }

  if (!map) {
    return (
      <section className="detail-pane">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回列表
        </button>
        <div className="empty-state compact">
          <FolderOpen size={24} />
          <p>选择一个地图查看详情。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="detail-pane">
      <div className="detail-heading">
        <div className="detail-topline">
          <button className="back-button" onClick={onBack}>
            <ArrowLeft size={17} />
            返回列表
          </button>
          <span className={draftEnabled ? "state enabled" : "state disabled"}>{draftEnabled ? "启用" : "禁用"}</span>
        </div>
        <h2 title={map.name}>{map.name}</h2>
        <p title={map.metadata.description || map.fileName}>{map.metadata.description || map.fileName}</p>
      </div>

      <div className="detail-tabs" role="tablist">
        <TabButton active={activeTab === "overview"} onClick={() => onTabChange("overview")}>概览</TabButton>
        <TabButton active={activeTab === "submaps"} onClick={() => onTabChange("submaps")}>小图</TabButton>
        <TabButton active={activeTab === "dependencies"} onClick={() => onTabChange("dependencies")}>依赖/文件</TabButton>
        <TabButton active={activeTab === "saves"} onClick={() => onTabChange("saves")}>存档来源</TabButton>
      </div>

      {activeTab === "overview" && (
        <div className="detail-tab-panel" ref={detailPanelRef}>
          <div className="stat-grid">
            <DetailStat icon={<Skull size={18} />} label="死亡" value={map.stats?.deaths ?? "-"} />
            <DetailStat icon={<Clock size={18} />} label="用时" value={formatTime(map.stats?.timePlayed)} />
            <DetailStat icon={<CircleDot size={18} />} label="草莓" value={map.stats?.strawberries ?? "-"} />
            <DetailStat icon={<Heart size={18} />} label="心/磁带" value={map.stats ? `${map.stats.hearts}/${map.stats.cassettes}` : "-"} />
          </div>
          <section className="detail-section">
            <h3>地图信息</h3>
            <Info label="完成" value={formatCompletionStatus(map.completionStatus)} />
            <Info label="作者" value={map.metadata.author || "未知"} />
            <Info label="版本" value={map.metadata.version || "未知"} />
            <Info label="类型" value={map.isArchive ? "zip 地图包" : "文件夹地图包"} />
            <Info label="小图" value={`${map.subMaps.length} 张`} />
          </section>
        </div>
      )}

      {activeTab === "submaps" && (
        <div className="detail-tab-panel" ref={detailPanelRef}>
          {map.subMaps.length ? (
            <>
              <label className="sub-map-search">
                <Search size={15} />
                <input
                  value={subMapQuery}
                  onChange={(event) => updateSubMapQuery(event.target.value)}
                  placeholder="筛选小图名称、SID、章节"
                />
              </label>
              <div className="sub-map-table-wrap" ref={subMapTableRef}>
                <table className="sub-map-table">
                  <colgroup>
                    <col className="w-sub-name" />
                    <col className="w-sub-chapter" />
                    <col className="w-sub-sid" />
                    <col className="w-sub-progress" />
                    <col className="w-sub-number" />
                    <col className="w-sub-time" />
                    <col className="w-sub-number" />
                    <col className="w-sub-heart" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>章节</th>
                      <th>SID</th>
                      <th>完成</th>
                      <th className="num">死亡</th>
                      <th className="num">用时</th>
                      <th className="num">草莓</th>
                      <th>心/磁带</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubMaps.map((subMap) => (
                      <tr
                        className={selectedSubMap?.id === subMap.id ? "active" : ""}
                        key={subMap.id}
                        onClick={() => selectSubMap(subMap.id)}
                      >
                        <td title={subMap.displayName}>{subMap.displayName || "未知"}</td>
                        <td title={subMap.chapter}>{subMap.chapter || "未知"}</td>
                        <td title={subMap.sid}>{subMap.sid}</td>
                        <td>{formatCompletionStatus(subMap.completionStatus)}</td>
                        <td className="num">{subMap.stats?.deaths ?? "-"}</td>
                        <td className="num">{formatTime(subMap.stats?.timePlayed)}</td>
                        <td className="num">{subMap.stats?.strawberries ?? "-"}</td>
                        <td>{formatHeartCassette(subMap.stats)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedSubMap && (
                <section className="detail-section sub-map-detail">
                  <h3>当前小图</h3>
                  <Info label="名称" value={selectedSubMap.displayName || "未知"} />
                  <Info label="章节" value={selectedSubMap.chapter || "未知"} />
                  <Info label="完成" value={formatCompletionStatus(selectedSubMap.completionStatus)} />
                  <Info label="SID" value={selectedSubMap.sid} />
                  <Info label="文件" value={selectedSubMap.filePath} />
                  <p className="muted">{selectedSubMap.stats?.saveFiles.join(", ") || "未在存档中匹配到这张小图。"}</p>
                </section>
              )}
            </>
          ) : (
            <p className="muted">未检测到 Maps/*.bin。</p>
          )}
        </div>
      )}

      {activeTab === "dependencies" && (
        <div className="detail-tab-panel" ref={detailPanelRef}>
          <section className="detail-section flush">
            <h3>文件</h3>
            <LongValue label="文件" value={map.relativePath} />
            <LongList label="SID" values={map.mapIds} emptyText="无" />
          </section>
          <section className="detail-section">
            <h3>依赖</h3>
            {map.dependencies.length ? (
              <div className="dependency-list">
                {map.dependencies.map((dependency) => (
                  <span key={`${dependency.name}-${dependency.version}`} title={`${dependency.name}${dependency.version ? ` ${dependency.version}` : ""}`}>
                    {dependency.name}
                    {dependency.version && <small>{dependency.version}</small>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">没有声明必需依赖。</p>
            )}
            {map.warnings.map((warning) => (
              <p className="warning-text" key={warning}>{warning}</p>
            ))}
          </section>
        </div>
      )}

      {activeTab === "saves" && (
        <div className="detail-tab-panel" ref={detailPanelRef}>
          <section className="detail-section flush">
            <h3>存档来源</h3>
            <LongList values={map.stats?.saveFiles ?? []} emptyText="未在 Saves/*.celeste 中匹配到该地图统计。" />
          </section>
        </div>
      )}
    </section>
  );
}

function LongValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="long-field">
      <span>{label}</span>
      <code title={value}>{value || "-"}</code>
    </div>
  );
}

function LongList({ label, values, emptyText }: { label?: string; values: string[]; emptyText: string }) {
  return (
    <div className="long-list-field">
      {label && <span>{label}</span>}
      {values.length ? (
        <div className="long-list">
          {values.map((value, index) => (
            <code key={`${value}-${index}`} title={value}>{value}</code>
          ))}
        </div>
      ) : (
        <p className="muted">{emptyText}</p>
      )}
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={active ? "tab-button active" : "tab-button"} onClick={onClick} role="tab" aria-selected={active}>
      {children}
    </button>
  );
}
