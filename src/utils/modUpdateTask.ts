import type { ModCatalogEntry, ModRecord, ModUpdateCandidate } from "../types";
import { buildInstalledDependencyIndex } from "./appDependencyResolution";
import type { DownloadTaskItem } from "./downloadTask";
import { normalizeDependencyName } from "./dependencies";

export type ModUpdateTaskDescriptor = Pick<DownloadTaskItem, "id" | "name" | "kind" | "status" | "dependsOn"> & {
  candidate: ModUpdateCandidate;
};

export type ModInstallTaskDescriptor = Pick<DownloadTaskItem, "id" | "name" | "kind" | "status" | "dependsOn"> & {
  entry: ModCatalogEntry;
};

export function createModUpdateTaskDescriptors(
  candidates: ModUpdateCandidate[],
  recordsBeforeUpdate: ModRecord[]
): ModUpdateTaskDescriptor[] {
  const dedupedCandidates = dedupeCandidatesByTarget(candidates);
  const orderedCandidates = orderCandidatesByInstalledDependencyGraph(dedupedCandidates, recordsBeforeUpdate);
  const idByRecordId = new Map(dedupedCandidates.map((candidate) => [candidate.installed.recordId, createModUpdateTaskId(candidate)]));
  const installedIndex = buildInstalledDependencyIndex(recordsBeforeUpdate);
  const orderedIndexById = new Map(orderedCandidates.map((candidate, index) => [createModUpdateTaskId(candidate), index]));

  return orderedCandidates.map((candidate) => {
    const candidateId = createModUpdateTaskId(candidate);
    const record = recordsBeforeUpdate.find((item) => item.id === candidate.installed.recordId);
    const dependsOn =
      record?.dependencies
        .map((dependency) => installedIndex.get(normalizeDependencyName(dependency.name)))
        .map((dependencyRecord) => (dependencyRecord ? idByRecordId.get(dependencyRecord.id) : undefined))
        .filter((id): id is string => {
          if (!id || id === candidateId) return false;
          const dependencyIndex = orderedIndexById.get(id);
          const candidateIndex = orderedIndexById.get(candidateId);
          return dependencyIndex !== undefined && candidateIndex !== undefined && dependencyIndex < candidateIndex;
        }) ?? [];

    return {
      id: candidateId,
      name: candidate.installed.name || candidate.entry.name,
      kind: "mod",
      status: "queued",
      dependsOn,
      candidate
    };
  });
}

export function createSingleModUpdateTaskDescriptor(candidate: ModUpdateCandidate): ModUpdateTaskDescriptor {
  return {
    id: createModUpdateTaskId(candidate),
    name: candidate.installed.name || candidate.entry.name,
    kind: "mod",
    status: "queued",
    dependsOn: [],
    candidate
  };
}

export function createCatalogInstallTaskDescriptor(entry: ModCatalogEntry): ModInstallTaskDescriptor {
  return {
    id: `mod-install:${entry.source}:${entry.id || entry.downloadUrl || entry.name}`,
    name: entry.name,
    kind: "mod",
    status: "queued",
    dependsOn: [],
    entry
  };
}

export function createModUpdateTaskId(candidate: ModUpdateCandidate) {
  return `mod-update:${candidate.installed.absolutePath || candidate.installed.recordId}`;
}

function orderCandidatesByInstalledDependencyGraph(candidates: ModUpdateCandidate[], recordsBeforeUpdate: ModRecord[]) {
  const installedIndex = buildInstalledDependencyIndex(recordsBeforeUpdate);
  const candidateByRecordId = new Map(candidates.map((candidate) => [candidate.installed.recordId, candidate]));
  const originalIndex = new Map(candidates.map((candidate, index) => [candidate.installed.recordId, index]));
  const ordered: ModUpdateCandidate[] = [];
  const state = new Map<string, "visiting" | "visited">();

  function visit(candidate: ModUpdateCandidate) {
    const recordId = candidate.installed.recordId;
    const currentState = state.get(recordId);
    if (currentState === "visited") return;
    if (currentState === "visiting") return;

    state.set(recordId, "visiting");
    const record = recordsBeforeUpdate.find((item) => item.id === recordId);
    const dependencies =
      record?.dependencies
        .map((dependency) => installedIndex.get(normalizeDependencyName(dependency.name)))
        .filter((dependencyRecord): dependencyRecord is ModRecord => Boolean(dependencyRecord))
        .map((dependencyRecord) => candidateByRecordId.get(dependencyRecord.id))
        .filter((dependencyCandidate): dependencyCandidate is ModUpdateCandidate => Boolean(dependencyCandidate))
        .sort((left, right) => (originalIndex.get(left.installed.recordId) ?? 0) - (originalIndex.get(right.installed.recordId) ?? 0)) ??
      [];

    for (const dependency of dependencies) visit(dependency);
    state.set(recordId, "visited");
    ordered.push(candidate);
  }

  for (const candidate of candidates) visit(candidate);
  return ordered;
}

function dedupeCandidatesByTarget(candidates: ModUpdateCandidate[]) {
  const seen = new Set<string>();
  const deduped: ModUpdateCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.installed.absolutePath || candidate.installed.recordId;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}
