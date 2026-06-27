import { describe, expect, it } from "vitest";
import type { ModRecord } from "../types";
import { buildUpdateStatusGroups, compareUpdateStatusRecords, getUpdateStatusGroup } from "./updateStatusGrouping";
import { createModRecord } from "./testFixtures";

function record(id: string, name: string, options: Partial<ModRecord> = {}) {
  const base = createModRecord(name, { id });
  return { ...base, ...options, metadata: { ...base.metadata, ...options.metadata } };
}

describe("update status grouping", () => {
  it("keeps update status groups continuous before pinned records affect ordering", () => {
    const favoriteUnknown = record("favorite-unknown", "Favorite Unknown", { favorite: true });
    const available = record("available", "Available");
    const latest = record("latest", "Latest");
    const normalUnknown = record("normal-unknown", "Normal Unknown");
    const availableUpdateRecordOrder = new Map([["available", 0]]);
    const latestUpdateRecordOrder = new Map([["latest", 0]]);

    const sorted = [favoriteUnknown, latest, normalUnknown, available].sort((left, right) =>
      compareUpdateStatusRecords(left, right, { availableUpdateRecordOrder, latestUpdateRecordOrder })
    );

    expect(sorted.map((item) => item.id)).toEqual(["available", "favorite-unknown", "normal-unknown", "latest"]);
  });

  it("treats read-only maps as latest in the shared status rule", () => {
    const officialMap = record("official", "Official", { kind: "map", readOnly: true });

    expect(getUpdateStatusGroup(officialMap, new Map(), new Map())).toBe("latest");
    expect(buildUpdateStatusGroups([officialMap], new Map(), new Map()).counts).toEqual({
      available: 0,
      latest: 1,
      unknown: 0
    });
  });
});
