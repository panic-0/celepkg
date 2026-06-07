import { describe, expect, it } from "vitest";
import type { ModCatalogEntry, ModRecord } from "../types";
import {
  buildInstalledDependencyIndex,
  collectTransitiveRequiredDependencyModIds,
  compareNumericVersions,
  dependencyEntrySatisfies,
  dependencyIssueForInstalledDependency,
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

  it("finds missing and outdated dependency issues from the installed index", () => {
    const helper = modRecord({ id: "helper", name: "Helper", metadataVersion: "1.0.0" });
    const index = buildInstalledDependencyIndex([helper]);

    expect(dependencyIssueForInstalledDependency({ name: "Helper", version: "1.0.0" }, index, false)).toBeNull();
    expect(dependencyIssueForInstalledDependency({ name: "Helper", version: "2.0.0" }, index, true)).toMatchObject({
      dependency: { name: "Helper", version: "2.0.0" },
      installed: helper,
      optional: true,
      reason: "tooLow"
    });
    expect(dependencyIssueForInstalledDependency({ name: "Missing", version: "" }, index, false)).toMatchObject({
      dependency: { name: "Missing", version: "" },
      optional: false,
      reason: "missing"
    });
  });

  it("collects transitive required dependency mod ids without adding explicit or protected seed mods", () => {
    const source = modRecord({
      id: "source",
      name: "Source",
      dependencies: [{ name: "Helper", version: "" }]
    });
    const helper = modRecord({
      id: "helper",
      name: "Helper",
      dependencies: [{ name: "Library", version: "" }]
    });
    const library = modRecord({ id: "library", name: "Library" });
    const explicit = modRecord({ id: "explicit", name: "Explicit" });
    const protectedMod = modRecord({ id: "protected", name: "Protected", protected: true });

    const inferred = collectTransitiveRequiredDependencyModIds({
      baseModIds: new Set(["explicit"]),
      isSourceEnabled: (record) => record.id === "source",
      sourceRecords: [source],
      targetMods: [helper, library, explicit, protectedMod]
    });

    expect([...inferred]).toEqual(["helper", "library"]);
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
  absolutePath,
  dependencies = [],
  fileName,
  id = "helper",
  metadataName,
  metadataVersion = "1.0.0",
  name = "Helper",
  protected: protectedValue = false,
  relativePath
}: {
  absolutePath?: string;
  dependencies?: ModRecord["dependencies"];
  fileName?: string;
  id?: string;
  metadataName?: string;
  metadataVersion?: string;
  name?: string;
  protected?: boolean;
  relativePath?: string;
}): ModRecord {
  const resolvedFileName = fileName ?? `${name}.zip`;
  const resolvedRelativePath = relativePath ?? `Mods/${resolvedFileName}`;
  return {
    id,
    name,
    fileName: resolvedFileName,
    relativePath: resolvedRelativePath,
    absolutePath: absolutePath ?? `D:\\Games\\Celeste\\${resolvedRelativePath.replace(/\//g, "\\")}`,
    isArchive: true,
    kind: "mod",
    enabled: true,
    favorite: false,
    protected: protectedValue,
    readOnly: false,
    metadata: {
      name: metadataName ?? name,
      version: metadataVersion,
      author: "",
      description: "",
      dependencies,
      optionalDependencies: []
    },
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
