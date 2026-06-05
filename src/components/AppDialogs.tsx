import { AlertTriangle, LoaderCircle } from "lucide-react";
import { DialogFacts, DialogShell, type DialogFact } from "./common";
import {
  formatDependencyIssue,
  type DependencyActionLabel,
  type DependencyIssue,
  type DependencyUpdateChoice,
  type EverestDependencyChoice
} from "../utils/appDependencyResolution";
import { formatEverestBuildVersion } from "../utils/everestDependency";
import type { EverestRelease } from "../types";

export type AppConfirmPromptState = {
  cancelLabel?: string;
  confirmLabel: string;
  description: string;
  details?: string[];
  facts?: DialogFact[];
  resolve: (confirmed: boolean) => void;
  title: string;
  variant?: "primary" | "danger";
};

export type DependencyPromptState = {
  actionLabel: DependencyActionLabel;
  issues: DependencyIssue[];
  resolve: (choice: DependencyUpdateChoice | null) => void;
  targetName: string;
};

export type EverestDependencyPromptState = {
  installedBuild: number | null;
  release: EverestRelease;
  requiredBuild: number;
  resolve: (choice: EverestDependencyChoice | null) => void;
  targetName: string;
};

export function AppConfirmDialog({ prompt, onClose }: { prompt: AppConfirmPromptState; onClose: (confirmed: boolean) => void }) {
  return (
    <DialogShell
      actions={[
        { label: prompt.cancelLabel ?? "取消", onClick: () => onClose(false) },
        { label: prompt.confirmLabel, onClick: () => onClose(true), variant: prompt.variant ?? "primary" }
      ]}
      icon={<AlertTriangle size={18} />}
      onClose={() => onClose(false)}
      title={prompt.title}
    >
      <p>{prompt.description}</p>
      {prompt.facts && prompt.facts.length > 0 && <DialogFacts facts={prompt.facts} />}
      {prompt.details && prompt.details.length > 0 && (
        <div className="dependency-preview-list">
          {prompt.details.map((detail) => (
            <div className="dependency-preview-row" key={detail}>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      )}
    </DialogShell>
  );
}

export function EverestDependencyDialog({
  prompt,
  onClose
}: {
  prompt: EverestDependencyPromptState;
  onClose: (choice: EverestDependencyChoice | null) => void;
}) {
  const requiredVersion = formatEverestBuildVersion(prompt.requiredBuild);
  const installedVersion = prompt.installedBuild === null ? "未识别" : formatEverestBuildVersion(prompt.installedBuild);
  const updateVersion = formatEverestBuildVersion(prompt.release.version);
  return (
    <DialogShell
      actions={[
        { label: "取消", onClick: () => onClose(null) },
        { label: "忽略继续", onClick: () => onClose("ignore") },
        { label: "更新 Everest 后继续", onClick: () => onClose("update"), variant: "primary" }
      ]}
      icon={<LoaderCircle size={18} />}
      onClose={() => onClose(null)}
      title="需要更新 Everest"
    >
      <p>{`${prompt.targetName} 需要 Everest ${requiredVersion} 或更高版本，当前版本 ${installedVersion}。`}</p>
      <p>{`可以先更新到 Everest ${updateVersion} 后继续，也可以忽略此检查继续。`}</p>
    </DialogShell>
  );
}

export function DependencyUpdateDialog({
  prompt,
  onClose
}: {
  prompt: DependencyPromptState;
  onClose: (choice: DependencyUpdateChoice | null) => void;
}) {
  const requiredCount = prompt.issues.filter((issue) => !issue.optional).length;
  const optionalCount = prompt.issues.length - requiredCount;
  return (
    <DialogShell
      actions={[
        { label: "取消", onClick: () => onClose(null) },
        { label: "不更新依赖", onClick: () => onClose("none") },
        { label: "更新必须", onClick: () => onClose("required"), variant: "primary" },
        { label: "更新全部", onClick: () => onClose("all"), variant: "primary" }
      ]}
      icon={<LoaderCircle size={18} />}
      onClose={() => onClose(null)}
      title={`${prompt.actionLabel}前依赖检查`}
    >
      <p>{`${prompt.targetName} ${prompt.actionLabel}后有 ${requiredCount} 个必需依赖、${optionalCount} 个可选依赖可能未满足。`}</p>
      <div className="dependency-preview-list">
        {prompt.issues.map((issue) => (
          <div className="dependency-preview-row" key={`${issue.optional ? "optional" : "required"}:${issue.dependency.name}`}>
            <strong>{issue.dependency.name}</strong>
            <span>{issue.optional ? "可选依赖" : "必需依赖"}</span>
            <small>{formatDependencyIssue(issue)}</small>
          </div>
        ))}
      </div>
    </DialogShell>
  );
}
