import type { ModRecord, ModUpdateCandidate } from "../types";
import type { DownloadTaskItem } from "./downloadTask";
import { normalizeDependencyName } from "./dependencies";

export type ModUpdateTaskDescriptor = Pick<DownloadTaskItem, "id" | "name" | "kind" | "status" | "dependsOn"> & {
  candidate: ModUpdateCandidate;
};

export function createModUpdateTaskDescriptors(
  candidates: ModUpdateCandidate[],
  recordsBeforeUpdate: ModRecord[]
): ModUpdateTaskDescriptor[] {
  const dedupedCandidates = dedupeCandidatesByTarget(candidates);
  const idByRecordId = new Map(dedupedCandidates.map((candidate) => [candidate.installed.recordId, createModUpdateTaskId(candidate)]));
  const installedIndex = buildInstalledDependencyIndex(recordsBeforeUpdate);

  return dedupedCandidates.map((candidate) => {
    const record = recordsBeforeUpdate.find((item) => item.id === candidate.installed.recordId);
    const dependsOn =
      record?.dependencies
        .map((dependency) => installedIndex.get(normalizeDependencyName(dependency.name)))
        .map((dependencyRecord) => (dependencyRecord ? idByRecordId.get(dependencyRecord.id) : undefined))
        .filter((id): id is string => Boolean(id) && id !== createModUpdateTaskId(candidate)) ?? [];

    return {
      id: createModUpdateTaskId(candidate),
      name: candidate.installed.name || candidate.entry.name,
      kind: "mod",
      status: "queued",
      dependsOn,
      candidate
    };
  });
}

export function createModUpdateTaskId(candidate: ModUpdateCandidate) {
  return `mod-update:${candidate.installed.absolutePath || candidate.installed.recordId}`;
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

function buildInstalledDependencyIndex(records: ModRecord[]) {
  const index = new Map<string, ModRecord>();
  for (const record of records) {
    for (const alias of [
      record.id,
      record.name,
      record.metadata.name,
      record.fileName,
      record.fileName.replace(/\.zip$/i, ""),
      record.relativePath
    ]) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) index.set(normalized, record);
    }
  }
  return index;
}
