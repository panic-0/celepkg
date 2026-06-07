import type { Dependency, EverestRelease, ModCatalogEntry, ModRecord, ModUpdateCandidate } from "../types";
import { dependencyAliasesForRecord, normalizeDependencyName, versionTooLow } from "./dependencyRules";

export {
  collectRequiredDependencyClosureModIds,
  collectTransitiveRequiredDependencyModIds,
  compareNumericVersions,
  isBuiltinDependencyName,
  parseNumericVersion,
  versionTooLow
} from "./dependencyRules";

export type DependencyUpdateChoice = "none" | "required" | "all";
export type DependencyActionLabel = "安装" | "更新";
export type EverestDependencyChoice = "update" | "ignore";

export type DependencyIssue = {
  dependency: Dependency;
  installed?: ModRecord;
  optional: boolean;
  reason: "missing" | "tooLow";
};

export type DependencyUpdateAction =
  | { kind: "everest"; name: string; release: EverestRelease }
  | { kind: "update"; name: string; candidate: ModUpdateCandidate }
  | { kind: "install"; name: string; entry: ModCatalogEntry };

export type DependencyUpdatePlan = {
  actionLabel: DependencyActionLabel;
  choice: DependencyUpdateChoice;
  issues: DependencyIssue[];
  targetName: string;
};

export function buildInstalledDependencyIndex(records: ModRecord[]) {
  const index = new Map<string, ModRecord>();
  for (const record of records) {
    for (const alias of dependencyAliasesForRecord(record)) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) index.set(normalized, record);
    }
  }
  return index;
}

export function dependencyIssueForInstalledDependency(
  dependency: Dependency,
  installedIndex: Map<string, ModRecord>,
  optional: boolean
): DependencyIssue | null {
  const installed = installedIndex.get(normalizeDependencyName(dependency.name));
  if (!installed) return { dependency, optional, reason: "missing" };
  if (dependency.version.trim() && versionTooLow(installed.metadata.version, dependency.version)) {
    return { dependency, installed, optional, reason: "tooLow" };
  }
  return null;
}

export function updateCandidateFromRecord(entry: ModCatalogEntry, record: ModRecord): ModUpdateCandidate {
  return {
    entry,
    installed: {
      recordId: record.id,
      name: record.name,
      fileName: record.fileName,
      relativePath: record.relativePath,
      absolutePath: record.absolutePath,
      version: record.metadata.version,
      hash: ""
    },
    updateAvailable: true,
    reason: "依赖版本需要更新"
  };
}

export function dependencyEntrySatisfies(entry: ModCatalogEntry, dependency: Dependency) {
  return entry.downloadUrl.trim().length > 0 && !versionTooLow(entry.version, dependency.version);
}

export function formatDependencyIssue(issue: DependencyIssue) {
  const requiredVersion = issue.dependency.version.trim() || "未指定版本";
  if (issue.reason === "missing") return `缺少 ${requiredVersion}`;
  return `需要 ${requiredVersion}，本地 ${issue.installed?.metadata.version || "未知版本"}`;
}
