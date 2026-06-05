import type { Dependency, EverestRelease, ModCatalogEntry, ModRecord, ModUpdateCandidate } from "../types";
import { compareNumericVersions, parseNumericVersion } from "./appDependencyResolution";
import { normalizeDependencyName } from "./dependencies";

export type DependencyIssueForDedupe = {
  dependency: Dependency;
  installed?: ModRecord;
  optional: boolean;
  reason: "missing" | "tooLow";
};

export type DependencyUpdateActionForDedupe =
  | { kind: "everest"; name: string; release: EverestRelease }
  | { kind: "update"; name: string; candidate: ModUpdateCandidate }
  | { kind: "install"; name: string; entry: ModCatalogEntry };

export function dedupeDependencyIssues<T extends DependencyIssueForDedupe>(issues: T[]): T[] {
  const byName = new Map<string, T>();
  for (const issue of issues) {
    const key = normalizeDependencyName(issue.dependency.name);
    if (!key) continue;
    const existing = byName.get(key);
    byName.set(key, existing ? mergeDependencyIssue(existing, issue) : issue);
  }
  return [...byName.values()];
}

export function dedupeDependencyActions<T extends DependencyUpdateActionForDedupe>(actions: T[]): T[] {
  const sorted = [...actions].sort((left, right) => actionPriority(left) - actionPriority(right));
  const seenNames = new Set<string>();
  const seenTargets = new Set<string>();
  const deduped: T[] = [];
  for (const action of sorted) {
    const nameKey = normalizeDependencyName(action.name);
    const targetKey = dependencyActionKey(action);
    if ((nameKey && seenNames.has(nameKey)) || seenTargets.has(targetKey)) continue;
    if (nameKey) seenNames.add(nameKey);
    seenTargets.add(targetKey);
    deduped.push(action);
  }
  return deduped;
}

export function dependencyActionKey(action: DependencyUpdateActionForDedupe) {
  if (action.kind === "everest") {
    return `everest:${action.release.branch}:${action.release.version}`;
  }
  if (action.kind === "update") {
    return `update:${action.candidate.installed.absolutePath.toLowerCase()}`;
  }
  return `install:${action.entry.source}:${action.entry.id || normalizeDependencyName(action.entry.name)}`;
}

function mergeDependencyIssue<T extends DependencyIssueForDedupe>(left: T, right: T): T {
  return {
    ...left,
    dependency: stricterDependency(left.dependency, right.dependency),
    installed: left.installed ?? right.installed,
    optional: left.optional && right.optional,
    reason: left.reason === "tooLow" || right.reason === "tooLow" ? "tooLow" : "missing"
  };
}

function stricterDependency(left: Dependency, right: Dependency) {
  if (!left.version.trim()) return right;
  if (!right.version.trim()) return left;
  const leftParts = parseNumericVersion(left.version);
  const rightParts = parseNumericVersion(right.version);
  if (!leftParts || !rightParts) return left;
  return compareNumericVersions(leftParts, rightParts) < 0 ? right : left;
}

function actionPriority(action: DependencyUpdateActionForDedupe) {
  if (action.kind === "everest") return 0;
  return action.kind === "update" ? 0 : 1;
}
