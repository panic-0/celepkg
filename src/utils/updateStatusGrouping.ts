import type { ModRecord, ModUpdateCandidate } from "../types";

export type UpdateStatusGroup = "available" | "latest" | "unknown";
export type UpdateStatusGroupCounts = Record<UpdateStatusGroup, number>;
export type UpdateStatusGroups = { counts: UpdateStatusGroupCounts; groups: Map<string, UpdateStatusGroup> };
export type UpdateStatusRecordOrder = {
  availableUpdateRecordOrder: Map<string, number>;
  latestUpdateRecordOrder: Map<string, number>;
};
type RecordStatusLookup = Pick<Map<string, unknown>, "has">;

const updateStatusGroupRanks: Record<UpdateStatusGroup, number> = {
  available: 0,
  unknown: 1,
  latest: 2
};

export function getUpdateStatusGroup(
  record: ModRecord,
  availableUpdateRecordOrder: RecordStatusLookup,
  latestUpdateRecordOrder: RecordStatusLookup
): UpdateStatusGroup {
  if (availableUpdateRecordOrder.has(record.id)) return "available";
  if (latestUpdateRecordOrder.has(record.id) || isReadOnlyMap(record)) return "latest";
  return "unknown";
}

export function buildUpdateStatusGroups(
  records: ModRecord[],
  updatesByRecordId: Map<string, ModUpdateCandidate>,
  latestUpdatesByRecordId: Map<string, ModUpdateCandidate>
): UpdateStatusGroups {
  const groups = new Map<string, UpdateStatusGroup>();
  const counts: UpdateStatusGroupCounts = { available: 0, latest: 0, unknown: 0 };
  for (const record of records) {
    const group = getUpdateStatusGroup(record, updatesByRecordId, latestUpdatesByRecordId);
    groups.set(record.id, group);
    counts[group] += 1;
  }
  return { counts, groups };
}

export function compareUpdateStatusRecords(left: ModRecord, right: ModRecord, order: UpdateStatusRecordOrder) {
  const leftGroup = getUpdateStatusGroup(left, order.availableUpdateRecordOrder, order.latestUpdateRecordOrder);
  const rightGroup = getUpdateStatusGroup(right, order.availableUpdateRecordOrder, order.latestUpdateRecordOrder);
  if (leftGroup !== rightGroup) return updateStatusGroupRanks[leftGroup] - updateStatusGroupRanks[rightGroup];
  if (leftGroup === "available") {
    return (
      (order.availableUpdateRecordOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.availableUpdateRecordOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }
  if (leftGroup === "latest") {
    return (
      (order.latestUpdateRecordOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.latestUpdateRecordOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }
  return 0;
}

export function updateStatusGroupLabel(group: UpdateStatusGroup) {
  if (group === "available") return "可更新";
  if (group === "latest") return "已是最新";
  return "未知状态";
}

function isReadOnlyMap(record: ModRecord) {
  return record.kind === "map" && record.readOnly;
}
