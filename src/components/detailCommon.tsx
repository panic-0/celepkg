import type { ReactNode } from "react";
import type { DependencyReference } from "../utils/dependencies";
import type { DependencyTreeNode } from "../utils/dependencyTree";

export function DependencyReferenceList({ emptyText, references }: { emptyText: string; references: DependencyReference[] }) {
  if (!references.length) return <p className="muted">{emptyText}</p>;
  return (
    <div className="dependency-list">
      {references.map((reference) => (
        <span className="ui-chip" key={reference.id} title={`${reference.name} (${reference.fileName})`}>
          <strong>{reference.name}</strong>
          <small>{reference.kind === "map" ? "地图" : "Mod"}</small>
        </span>
      ))}
    </div>
  );
}

export function DependencyTreeView({
  nodes,
  selectedOptionalIds,
  onOptionalToggle
}: {
  nodes: DependencyTreeNode[];
  selectedOptionalIds?: Set<string>;
  onOptionalToggle?: (nodeId: string, selected: boolean) => void;
}) {
  if (!nodes.length) return <p className="muted">没有依赖树节点。</p>;
  return (
    <div className="dependency-tree">
      {nodes.map((node) => (
        <DependencyTreeNodeRow key={node.id} node={node} onOptionalToggle={onOptionalToggle} selectedOptionalIds={selectedOptionalIds} />
      ))}
    </div>
  );
}

function DependencyTreeNodeRow({
  node,
  selectedOptionalIds,
  onOptionalToggle
}: {
  node: DependencyTreeNode;
  selectedOptionalIds?: Set<string>;
  onOptionalToggle?: (nodeId: string, selected: boolean) => void;
}) {
  const optionalSelected = selectedOptionalIds?.has(node.id) ?? node.selected;
  const checked = node.kind === "optional" ? optionalSelected : node.selected;
  return (
    <div className={`dependency-tree-node ${node.status}`}>
      <div className="dependency-tree-row">
        {node.selectable && onOptionalToggle ? (
          <input
            aria-label={`选择可选依赖 ${node.name}`}
            checked={checked}
            onChange={(event) => onOptionalToggle(node.id, event.currentTarget.checked)}
            type="checkbox"
          />
        ) : (
          <span className="dependency-tree-spacer" />
        )}
        <strong title={node.name}>{node.name}</strong>
        <span>{formatDependencyTreeKind(node)}</span>
        <small title={node.detail}>{node.detail}</small>
      </div>
      {node.children.length > 0 && (
        <div className="dependency-tree-children">
          {node.children.map((child) => (
            <DependencyTreeNodeRow
              key={child.id}
              node={child}
              onOptionalToggle={onOptionalToggle}
              selectedOptionalIds={selectedOptionalIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatDependencyTreeKind(node: DependencyTreeNode) {
  if (node.kind === "target") return "目标";
  if (node.kind === "optional") return statusText(node.status, "可选");
  return statusText(node.status, "必需");
}

function statusText(status: DependencyTreeNode["status"], fallback: string) {
  if (status === "installed") return `${fallback} 已满足`;
  if (status === "plannedInstall") return `${fallback} 将安装`;
  if (status === "plannedUpdate") return `${fallback} 将更新`;
  if (status === "missing") return `${fallback} 缺失`;
  if (status === "tooLow") return `${fallback} 版本不足`;
  if (status === "builtin") return "内置";
  if (status === "everest") return "Everest";
  if (status === "cycle") return "循环";
  if (status === "duplicate") return "重复";
  if (status === "unavailable") return `${fallback} 无法处理`;
  return fallback;
}

export function LongValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-long-value long-field">
      <span>{label}</span>
      <code title={value}>{value || "-"}</code>
    </div>
  );
}

export function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button className={active ? "tab-button active" : "tab-button"} onClick={onClick} role="tab" aria-selected={active}>
      {children}
    </button>
  );
}
