import { describe, expect, it } from "vitest";
import type { ModCatalogEntry, ModRecord, ModUpdateCandidate } from "../types";
import { dedupeDependencyActions, dedupeDependencyIssues } from "./dependencyUpdateDedupe";

const helperEntry: ModCatalogEntry = {
  source: "everestMirror",
  id: "helper",
  name: "Helper",
  version: "1.10.0",
  downloadUrl: "https://example.test/helper.zip",
  pageUrl: "",
  gameBananaType: "Mod",
  gameBananaId: null,
  gameBananaFileId: null,
  size: null,
  lastUpdate: null,
  xxHash: []
};

function record(id: string, name: string, absolutePath: string): ModRecord {
  return {
    id,
    name,
    fileName: `${name}.zip`,
    relativePath: `${name}.zip`,
    absolutePath,
    isArchive: true,
    kind: "mod",
    enabled: true,
    favorite: false,
    protected: false,
    readOnly: false,
    metadata: {
      name,
      version: "1.0.0",
      author: "",
      description: "",
      dependencies: [],
      optionalDependencies: []
    },
    mapIds: [],
    subMaps: [],
    mapCount: 0,
    strawberryCount: 0,
    strawberryTotalCount: 0,
    completionStatus: "unknown",
    dependencies: [],
    optionalDependencies: [],
    stats: null,
    warnings: []
  };
}

function updateCandidate(installed: ModRecord): ModUpdateCandidate {
  return {
    entry: helperEntry,
    installed: {
      recordId: installed.id,
      name: installed.name,
      fileName: installed.fileName,
      relativePath: installed.relativePath,
      absolutePath: installed.absolutePath,
      version: installed.metadata.version,
      hash: "old"
    },
    updateAvailable: true,
    reason: "hash changed"
  };
}

describe("dependency update dedupe", () => {
  it("merges duplicate issues by normalized dependency name", () => {
    const issues = dedupeDependencyIssues([
      {
        dependency: { name: "Helper", version: "1.2.0" },
        optional: true,
        reason: "missing"
      },
      {
        dependency: { name: "helper.zip", version: "1.10.0" },
        optional: false,
        reason: "missing"
      }
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].dependency.version).toBe("1.10.0");
    expect(issues[0].optional).toBe(false);
  });

  it("keeps only one action for the same dependency and prefers updates", () => {
    const installed = record("helper", "Helper", "D:/Celeste/Mods/Helper.zip");
    const actions = dedupeDependencyActions([
      { kind: "install", name: "Helper", entry: helperEntry },
      { kind: "update", name: "helper.zip", candidate: updateCandidate(installed) }
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe("update");
  });

  it("keeps only one install for the same catalog entry", () => {
    const actions = dedupeDependencyActions([
      { kind: "install", name: "Helper", entry: helperEntry },
      { kind: "install", name: "HelperAlias", entry: helperEntry }
    ]);

    expect(actions).toHaveLength(1);
  });
});
