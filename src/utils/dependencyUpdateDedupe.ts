import type { Dependency, ModCatalogEntry, ModRecord, ModUpdateCandidate } from "../types";
import { normalizeDependencyName } from "./dependencies";

export type DependencyIssueForDedupe = {
  dependency: Dependency;
  installed?: ModRecord;
  optional: boolean;
  reason: "missing" | "tooLow";
};

export type DependencyUpdateActionForDedupe =
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
  return compareNumericVersions(left.version, right.version) === -1 ? right : left;
}

function actionPriority(action: DependencyUpdateActionForDedupe) {
  return action.kind === "update" ? 0 : 1;
}

function compareNumericVersions(left: string, right: string) {
  const leftParts = numericVersionParts(left);
  const rightParts = numericVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue < rightValue) return -1;
    if (leftValue > rightValue) return 1;
  }
  return 0;
}

function numericVersionParts(value: string) {
  return [...value.matchAll(/\d+/g)].map((match) => Number(match[0]));
}
