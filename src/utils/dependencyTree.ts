import type { Dependency, ModRecord } from "../types";
import { formatDependencyIssue, isBuiltinDependencyName, type DependencyIssue } from "./appDependencyResolution";
import { buildInstalledDependencyIndex, versionTooLow } from "./appDependencyResolution";
import { normalizeDependencyName } from "./dependencies";
import { isEverestDependencyName } from "./everestDependency";

export type DependencyTreeNodeStatus =
  | "target"
  | "installed"
  | "missing"
  | "tooLow"
  | "builtin"
  | "everest"
  | "plannedInstall"
  | "plannedUpdate"
  | "unavailable"
  | "duplicate"
  | "cycle";

export type DependencyTreeNodeKind = "target" | "required" | "optional";

export type DependencyTreeNode = {
  id: string;
  name: string;
  kind: DependencyTreeNodeKind;
  status: DependencyTreeNodeStatus;
  detail: string;
  selected: boolean;
  selectable: boolean;
  children: DependencyTreeNode[];
};

export type DependencyTreePreviewChoice = {
  selectedOptionalIds: Set<string>;
};

export function buildLocalDependencyTree(root: ModRecord, records: ModRecord[]): DependencyTreeNode {
  const installedIndex = buildInstalledDependencyIndex(records);
  return {
    id: `target:${root.id}`,
    name: root.name,
    kind: "target",
    status: "target",
    detail: root.metadata.version || root.fileName,
    selected: true,
    selectable: false,
    children: [
      ...buildLocalDependencyNodes(root.dependencies, "required", installedIndex, new Set([root.id])),
      ...buildLocalDependencyNodes(root.optionalDependencies, "optional", installedIndex, new Set([root.id]))
    ]
  };
}

export function dependencyIssueToTreeNode(issue: DependencyIssue): DependencyTreeNode {
  return {
    id: dependencyIssueKey(issue),
    name: issue.dependency.name,
    kind: issue.optional ? "optional" : "required",
    status: issue.installed ? "plannedUpdate" : "plannedInstall",
    detail: formatDependencyIssue(issue),
    selected: !issue.optional,
    selectable: issue.optional,
    children: []
  };
}

export function dependencyIssueKey(issue: DependencyIssue) {
  return `${issue.optional ? "optional" : "required"}:${normalizeDependencyName(issue.dependency.name)}:${issue.dependency.version}`;
}

function buildLocalDependencyNodes(
  dependencies: Dependency[],
  kind: Exclude<DependencyTreeNodeKind, "target">,
  installedIndex: Map<string, ModRecord>,
  path: Set<string>
): DependencyTreeNode[] {
  return dependencies.map((dependency) => {
    const normalized = normalizeDependencyName(dependency.name);
    if (isEverestDependencyName(dependency.name)) {
      return baseNode(dependency, kind, "everest", "Everest 运行环境依赖");
    }
    if (isBuiltinDependencyName(dependency.name)) {
      return baseNode(dependency, kind, "builtin", "内置依赖");
    }
    const installed = installedIndex.get(normalized);
    if (!installed) {
      return baseNode(dependency, kind, "missing", dependency.version ? `缺少 ${dependency.version}` : "本地缺失");
    }
    if (path.has(installed.id)) {
      return {
        ...baseNode(dependency, kind, "cycle", installed.name),
        detail: "循环依赖"
      };
    }
    if (dependency.version.trim() && versionTooLow(installed.metadata.version, dependency.version)) {
      return {
        ...baseNode(dependency, kind, "tooLow", `需要 ${dependency.version}，本地 ${installed.metadata.version || "未知版本"}`),
        children: []
      };
    }
    const nextPath = new Set(path);
    nextPath.add(installed.id);
    return {
      ...baseNode(dependency, kind, "installed", installed.metadata.version || installed.fileName),
      name: installed.name || dependency.name,
      children: [
        ...buildLocalDependencyNodes(installed.dependencies, "required", installedIndex, nextPath),
        ...buildLocalDependencyNodes(installed.optionalDependencies, "optional", installedIndex, nextPath)
      ]
    };
  });
}

function baseNode(
  dependency: Dependency,
  kind: Exclude<DependencyTreeNodeKind, "target">,
  status: DependencyTreeNodeStatus,
  detail: string
): DependencyTreeNode {
  return {
    id: `${kind}:${normalizeDependencyName(dependency.name)}:${dependency.version}:${status}`,
    name: dependency.name,
    kind,
    status,
    detail,
    selected: kind === "required",
    selectable: kind === "optional",
    children: []
  };
}
