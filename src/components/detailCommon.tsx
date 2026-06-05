import type { ReactNode } from "react";
import type { DependencyReference } from "../utils/dependencies";

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
