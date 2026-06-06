import { AlertTriangle, FileWarning, ListChecks, X } from "lucide-react";
import type { ModRecord } from "../types";

type IssueDrawerProps = {
  configWarnings: string[];
  itemWarnings: ModRecord[];
  open: boolean;
  scanWarnings: string[];
  onClose: () => void;
};

export function IssueDrawer({ configWarnings, itemWarnings, open, scanWarnings, onClose }: IssueDrawerProps) {
  if (!open) return null;
  const hasIssues = configWarnings.length > 0 || scanWarnings.length > 0 || itemWarnings.length > 0;

  return (
    <div className="issue-drawer-backdrop">
      <aside className="issue-drawer">
        <header className="issue-drawer-header">
          <div>
            <h2>问题</h2>
            <p>{hasIssues ? "这些信息需要处理或确认，重新加载配置/扫描后会刷新。" : "当前没有需要处理的问题。"}</p>
          </div>
          <button className="ui-icon-button icon-button" onClick={onClose} title="关闭问题面板">
            <X size={18} />
          </button>
        </header>

        <div className="issue-drawer-content">
          <IssueSection icon={<FileWarning size={16} />} title="配置问题" count={configWarnings.length}>
            {configWarnings.length ? (
              configWarnings.map((warning, index) => (
                <p className="issue-text" key={`${warning}-${index}`}>
                  {warning}
                </p>
              ))
            ) : (
              <p className="issue-empty">没有配置问题。</p>
            )}
          </IssueSection>

          <IssueSection icon={<AlertTriangle size={16} />} title="扫描问题" count={scanWarnings.length}>
            {scanWarnings.length ? (
              scanWarnings.map((warning, index) => (
                <p className="issue-text" key={`${warning}-${index}`}>
                  {warning}
                </p>
              ))
            ) : (
              <p className="issue-empty">没有扫描问题。</p>
            )}
          </IssueSection>

          <IssueSection icon={<ListChecks size={16} />} title="条目警告" count={itemWarnings.length}>
            {itemWarnings.length ? (
              <div className="issue-record-list">
                {itemWarnings.map((record) => (
                  <article className="issue-record" key={record.id}>
                    <div>
                      <strong title={record.name}>{record.name}</strong>
                      <small>{record.kind === "map" ? "地图" : "Mod"}</small>
                    </div>
                    <span>{record.warnings.length}</span>
                    <p>{record.warnings[0]}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="issue-empty">没有条目警告。</p>
            )}
          </IssueSection>
        </div>
      </aside>
    </div>
  );
}

function IssueSection({
  children,
  count,
  icon,
  title
}: {
  children: React.ReactNode;
  count: number;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="issue-section">
      <div className="issue-section-heading">
        {icon}
        <h3>{title}</h3>
        <span>{count}</span>
      </div>
      {children}
    </section>
  );
}
