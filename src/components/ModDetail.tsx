import { ArrowLeft, FolderOpen } from "lucide-react";
import { useScrollMemory, type ScrollMemory } from "../hooks/useScrollMemory";
import type { ModRecord } from "../types";
import type { DependencyReference } from "../utils/dependencies";
import { buildLocalDependencyTree } from "../utils/dependencyTree";
import type { ModDetailTab } from "../hooks/useUiLayout";
import { Info } from "./common";
import { DependencyReferenceList, DependencyTreeView, LongValue, TabButton } from "./detailCommon";

type ModDetailProps = {
  activeTab: ModDetailTab;
  allRecords: ModRecord[];
  draftEnabled: boolean;
  modItem?: ModRecord;
  optionalReferences: DependencyReference[];
  requiredReferences: DependencyReference[];
  scrollMemory: ScrollMemory;
  onBack: () => void;
  onLocationOpen: (modItem: ModRecord) => void;
  onTabChange: (tab: ModDetailTab) => void;
};

export function ModDetail({
  activeTab,
  allRecords,
  draftEnabled,
  modItem,
  optionalReferences,
  requiredReferences,
  scrollMemory,
  onBack,
  onLocationOpen,
  onTabChange
}: ModDetailProps) {
  const modId = modItem?.id ?? "empty";
  const detailPanelRef = useScrollMemory<HTMLDivElement>(`mod:${modId}:${activeTab}:panel`, scrollMemory);
  const dependencyTree = activeTab === "dependencies" && modItem ? buildLocalDependencyTree(modItem, allRecords) : null;

  if (!modItem) {
    return (
      <section className="ui-panel detail-pane">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回列表
        </button>
        <div className="ui-empty-state empty-state compact">
          <FolderOpen size={24} />
          <p>选择一个 Mod 查看详情。</p>
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
          <div className="detail-topline-actions">
            <span className={draftEnabled ? "state enabled" : "state disabled"}>{draftEnabled ? "启用" : "禁用"}</span>
            <button className="detail-action-button" onClick={() => onLocationOpen(modItem)} type="button">
              <FolderOpen size={15} />
              打开所在位置
            </button>
          </div>
        </div>
        <div className="detail-title-row">
          <h2 title={modItem.name}>{modItem.name}</h2>
          <span title={modItem.fileName}>{modItem.fileName}</span>
        </div>
        <p title={modItem.metadata.description || modItem.fileName}>{modItem.metadata.description || modItem.fileName}</p>
      </div>

      <div className="detail-tabs">
        <TabButton active={activeTab === "overview"} onClick={() => onTabChange("overview")}>
          概览
        </TabButton>
        <TabButton active={activeTab === "dependencies"} onClick={() => onTabChange("dependencies")}>
          依赖
        </TabButton>
        <TabButton active={activeTab === "files"} onClick={() => onTabChange("files")}>
          文件/警告
        </TabButton>
      </div>

      {activeTab === "overview" && (
        <div className="detail-tab-panel overview-panel" ref={detailPanelRef}>
          <section className="detail-section flush overview-card">
            <h3>Mod 信息</h3>
            <div className="overview-metrics">
              <Metric label="类型" value={modItem.isArchive ? "zip" : "文件夹"} />
              <Metric label="依赖" value={modItem.dependencies.length} />
              <Metric label="被依赖" value={requiredReferences.length} />
              <Metric label="可选依赖" value={modItem.optionalDependencies.length} />
              <Metric label="警告" value={modItem.warnings.length} tone={modItem.warnings.length ? "warn" : undefined} />
              <Metric label="测试图" value={modItem.subMaps.length ? `${modItem.subMaps.length} 张` : "无"} />
            </div>
            <div className="overview-info-grid">
              <Info label="作者" value={modItem.metadata.author || "未知"} />
              <Info label="版本" value={modItem.metadata.version || "未知"} />
              <Info label="文件" value={modItem.fileName} />
            </div>
            <Info label="描述" value={modItem.metadata.description || "无"} />
          </section>
        </div>
      )}

      {activeTab === "dependencies" && (
        <div className="detail-tab-panel detail-split-panel" ref={detailPanelRef}>
          <section className="detail-section flush">
            <h3>依赖树</h3>
            {dependencyTree && dependencyTree.children.length ? (
              <DependencyTreeView nodes={dependencyTree.children} />
            ) : (
              <p className="muted">没有声明依赖。</p>
            )}
          </section>

          <section className="detail-section">
            <h3>直接依赖</h3>
            {modItem.dependencies.length ? (
              <div className="dependency-list">
                {modItem.dependencies.map((dependency) => (
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
          </section>

          <section className="detail-section">
            <h3>可选依赖</h3>
            {modItem.optionalDependencies.length ? (
              <div className="dependency-list">
                {modItem.optionalDependencies.map((dependency) => (
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
              <p className="muted">没有声明可选依赖。</p>
            )}
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

      {activeTab === "files" && (
        <div className="detail-tab-panel detail-split-panel" ref={detailPanelRef}>
          <section className="detail-section flush">
            <div className="detail-section-title">
              <h3>文件</h3>
              <button className="detail-action-button" onClick={() => onLocationOpen(modItem)} type="button">
                <FolderOpen size={15} />
                打开位置
              </button>
            </div>
            <LongValue label="文件" value={modItem.relativePath} />
            <LongValue label="名称" value={modItem.fileName} />
          </section>
          {modItem.warnings.length > 0 && (
            <section className="detail-section">
              <h3>警告</h3>
              <div className="warning-list">
                {modItem.warnings.map((warning) => (
                  <p className="warning-text" key={warning} title={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, tone, value }: { label: string; tone?: "warn"; value: React.ReactNode }) {
  return (
    <span className={tone ? `overview-metric ${tone}` : "overview-metric"}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
