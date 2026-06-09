import { describe, expect, it } from "vitest";
import type { ModRecord } from "../types";
import { createModRecord } from "../utils/testFixtures";
import { comparePinnedRecordPriority } from "./useModFilters";

describe("record priority pinning", () => {
  it("keeps records in their current order when pinning is disabled", () => {
    expect(comparePinnedRecordPriority(record("favorite", { favorite: true }), record("normal"), options(false, false))).toBe(0);
  });

  it("pins favorites before always-enabled records", () => {
    const favorite = record("favorite", { favorite: true });
    const alwaysEnabled = record("always-enabled", { protected: true });
    const normal = record("normal");

    expect(comparePinnedRecordPriority(favorite, alwaysEnabled, options(true, true))).toBeLessThan(0);
    expect(comparePinnedRecordPriority(alwaysEnabled, normal, options(true, true))).toBeLessThan(0);
  });

  it("can pin favorites and always-enabled records independently", () => {
    const favorite = record("favorite", { favorite: true });
    const alwaysEnabled = record("always-enabled", { protected: true });

    expect(comparePinnedRecordPriority(favorite, alwaysEnabled, options(false, true))).toBeGreaterThan(0);
    expect(comparePinnedRecordPriority(alwaysEnabled, favorite, options(true, false))).toBeGreaterThan(0);
  });
});

function options(pinFavorites: boolean, pinProtected: boolean) {
  return { pinFavorites, pinProtected };
}

function record(name: string, overrides: Partial<ModRecord> = {}) {
  return { ...createModRecord(name), ...overrides };
}
