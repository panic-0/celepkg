import { ArrowLeft, Clock, CircleDot, Folder, FolderOpen, Heart, Skull } from "lucide-react";
import { Fragment, useMemo } from "react";
import type { MapDetailControls } from "../hooks/useMapDetailControls";
import { useScrollMemory, type ScrollMemory } from "../hooks/useScrollMemory";
import type { ModRecord, SubMapInfo } from "../types";
import { buildLocalDependencyTree } from "../utils/dependencyTree";
import { formatCompletionStatus, formatHeartCassette, formatStrawberries, formatTime, strawberryCollected } from "../utils/format";
import { createSearchMatcher, matchSearchFields, rangesForField, type SearchField, type SearchMatch } from "../utils/search";
import { sortSubMaps } from "../utils/subMapSorting";
import type { StrawberryDenominator } from "../viewTypes";
import {
  ALL_SUB_MAP_FOLDER,
  collectSubMapFolderOptions,
  normalizeFolderPath,
  subMapIsDirectChildOfFolder,
  subMapMatchesFolder
} from "../utils/subMapFolders";
import type { MapDetailTab } from "../hooks/useUiLayout";
import { DetailStat, HighlightedText, Info } from "./common";
import { DependencyReferenceList, DependencyTreeView, LongValue, TabButton } from "./detailCommon";
import type { DependencyReference } from "../utils/dependencies";

type MapDetailProps = {
  activeTab: MapDetailTab;
  allRecords: ModRecord[];
  draftEnabled: boolean;
  map?: ModRecord;
  mapDetailControls: MapDetailControls;
  optionalReferences: DependencyReference[];
  requiredReferences: DependencyReference[];
  scrollMemory: ScrollMemory;
  strawberryDenominator: StrawberryDenominator;
  onBack: () => void;
  onLocationOpen: (map: ModRecord) => void;
  onTabChange: (tab: MapDetailTab) => void;
};

export function MapDetail({
  activeTab,
  allRecords,
  draftEnabled,
  map,
  mapDetailControls,
  optionalReferences,
  requiredReferences,
  scrollMemory,
  strawberryDenominator,
  onBack,
  onLocationOpen,
  onTabChange
}: MapDetailProps) {
  const mapId = map?.id ?? "empty";
  const detailPanelRef = useScrollMemory<HTMLDivElement>(`map:${mapId}:${activeTab}:panel`, scrollMemory);
  const dependencyTree = activeTab === "dependencies" && map ? buildLocalDependencyTree(map, allRecords) : null;
  const subMapTableRef = useScrollMemory<HTMLDivElement>(`map:${mapId}:submaps:table`, scrollMemory);
  const {
    effectiveSubMapPath,
    groupSubMapsByDifficulty,
    selectedSubMapId,
    subMapQuery,
    subMapRootPath,
    subMapSortDescending,
    subMapSortKey,
    selectSubMap,
    updateSubMapPath
  } = mapDetailControls;
  const subMapBreadcrumbs = useMemo(
    () => buildSubMapBreadcrumbs(effectiveSubMapPath, subMapRootPath),
    [effectiveSubMapPath, subMapRootPath]
  );
  const subMapFolderOptions = useMemo(
    () => (map ? collectSubMapFolderOptions(map.subMaps, effectiveSubMapPath) : []),
    [effectiveSubMapPath, map]
  );
  const subMapSearchMatcher = useMemo(() => createSearchMatcher(subMapQuery), [subMapQuery]);
  const filteredSubMaps = useMemo(() => {
    if (!map) return [];
    const matchingSubMaps = map.subMaps.filter((subMap) => {
      if (!subMapMatchesFolder(subMap, effectiveSubMapPath)) return false;
      if (!subMapSearchMatcher.active && subMapFolderOptions.length > 0 && !subMapIsDirectChildOfFolder(subMap, effectiveSubMapPath)) {
        return false;
      }
      return matchSearchFields(searchFieldsForSubMap(subMap), subMapSearchMatcher).matched;
    });
    return sortSubMaps(matchingSubMaps, {
      descending: subMapSortDescending,
      groupByDifficulty: groupSubMapsByDifficulty,
      sortKey: subMapSortKey,
      strawberryDenominator
    });
  }, [
    effectiveSubMapPath,
    groupSubMapsByDifficulty,
    map,
    subMapSearchMatcher,
    strawberryDenominator,
    subMapFolderOptions.length,
    subMapSortDescending,
    subMapSortKey
  ]);
  const subMapSearchMatches = useMemo(() => {
    const matches = new Map<string, SearchMatch>();
    if (!map) return matches;
    for (const subMap of map.subMaps) {
      matches.set(subMap.id, matchSearchFields(searchFieldsForSubMap(subMap), subMapSearchMatcher));
    }
    return matches;
  }, [map, subMapSearchMatcher]);
  const selectedSubMap = useMemo(() => {
    if (!map) return undefined;
    return filteredSubMaps.find((subMap) => subMap.id === selectedSubMapId);
  }, [filteredSubMaps, map, selectedSubMapId]);

  if (!map) {
    return (
      <section className="ui-panel detail-pane">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回列表
        </button>
        <div className="ui-empty-state empty-state compact">
          <FolderOpen size={24} />
          <p>选择一个地图查看详情。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="ui-panel detail-pane">
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
        <div className="detail-tab-panel overview-panel" ref={detailPanelRef}>
          <div className="detail-overview-grid">
            <div className="stat-grid overview-card">
              <DetailStat icon={<Skull size={18} />} label="死亡" value={map.stats?.deaths ?? "-"} />
              <DetailStat icon={<Clock size={18} />} label="用时" value={formatTime(map.stats?.timePlayed)} />
              <DetailStat
                icon={<CircleDot size={18} />}
                label="草莓"
                value={formatStrawberries(
                  strawberryCollected(map.stats, strawberryDenominator),
                  strawberryTotal(map, strawberryDenominator),
                  map.stats?.strawberriesKnown ?? true
                )}
              />
              <DetailStat
                icon={<Heart size={18} />}
                label="心/磁带"
                value={map.stats ? `${map.stats.hearts}/${map.stats.cassettes}` : "-"}
              />
            </div>
            <section className="detail-section flush overview-card">
              <h3>地图信息</h3>
              <div className="overview-info-grid">
                <Info label="完成" value={formatCompletionStatus(map.completionStatus)} />
                <Info label="作者" value={map.metadata.author || "未知"} />
                <Info label="版本" value={map.metadata.version || "未知"} />
                <Info label="类型" value={map.readOnly ? "Celeste 官方地图" : map.isArchive ? "zip 地图包" : "文件夹地图包"} />
                <Info label="小图" value={`${map.subMaps.length} 张`} />
              </div>
              <Info label="描述" value={map.metadata.description || "无"} />
            </section>
          </div>
        </div>
      )}

      {activeTab === "submaps" && (
        <div className="detail-tab-panel sub-map-tab-panel" ref={detailPanelRef}>
          {map.subMaps.length ? (
            <>
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
                    {!subMapSearchMatcher.active &&
                      subMapFolderOptions.map((folder) => {
                        const summary = summarizeSubMapFolder(map.subMaps, folder.path, strawberryDenominator);
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
                              <strong>
                                <HighlightedText
                                  ranges={rangesForField(subMapSearchMatches.get(subMap.id), "name")}
                                  text={subMap.displayName || "未知"}
                                />
                              </strong>
                              <small>
                                <HighlightedText
                                  ranges={rangesForField(subMapSearchMatches.get(subMap.id), "sidName")}
                                  text={subMapSidName(subMap.sid)}
                                />
                              </small>
                            </span>
                          </td>
                          <td>{formatCompletionStatus(subMap.completionStatus)}</td>
                          <td className="num">{subMap.stats?.deaths ?? "-"}</td>
                          <td className="num">{formatTime(subMap.stats?.timePlayed)}</td>
                          <td className="num">
                            {formatStrawberries(
                              strawberryCollected(subMap.stats, strawberryDenominator),
                              strawberryTotal(subMap, strawberryDenominator),
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
                                {subMap.difficulty && <Info label="难度" value={subMap.difficulty} />}
                                <Info label="完成" value={formatCompletionStatus(subMap.completionStatus)} />
                                <Info
                                  label="草莓"
                                  value={formatStrawberries(
                                    strawberryCollected(subMap.stats, strawberryDenominator),
                                    strawberryTotal(subMap, strawberryDenominator),
                                    subMap.stats?.strawberriesKnown ?? true
                                  )}
                                />
                                <Info label="SID" value={subMap.sid} />
                                <Info label="文件" value={subMap.filePath} />
                              </div>
                              <p className="muted">{subMap.stats?.saveFiles.join(", ") || "未在存档中匹配到这张小图。"}</p>
                              {subMap.stats && subMap.stats.staleStrawberries > 0 && (
                                <p className="warning-text">存档含 {subMap.stats.staleStrawberries} 个当前地图不存在的历史草莓记录。</p>
                              )}
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
        <div className="detail-tab-panel detail-split-panel" ref={detailPanelRef}>
          <section className="detail-section flush">
            <div className="detail-section-title">
              <h3>文件</h3>
              <button className="detail-action-button" onClick={() => onLocationOpen(map)} type="button">
                <FolderOpen size={15} />
                打开位置
              </button>
            </div>
            <LongValue label="文件" value={map.relativePath} />
            <LongList label="SID" values={map.mapIds} emptyText="无" />
          </section>
          <section className="detail-section">
            <h3>依赖树</h3>
            {dependencyTree && dependencyTree.children.length ? (
              <DependencyTreeView nodes={dependencyTree.children} />
            ) : (
              <p className="muted">没有声明依赖。</p>
            )}
          </section>
          <section className="detail-section">
            <h3>直接依赖</h3>
            {map.dependencies.length ? (
              <div className="dependency-list">
                {map.dependencies.map((dependency) => (
                  <span
                    className="ui-chip"
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
          <section className="detail-section">
            <h3>被依赖</h3>
            <DependencyReferenceList references={requiredReferences} emptyText="没有被其他地图或 Mod 声明为必需依赖。" />
          </section>
          <section className="detail-section">
            <h3>被可选依赖</h3>
            <DependencyReferenceList references={optionalReferences} emptyText="没有被其他地图或 Mod 声明为可选依赖。" />
          </section>
        </div>
      )}

      {activeTab === "saves" && (
        <div className="detail-tab-panel" ref={detailPanelRef}>
          <section className="detail-section flush">
            <h3>存档来源</h3>
            <LongList values={map.stats?.saveFiles ?? []} emptyText="未在 Saves/*.celeste 中匹配到该地图统计。" />
            {map.stats && map.stats.staleStrawberries > 0 && (
              <p className="warning-text">存档含 {map.stats.staleStrawberries} 个当前地图不存在的历史草莓记录。</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function summarizeSubMapFolder(subMaps: SubMapInfo[], path: string, strawberryDenominator: StrawberryDenominator) {
  const members = subMaps.filter((subMap) => subMapMatchesFolder(subMap, path));
  const statsMembers = members.filter((subMap) => subMap.stats);
  const totalStrawberries = members.reduce((sum, subMap) => sum + strawberryTotal(subMap, strawberryDenominator), 0);
  const collectedStrawberries = statsMembers.reduce(
    (sum, subMap) => sum + (strawberryCollected(subMap.stats, strawberryDenominator) ?? 0),
    0
  );
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

function strawberryTotal(record: ModRecord | SubMapInfo, strawberryDenominator: StrawberryDenominator) {
  return strawberryDenominator === "total" ? record.strawberryTotalCount : record.strawberryCount;
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

function searchFieldsForSubMap(subMap: SubMapInfo): SearchField[] {
  return [
    { key: "name", text: subMap.displayName, weight: 10 },
    { key: "sid", text: subMap.sid, weight: 8 },
    { key: "sidName", text: subMapSidName(subMap.sid), weight: 8 },
    { key: "chapter", text: subMap.chapter, weight: 6 },
    { key: "filePath", text: subMap.filePath, weight: 6 },
    { key: "difficulty", text: subMap.difficulty, weight: 4 }
  ];
}

function LongList({ label, values, emptyText }: { label?: string; values: string[]; emptyText: string }) {
  return (
    <div className="ui-long-value long-list-field">
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
