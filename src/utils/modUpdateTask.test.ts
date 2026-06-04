import { describe, expect, it } from "vitest";
import type { ModCatalogEntry, ModRecord, ModUpdateCandidate } from "../types";
import { createCatalogInstallTaskDescriptor, createModUpdateTaskDescriptors, createSingleModUpdateTaskDescriptor } from "./modUpdateTask";

function entry(name: string): ModCatalogEntry {
  return {
    source: "wegfan",
    id: name,
    name,
    version: "2.0.0",
    downloadUrl: `https://example.test/${name}.zip`,
    pageUrl: "",
    gameBananaType: "Mod",
    gameBananaId: null,
    gameBananaFileId: null,
    size: null,
    lastUpdate: null,
    xxHash: []
  };
}

function record(id: string, name: string, dependencies = [] as ModRecord["dependencies"]): ModRecord {
  return {
    id,
    name,
    fileName: `${name}.zip`,
    relativePath: `Mods/${name}.zip`,
    absolutePath: `D:\\Games\\Celeste\\Mods\\${name}.zip`,
    isArchive: true,
    kind: "mod",
    enabled: true,
    favorite: false,
    protected: false,
    readOnly: false,
    metadata: { name, version: "1.0.0", author: "", description: "", dependencies, optionalDependencies: [] },
    mapIds: [],
    subMaps: [],
    mapCount: 0,
    strawberryCount: 0,
    strawberryTotalCount: 0,
    completionStatus: "notApplicable",
    dependencies,
    optionalDependencies: [],
    stats: null,
    warnings: []
  };
}

function candidate(recordItem: ModRecord, entryName = recordItem.name): ModUpdateCandidate {
  return {
    entry: entry(entryName),
    installed: {
      recordId: recordItem.id,
      name: recordItem.name,
      fileName: recordItem.fileName,
      relativePath: recordItem.relativePath,
      absolutePath: recordItem.absolutePath,
      version: recordItem.metadata.version,
      hash: "old"
    },
    updateAvailable: true,
    reason: "test"
  };
}

describe("mod update task descriptors", () => {
  it("keeps dependency relationships between update candidates", () => {
    const helper = record("helper", "Helper");
    const map = record("map", "Map", [{ name: "Helper", version: "1.0.0" }]);

    const descriptors = createModUpdateTaskDescriptors([candidate(helper), candidate(map)], [helper, map]);

    expect(descriptors.map((item) => [item.name, item.dependsOn])).toEqual([
      ["Helper", []],
      ["Map", [descriptors[0].id]]
    ]);
  });

  it("dedupes candidates that target the same installed file", () => {
    const helper = record("helper", "Helper");
    const duplicate = candidate(helper, "HelperMirror");

    const descriptors = createModUpdateTaskDescriptors([candidate(helper), duplicate], [helper]);

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].candidate.entry.name).toBe("Helper");
  });

  it("creates a single update descriptor for one installed mod", () => {
    const helper = record("helper", "Helper");
    const descriptor = createSingleModUpdateTaskDescriptor(candidate(helper));

    expect(descriptor).toMatchObject({
      id: `mod-update:${helper.absolutePath}`,
      name: "Helper",
      kind: "mod",
      status: "queued",
      dependsOn: []
    });
  });

  it("creates a catalog install descriptor from the catalog entry", () => {
    const descriptor = createCatalogInstallTaskDescriptor(entry("NewHelper"));

    expect(descriptor).toMatchObject({
      id: "mod-install:wegfan:NewHelper",
      name: "NewHelper",
      kind: "mod",
      status: "queued",
      dependsOn: []
    });
  });
});
