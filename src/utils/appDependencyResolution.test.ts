import { describe, expect, it } from "vitest";
import type { ModCatalogEntry, ModRecord } from "../types";
import {
  buildInstalledDependencyIndex,
  compareNumericVersions,
  dependencyEntrySatisfies,
  formatDependencyIssue,
  isBuiltinDependencyName,
  parseNumericVersion,
  updateCandidateFromRecord,
  versionTooLow
} from "./appDependencyResolution";

describe("app dependency resolution helpers", () => {
  it("indexes installed records by common dependency aliases", () => {
    const record = modRecord({
      id: "communal-helper",
      name: "Communal Helper",
      fileName: "CommunalHelper.zip",
      metadataName: "CommunalHelper",
      relativePath: "Mods/CommunalHelper.zip"
    });

    const index = buildInstalledDependencyIndex([record]);

    expect(index.get("communal helper")).toBe(record);
    expect(index.get("communalhelper")).toBe(record);
    expect(index.get("mods/communalhelper")).toBe(record);
  });

  it("checks catalog entries against dependency versions and download availability", () => {
    expect(dependencyEntrySatisfies(catalogEntry({ version: "1.2.0" }), { name: "Helper", version: "1.1.0" })).toBe(true);
    expect(dependencyEntrySatisfies(catalogEntry({ version: "1.0.0" }), { name: "Helper", version: "1.1.0" })).toBe(false);
    expect(dependencyEntrySatisfies(catalogEntry({ downloadUrl: "" }), { name: "Helper", version: "1.0.0" })).toBe(false);
  });

  it("creates update candidates from installed records", () => {
    const entry = catalogEntry({ name: "Helper", version: "2.0.0" });
    const record = modRecord({ id: "helper", name: "Helper", fileName: "Helper.zip", metadataVersion: "1.0.0" });

    expect(updateCandidateFromRecord(entry, record)).toMatchObject({
      entry,
      installed: {
        recordId: "helper",
        name: "Helper",
        fileName: "Helper.zip",
        version: "1.0.0",
        hash: ""
      },
      updateAvailable: true,
      reason: "依赖版本需要更新"
    });
  });

  it("formats dependency issues for dialogs", () => {
    const installed = modRecord({ name: "Helper", metadataVersion: "1.0.0" });

    expect(formatDependencyIssue({ dependency: { name: "Helper", version: "" }, optional: false, reason: "missing" })).toBe(
      "缺少 未指定版本"
    );
    expect(
      formatDependencyIssue({
        dependency: { name: "Helper", version: "2.0.0" },
        installed,
        optional: false,
        reason: "tooLow"
      })
    ).toBe("需要 2.0.0，本地 1.0.0");
  });

  it("compares numeric version parts while ignoring non-numeric labels", () => {
    expect(parseNumericVersion("v1.2-beta.3")).toEqual([1, 2, 3]);
    expect(compareNumericVersions([1, 2], [1, 2, 0])).toBe(0);
    expect(versionTooLow("1.2.0", "1.2.1")).toBe(true);
    expect(versionTooLow("1.3.0", "1.2.9")).toBe(false);
    expect(versionTooLow("unknown", "1.2.9")).toBe(false);
  });

  it("recognizes built-in dependency names", () => {
    expect(isBuiltinDependencyName("EverestCore")).toBe(true);
    expect(isBuiltinDependencyName("Microsoft .NET Framework")).toBe(true);
    expect(isBuiltinDependencyName("Communal Helper")).toBe(false);
  });
});

function catalogEntry(overrides: Partial<ModCatalogEntry> = {}): ModCatalogEntry {
  return {
    source: "everestMirror",
    id: "helper",
    name: "Helper",
    version: "1.0.0",
    downloadUrl: "https://example.test/helper.zip",
    pageUrl: "https://example.test/helper",
    gameBananaType: "",
    categoryName: "",
    subCategoryName: "",
    gameBananaId: null,
    gameBananaFileId: null,
    size: null,
    lastUpdate: null,
    xxHash: [],
    ...overrides
  };
}

function modRecord({
  absolutePath = "D:\\Games\\Celeste\\Mods\\Helper.zip",
  fileName = "Helper.zip",
  id = "helper",
  metadataName = "Helper",
  metadataVersion = "1.0.0",
  name = "Helper",
  relativePath = "Mods/Helper.zip"
}: {
  absolutePath?: string;
  fileName?: string;
  id?: string;
  metadataName?: string;
  metadataVersion?: string;
  name?: string;
  relativePath?: string;
}): ModRecord {
  return {
    id,
    name,
    fileName,
    relativePath,
    absolutePath,
    isArchive: true,
    kind: "mod",
    enabled: true,
    favorite: false,
    protected: false,
    readOnly: false,
    metadata: {
      name: metadataName,
      version: metadataVersion,
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
    completionStatus: "notApplicable",
    dependencies: [],
    optionalDependencies: [],
    stats: null,
    warnings: []
  };
}
