import { ArrowLeft, Clock, CircleDot, Folder, FolderOpen, Heart, Search, Skull } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { useScrollMemory, type ScrollMemory } from "../hooks/useScrollMemory";
import type { ModRecord, SubMapInfo } from "../types";
import { formatCompletionStatus, formatHeartCassette, formatStrawberries, formatTime } from "../utils/format";
import {
  ALL_SUB_MAP_FOLDER,
  collectSubMapFolderOptions,
  getSubMapRootPath,
  normalizeFolderPath,
  subMapIsDirectChildOfFolder,
  subMapMatchesFolder
} from "../utils/subMapFolders";
import type { MapDetailTab } from "../hooks/useUiLayout";
import { DetailStat, Info } from "./common";

export type MapDetailMemoryState = {
  selectedSubMapId: string;
  subMapPath: string;
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
  const [subMapPath, setSubMapPath] = useState(ALL_SUB_MAP_FOLDER);
  const [subMapQuery, setSubMapQuery] = useState("");
  const mapId = map?.id ?? "empty";
  const detailPanelRef = useScrollMemory<HTMLDivElement>(`map:${mapId}:${activeTab}:panel`, scrollMemory);
  const subMapTableRef = useScrollMemory<HTMLDivElement>(`map:${mapId}:submaps:table`, scrollMemory);
  const subMapRootPath = useMemo(() => (map ? getSubMapRootPath(map.subMaps) : ALL_SUB_MAP_FOLDER), [map]);
  const effectiveSubMapPath = subMapPath === ALL_SUB_MAP_FOLDER ? subMapRootPath : subMapPath;
  const subMapBreadcrumbs = useMemo(
    () => buildSubMapBreadcrumbs(effectiveSubMapPath, subMapRootPath),
    [effectiveSubMapPath, subMapRootPath]
  );
  const subMapFolderOptions = useMemo(
    () => (map ? collectSubMapFolderOptions(map.subMaps, effectiveSubMapPath) : []),
    [effectiveSubMapPath, map]
  );
  const filteredSubMaps = useMemo(() => {
    if (!map) return [];
    const needle = subMapQuery.trim().toLowerCase();
    return map.subMaps.filter((subMap) => {
      if (!subMapMatchesFolder(subMap, effectiveSubMapPath)) return false;
      if (!needle && subMapFolderOptions.length > 0 && !subMapIsDirectChildOfFolder(subMap, effectiveSubMapPath)) return false;
      if (!needle) return true;
      return [subMap.displayName, subMap.sid, subMap.chapter, subMap.filePath].join(" ").toLowerCase().includes(needle);
    });
  }, [effectiveSubMapPath, map, subMapFolderOptions.length, subMapQuery]);
  const selectedSubMap = useMemo(() => {
    if (!map) return undefined;
    return filteredSubMaps.find((subMap) => subMap.id === selectedSubMapId);
  }, [filteredSubMaps, map, selectedSubMapId]);

  useEffect(() => {
    const saved = mapId === "empty" ? undefined : mapDetailMemory.current[mapId];
    const savedPath = saved?.subMapPath === subMapRootPath ? ALL_SUB_MAP_FOLDER : saved?.subMapPath;
    setSelectedSubMapId(saved?.selectedSubMapId ?? "");
    setSubMapPath(savedPath ?? ALL_SUB_MAP_FOLDER);
    setSubMapQuery(saved?.subMapQuery ?? "");
  }, [mapId, mapDetailMemory, subMapRootPath]);

  function updateMapDetailMemory(value: Partial<MapDetailMemoryState>) {
    if (!map) return;
    const current = mapDetailMemory.current[map.id] ?? {
      selectedSubMapId: "",
      subMapPath: ALL_SUB_MAP_FOLDER,
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

  function updateSubMapPath(value: string) {
    setSubMapPath(value);
    setSelectedSubMapId("");
    updateMapDetailMemory({ selectedSubMapId: "", subMapPath: value });
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
        <TabButton active={activeTab === "overview"} onClick={() => onTabChange("overview")}>
          概览
        </TabButton>
        <TabButton active={activeTab === "submaps"} onClick={() => onTabChange("submaps")}>
          小图
        </TabButton>
        <TabButton active={activeTab === "dependencies"} onClick={() => onTabChange("dependencies")}>
          依赖/文件
        </TabButton>
        <TabButton active={activeTab === "saves"} onClick={() => onTabChange("saves")}>
          存档来源
        </TabButton>
      </div>

      {activeTab === "overview" && (
        <div className="detail-tab-panel" ref={detailPanelRef}>
          <div className="stat-grid">
            <DetailStat icon={<Skull size={18} />} label="死亡" value={map.stats?.deaths ?? "-"} />
            <DetailStat icon={<Clock size={18} />} label="用时" value={formatTime(map.stats?.timePlayed)} />
            <DetailStat
              icon={<CircleDot size={18} />}
              label="草莓"
              value={formatStrawberries(map.stats?.strawberries, map.strawberryCount, map.stats?.strawberriesKnown ?? true)}
            />
            <DetailStat icon={<Heart size={18} />} label="心/磁带" value={map.stats ? `${map.stats.hearts}/${map.stats.cassettes}` : "-"} />
          </div>
          <section className="detail-section">
            <h3>地图信息</h3>
            <Info label="完成" value={formatCompletionStatus(map.completionStatus)} />
            <Info label="作者" value={map.metadata.author || "未知"} />
            <Info label="版本" value={map.metadata.version || "未知"} />
            <Info label="类型" value={map.isArchive ? "zip 地图包" : "文件夹地图包"} />
            <Info label="小图" value={`${map.subMaps.length} 张`} />
            <Info label="描述" value={map.metadata.description || "无"} />
          </section>
        </div>
      )}

      {activeTab === "submaps" && (
        <div className="detail-tab-panel sub-map-tab-panel" ref={detailPanelRef}>
          {map.subMaps.length ? (
            <>
              <label className="sub-map-search">
                <Search size={15} />
                <input
                  value={subMapQuery}
                  onChange={(event) => updateSubMapQuery(event.target.value)}
                  placeholder={effectiveSubMapPath === ALL_SUB_MAP_FOLDER ? "筛选小图名称、SID" : `当前：${effectiveSubMapPath}`}
                />
              </label>
              <nav className="sub-map-breadcrumbs" aria-label="小图目录">
                {subMapBreadcrumbs.map((crumb, index) => (
                  <span key={`${crumb.path}-${index}`} className="breadcrumb-part">
                    {index > 0 && <span className="breadcrumb-separator">/</span>}
                    <button
                      className={crumb.path === effectiveSubMapPath ? "breadcrumb-button active" : "breadcrumb-button"}
                      onClick={() => updateSubMapPath(crumb.path)}
                      title={crumb.path === ALL_SUB_MAP_FOLDER ? "小图根目录" : crumb.path}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}
              </nav>
              <div className="sub-map-table-wrap" ref={subMapTableRef}>
                <table className="sub-map-table">
                  <colgroup>
                    <col className="w-sub-name" />
                    <col className="w-sub-progress" />
                    <col className="w-sub-number" />
                    <col className="w-sub-time" />
                    <col className="w-sub-number" />
                    <col className="w-sub-heart" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>完成</th>
                      <th className="num">死亡</th>
                      <th className="num">用时</th>
                      <th className="num">草莓</th>
                      <th>心/磁带</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subMapFolderOptions.map((folder) => {
                      const summary = summarizeSubMapFolder(map.subMaps, folder.path);
                      return (
                        <tr className="folder-row" key={folder.path} onClick={() => updateSubMapPath(folder.path)}>
                          <td title={folder.path}>
                            <span className="folder-row-content">
                              <Folder size={16} />
                              <strong>{folder.label}</strong>
                              <small>{folder.count} 张</small>
                            </span>
                          </td>
                          <td>{summary.completion}</td>
                          <td className="num">{summary.deaths}</td>
                          <td className="num">{summary.time}</td>
                          <td className="num">{summary.strawberries}</td>
                          <td>{summary.heartCassette}</td>
                        </tr>
                      );
                    })}
                    {filteredSubMaps.map((subMap) => (
                      <Fragment key={subMap.id}>
                        <tr className={selectedSubMap?.id === subMap.id ? "active" : ""} onClick={() => selectSubMap(subMap.id)}>
                          <td title={subMap.sid}>
                            <span className="sub-map-name-cell">
                              <strong>{subMap.displayName || "未知"}</strong>
                              <small>{subMapSidName(subMap.sid)}</small>
                            </span>
                          </td>
                          <td>{formatCompletionStatus(subMap.completionStatus)}</td>
                          <td className="num">{subMap.stats?.deaths ?? "-"}</td>
                          <td className="num">{formatTime(subMap.stats?.timePlayed)}</td>
                          <td className="num">
                            {formatStrawberries(
                              subMap.stats?.strawberries,
                              subMap.strawberryCount,
                              subMap.stats?.strawberriesKnown ?? true
                            )}
                          </td>
                          <td>{formatHeartCassette(subMap.stats)}</td>
                        </tr>
                        {selectedSubMap?.id === subMap.id && (
                          <tr className="sub-map-inline-detail">
                            <td colSpan={6}>
                              <div className="inline-detail-grid">
                                <Info label="名称" value={subMap.displayName || "未知"} />
                                <Info label="章节" value={subMap.chapter || "未知"} />
                                <Info label="完成" value={formatCompletionStatus(subMap.completionStatus)} />
                                <Info
                                  label="草莓"
                                  value={formatStrawberries(
                                    subMap.stats?.strawberries,
                                    subMap.strawberryCount,
                                    subMap.stats?.strawberriesKnown ?? true
                                  )}
                                />
                                <Info label="SID" value={subMap.sid} />
                                <Info label="文件" value={subMap.filePath} />
                              </div>
                              <p className="muted">{subMap.stats?.saveFiles.join(", ") || "未在存档中匹配到这张小图。"}</p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
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
                  <span
                    key={`${dependency.name}-${dependency.version}`}
                    title={`${dependency.name}${dependency.version ? ` ${dependency.version}` : ""}`}
                  >
                    {dependency.name}
                    {dependency.version && <small>{dependency.version}</small>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">没有声明必需依赖。</p>
            )}
            {map.warnings.map((warning) => (
              <p className="warning-text" key={warning}>
                {warning}
              </p>
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

function summarizeSubMapFolder(subMaps: SubMapInfo[], path: string) {
  const members = subMaps.filter((subMap) => subMapMatchesFolder(subMap, path));
  const statsMembers = members.filter((subMap) => subMap.stats);
  const totalStrawberries = members.reduce((sum, subMap) => sum + subMap.strawberryCount, 0);
  const collectedStrawberries = statsMembers.reduce((sum, subMap) => sum + (subMap.stats?.strawberries ?? 0), 0);
  const strawberriesKnown = statsMembers.every((subMap) => subMap.stats?.strawberriesKnown ?? true);
  const deaths = statsMembers.reduce((sum, subMap) => sum + (subMap.stats?.deaths ?? 0), 0);
  const timePlayed = statsMembers.reduce((sum, subMap) => sum + (subMap.stats?.timePlayed ?? 0), 0);
  const hearts = statsMembers.reduce((sum, subMap) => sum + (subMap.stats?.hearts ?? 0), 0);
  const cassettes = statsMembers.reduce((sum, subMap) => sum + (subMap.stats?.cassettes ?? 0), 0);
  const completable = members.filter((subMap) => subMap.completionStatus !== "notApplicable");
  const known = completable.filter((subMap) => subMap.completionStatus !== "unknown");
  const completed = known.filter((subMap) => subMap.completionStatus === "completed").length;

  return {
    completion: completable.length === 0 ? "不适用" : known.length ? `${completed}/${known.length}` : "未知",
    deaths: statsMembers.length ? deaths : "-",
    heartCassette: statsMembers.length ? `${hearts}/${cassettes}` : "-",
    strawberries: formatStrawberries(statsMembers.length ? collectedStrawberries : undefined, totalStrawberries, strawberriesKnown),
    time: statsMembers.length ? formatTime(timePlayed) : "-"
  };
}

function buildSubMapBreadcrumbs(activePath: string, rootPath: string) {
  const rootSegments = normalizeFolderPath(rootPath);
  const activeSegments = normalizeFolderPath(activePath);
  const breadcrumbs: Array<{ label: string; path: string }> = [];

  if (!rootSegments.length) {
    breadcrumbs.push({ label: "小图", path: ALL_SUB_MAP_FOLDER });
    activeSegments.forEach((segment, index) => {
      breadcrumbs.push({
        label: segment,
        path: activeSegments.slice(0, index + 1).join("/")
      });
    });
    return breadcrumbs;
  }

  breadcrumbs.push({ label: rootSegments.join("/"), path: rootSegments.join("/") });
  activeSegments.slice(rootSegments.length).forEach((segment, index) => {
    breadcrumbs.push({
      label: segment,
      path: [...rootSegments, ...activeSegments.slice(rootSegments.length, rootSegments.length + index + 1)].join("/")
    });
  });
  return breadcrumbs;
}

function subMapSidName(sid: string) {
  return sid.split("/").filter(Boolean).at(-1) ?? sid;
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
            <code key={`${value}-${index}`} title={value}>
              {value}
            </code>
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
