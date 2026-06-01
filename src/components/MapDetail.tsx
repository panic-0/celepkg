import { Clock, CircleDot, FolderOpen, Heart, Search, Skull } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ModRecord } from "../types";
import { formatHeartCassette, formatTime } from "../utils/format";
import { DetailStat, Info } from "./common";

export function MapDetail({ map, draftEnabled }: { map?: ModRecord; draftEnabled: boolean }) {
  const [selectedSubMapId, setSelectedSubMapId] = useState("");
  const [subMapQuery, setSubMapQuery] = useState("");
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
    setSelectedSubMapId("");
    setSubMapQuery("");
  }, [map?.id]);

  if (!map) {
    return (
      <aside className="detail-pane">
        <div className="empty-state">
          <FolderOpen size={28} />
          <p>选择一个地图查看详情。</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-pane">
      <div className="detail-heading">
        <span className={draftEnabled ? "state enabled" : "state disabled"}>{draftEnabled ? "启用" : "禁用"}</span>
        <h2>{map.name}</h2>
        <p>{map.metadata.description || map.fileName}</p>
      </div>

      <div className="stat-grid">
        <DetailStat icon={<Skull size={18} />} label="死亡" value={map.stats?.deaths ?? "-"} />
        <DetailStat icon={<Clock size={18} />} label="用时" value={formatTime(map.stats?.timePlayed)} />
        <DetailStat icon={<CircleDot size={18} />} label="草莓" value={map.stats?.strawberries ?? "-"} />
        <DetailStat icon={<Heart size={18} />} label="心/磁带" value={map.stats ? `${map.stats.hearts}/${map.stats.cassettes}` : "-"} />
      </div>

      <section className="detail-section">
        <h3>地图信息</h3>
        <Info label="作者" value={map.metadata.author || "未知"} />
        <Info label="版本" value={map.metadata.version || "未知"} />
        <Info label="文件" value={map.relativePath} />
        <Info label="类型" value={map.isArchive ? "zip 地图包" : "文件夹地图包"} />
      </section>

      <section className="detail-section">
        <div className="section-title-row">
          <h3>小图</h3>
          <span>{map.subMaps.length} 张</span>
        </div>
        {map.subMaps.length ? (
          <>
            <label className="sub-map-search">
              <Search size={15} />
              <input
                value={subMapQuery}
                onChange={(event) => setSubMapQuery(event.target.value)}
                placeholder="筛选小图名称、SID、章节"
              />
            </label>
            <div className="sub-map-list" role="listbox">
              {filteredSubMaps.map((subMap, index) => (
                <button
                  className={selectedSubMap?.id === subMap.id ? "sub-map-item active" : "sub-map-item"}
                  key={subMap.id}
                  onClick={() => setSelectedSubMapId(subMap.id)}
                >
                  <span className="sub-map-index">{index + 1}</span>
                  <span className="sub-map-copy">
                    <strong title={subMap.displayName || `小图 ${index + 1}`}>{subMap.displayName || `小图 ${index + 1}`}</strong>
                    <small title={subMap.sid}>{subMap.sid}</small>
                  </span>
                  <span className="sub-map-stats">
                    <span>{subMap.stats?.deaths ?? "-"}</span>
                    <span>{subMap.stats?.strawberries ?? "-"}</span>
                  </span>
                </button>
              ))}
              {!filteredSubMaps.length && <p className="muted sub-map-empty">没有匹配的小图。</p>}
            </div>
          </>
        ) : (
          <p className="muted">未检测到 Maps/*.bin。</p>
        )}
      </section>

      {selectedSubMap && (
        <section className="detail-section sub-map-detail">
          <h3>当前小图</h3>
          <Info label="名称" value={selectedSubMap.displayName || "未知"} />
          <Info label="章节" value={selectedSubMap.chapter || "未知"} />
          <Info label="SID" value={selectedSubMap.sid} />
          <Info label="文件" value={selectedSubMap.filePath} />
          <div className="mini-stat-grid">
            <DetailStat icon={<Skull size={18} />} label="死亡" value={selectedSubMap.stats?.deaths ?? "-"} />
            <DetailStat icon={<Clock size={18} />} label="用时" value={formatTime(selectedSubMap.stats?.timePlayed)} />
            <DetailStat icon={<CircleDot size={18} />} label="草莓" value={selectedSubMap.stats?.strawberries ?? "-"} />
            <DetailStat icon={<Heart size={18} />} label="心/磁带" value={formatHeartCassette(selectedSubMap.stats)} />
          </div>
          <p className="muted">{selectedSubMap.stats?.saveFiles.join(", ") || "未在存档中匹配到这张小图。"}</p>
        </section>
      )}

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

      <section className="detail-section">
        <h3>存档来源</h3>
        <p className="muted">{map.stats?.saveFiles.join(", ") || "未在 Saves/*.celeste 中匹配到该地图统计。"}</p>
      </section>
    </aside>
  );
}
