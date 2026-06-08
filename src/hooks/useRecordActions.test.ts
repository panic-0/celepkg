import { describe, expect, it } from "vitest";
import type { ModRecord } from "../types";
import type { DependencyReference } from "../utils/dependencies";
import { createModRecord } from "../utils/testFixtures";
import { enabledDependentReferencesForProfileDisable, findBlockedProfileDisableRecords } from "./useRecordActions";

describe("profile disable guards", () => {
  it("blocks disabling an enabled mod while an enabled dependent remains outside the batch", () => {
    const helper = mod("helper", "Helper");
    const root = mod("root", "Root");
    const context = guardContext({
      disabledRecordIds: new Set(["helper"]),
      enabledModDraft: new Set(["helper", "root"]),
      records: [helper, root],
      requiredReferencesByModId: referencesFor(helper, root)
    });

    expect(findBlockedProfileDisableRecords([helper], context).map((record) => record.id)).toEqual(["helper"]);
    expect(enabledDependentReferencesForProfileDisable(helper.id, context).map((reference) => reference.id)).toEqual(["root"]);
  });

  it("allows disabling a dependency when the dependent record is disabled in the same batch", () => {
    const helper = mod("helper", "Helper");
    const root = mod("root", "Root");
    const context = guardContext({
      disabledRecordIds: new Set(["helper", "root"]),
      enabledModDraft: new Set(["helper", "root"]),
      records: [helper, root],
      requiredReferencesByModId: referencesFor(helper, root)
    });

    expect(findBlockedProfileDisableRecords([helper], context)).toEqual([]);
    expect(enabledDependentReferencesForProfileDisable(helper.id, context)).toEqual([]);
  });

  it("ignores always-enabled dependents during bulk disable dependency checks", () => {
    const helper = mod("helper", "Helper");
    const root = mod("root", "Root", { protected: true });
    const context = guardContext({
      disabledRecordIds: new Set(["helper"]),
      enabledModDraft: new Set(["helper"]),
      records: [helper, root],
      requiredReferencesByModId: referencesFor(helper, root)
    });

    expect(findBlockedProfileDisableRecords([helper], context)).toEqual([]);
    expect(enabledDependentReferencesForProfileDisable(helper.id, { ...context, ignoreProtectedDependents: false })).toEqual([
      dependencyReference(root)
    ]);
  });
});

function guardContext({
  disabledRecordIds,
  enabledModDraft,
  records,
  requiredReferencesByModId
}: {
  disabledRecordIds: Set<string>;
  enabledModDraft: Set<string>;
  records: ModRecord[];
  requiredReferencesByModId: Map<string, DependencyReference[]>;
}) {
  return {
    disabledRecordIds,
    enabledMapDraft: new Set<string>(),
    enabledModDraft,
    ignoreProtectedDependents: true,
    recordsById: new Map(records.map((record) => [record.id, record])),
    requiredReferencesByModId
  };
}

function referencesFor(target: ModRecord, dependent: ModRecord) {
  return new Map([[target.id, [dependencyReference(dependent)]]]);
}

function dependencyReference(record: ModRecord): DependencyReference {
  return {
    fileName: record.fileName,
    id: record.id,
    kind: record.kind,
    name: record.name
  };
}

function mod(id: string, name: string, options: Partial<ModRecord> = {}) {
  const base = createModRecord(name, { id });
  return { ...base, ...options, metadata: { ...base.metadata, ...options.metadata } };
}
