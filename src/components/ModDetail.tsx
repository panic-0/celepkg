import { FolderOpen } from "lucide-react";
import type { ModRecord } from "../types";
import { Info } from "./common";

export function ModDetail({ modItem, draftEnabled }: { modItem?: ModRecord; draftEnabled: boolean }) {
  if (!modItem) {
    return (
      <aside className="detail-pane">
        <div className="empty-state">
          <FolderOpen size={28} />
          <p>选择一个 Mod 查看详情。</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-pane">
      <div className="detail-heading">
        <span className={draftEnabled ? "state enabled" : "state disabled"}>{draftEnabled ? "启用" : "禁用"}</span>
        <h2>{modItem.name}</h2>
        <p>{modItem.metadata.description || modItem.fileName}</p>
      </div>

      <section className="detail-section">
        <h3>Mod 信息</h3>
        <Info label="作者" value={modItem.metadata.author || "未知"} />
        <Info label="版本" value={modItem.metadata.version || "未知"} />
        <Info label="文件" value={modItem.relativePath} />
        <Info label="类型" value={modItem.isArchive ? "zip Mod" : "文件夹 Mod"} />
      </section>

      <section className="detail-section">
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

      {modItem.warnings.length > 0 && (
        <section className="detail-section">
          <h3>警告</h3>
          {modItem.warnings.map((warning) => (
            <p className="warning-text" key={warning}>{warning}</p>
          ))}
        </section>
      )}
    </aside>
  );
}
