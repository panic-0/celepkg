import { FolderOpen, PanelRightClose } from "lucide-react";
import type { ModRecord } from "../types";
import type { ModDetailTab } from "../hooks/useUiLayout";
import { Info } from "./common";

type ModDetailProps = {
  activeTab: ModDetailTab;
  draftEnabled: boolean;
  modItem?: ModRecord;
  onCollapse: () => void;
  onTabChange: (tab: ModDetailTab) => void;
};

export function ModDetail({ activeTab, draftEnabled, modItem, onCollapse, onTabChange }: ModDetailProps) {
  if (!modItem) {
    return (
      <aside className="detail-pane">
        <button className="detail-collapse" onClick={onCollapse} title="收起详情">
          <PanelRightClose size={17} />
        </button>
        <div className="empty-state compact">
          <FolderOpen size={24} />
          <p>选择一个 Mod 查看详情。</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-pane">
      <div className="detail-heading">
        <div className="detail-topline">
          <span className={draftEnabled ? "state enabled" : "state disabled"}>{draftEnabled ? "启用" : "禁用"}</span>
          <button className="detail-collapse" onClick={onCollapse} title="收起详情">
            <PanelRightClose size={17} />
          </button>
        </div>
        <h2 title={modItem.name}>{modItem.name}</h2>
        <p title={modItem.metadata.description || modItem.fileName}>{modItem.metadata.description || modItem.fileName}</p>
      </div>

      <div className="detail-tabs" role="tablist">
        <TabButton active={activeTab === "overview"} onClick={() => onTabChange("overview")}>概览</TabButton>
        <TabButton active={activeTab === "dependencies"} onClick={() => onTabChange("dependencies")}>依赖</TabButton>
        <TabButton active={activeTab === "files"} onClick={() => onTabChange("files")}>文件/警告</TabButton>
      </div>

      {activeTab === "overview" && (
        <div className="detail-tab-panel">
          <section className="detail-section flush">
            <h3>Mod 信息</h3>
            <Info label="作者" value={modItem.metadata.author || "未知"} />
            <Info label="版本" value={modItem.metadata.version || "未知"} />
            <Info label="类型" value={modItem.isArchive ? "zip Mod" : "文件夹 Mod"} />
            <Info label="测试图" value={modItem.subMaps.length ? `${modItem.subMaps.length} 张` : "无"} />
          </section>
        </div>
      )}

      {activeTab === "dependencies" && (
        <div className="detail-tab-panel">
          <section className="detail-section flush">
            <h3>依赖</h3>
            {modItem.dependencies.length ? (
              <div className="dependency-list">
                {modItem.dependencies.map((dependency) => (
                  <span key={`${dependency.name}-${dependency.version}`} title={`${dependency.name}${dependency.version ? ` ${dependency.version}` : ""}`}>
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
                  <span key={`${dependency.name}-${dependency.version}`} title={`${dependency.name}${dependency.version ? ` ${dependency.version}` : ""}`}>
                    {dependency.name}
                    {dependency.version && <small>{dependency.version}</small>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">没有声明可选依赖。</p>
            )}
          </section>
        </div>
      )}

      {activeTab === "files" && (
        <div className="detail-tab-panel">
          <section className="detail-section flush">
            <h3>文件</h3>
            <LongValue label="文件" value={modItem.relativePath} />
            <LongValue label="名称" value={modItem.fileName} />
          </section>
          {modItem.warnings.length > 0 && (
            <section className="detail-section">
              <h3>警告</h3>
              <div className="warning-list">
                {modItem.warnings.map((warning) => (
                  <p className="warning-text" key={warning} title={warning}>{warning}</p>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </aside>
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

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={active ? "tab-button active" : "tab-button"} onClick={onClick} role="tab" aria-selected={active}>
      {children}
    </button>
  );
}
