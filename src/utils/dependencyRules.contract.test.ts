import { describe, expect, it } from "vitest";
import contract from "../../tests/dependency-rules.contract.json";
import type { ModRecord } from "../types";
import {
  collectRequiredDependencyClosureModIds,
  collectTransitiveRequiredDependencyModIds,
  isBuiltinDependencyName,
  normalizeDependencyName,
  versionTooLow
} from "./dependencyRules";

describe("dependency rules contract", () => {
  it("matches the shared dependency rules fixture", () => {
    for (const item of contract.normalize) {
      expect(normalizeDependencyName(item.input)).toBe(item.expected);
    }
    for (const item of contract.builtin) {
      expect(isBuiltinDependencyName(item.name)).toBe(item.expected);
    }
    for (const item of contract.versions) {
      expect(versionTooLow(item.installed, item.required)).toBe(item.tooLow);
    }

    const maps = contract.closure.maps as unknown as ModRecord[];
    const otherMods = contract.closure.otherMods as unknown as ModRecord[];
    const isSourceEnabled = (record: ModRecord) => record.protected || contract.closure.enabledMapIds.includes(record.id);
    expect(
      [
        ...collectTransitiveRequiredDependencyModIds({
          baseModIds: new Set(contract.closure.baseModIds),
          isSourceEnabled,
          sourceRecords: maps,
          targetMods: otherMods
        })
      ].sort()
    ).toEqual(contract.closure.expectedInferred);
    expect(
      collectRequiredDependencyClosureModIds({
        baseModIds: new Set(contract.closure.baseModIds),
        isSourceEnabled,
        sourceRecords: maps,
        targetMods: otherMods
      })
    ).toEqual(contract.closure.expectedClosure);
  });
});
