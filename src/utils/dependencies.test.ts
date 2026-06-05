import { describe, expect, it } from "vitest";
import type { ModRecord } from "../types";
import {
  buildInstalledCatalogAliasSet,
  buildModAliasMap,
  findDependencyReferencesByModId,
  isCatalogEntryInstalled,
  normalizeDependencyName
} from "./dependencies";

describe("normalizeDependencyName", () => {
  it("normalizes zip suffixes, separators, whitespace, and case", () => {
    expect(normalizeDependencyName("  Some_Mod-Name.ZIP  ")).toBe("some mod name");
  });

  it("keeps nested folder names comparable across path separators", () => {
    expect(normalizeDependencyName("Mods\\Helper Pack")).toBe("mods/helper pack");
  });

  it("returns an empty alias for whitespace-only values", () => {
    expect(normalizeDependencyName(" \t\n ")).toBe("");
  });
});

describe("buildModAliasMap", () => {
  it("indexes common mod aliases with the shared normalization rule", () => {
    const mod = {
      id: "helper-one",
      name: "Helper One",
      fileName: "Helper_One.ZIP",
      relativePath: "Mods\\Helper_One.ZIP",
      metadata: { name: "Helper-One" }
    } as ModRecord;

    const aliases = buildModAliasMap([mod]);

    expect(aliases.get("helper one")).toBe("helper-one");
    expect(aliases.get("mods/helper one")).toBe("helper-one");
  });
});

describe("catalog installed aliases", () => {
  it("matches catalog entries against installed metadata and file aliases", () => {
    const installedAliases = buildInstalledCatalogAliasSet([
      modRecord({
        id: "local-id",
        name: "Local Display Name",
        fileName: "Helper_File.zip",
        metadataName: "Catalog Helper",
        relativePath: "Mods/Helper_File.zip"
      })
    ]);

    expect(isCatalogEntryInstalled("Catalog Helper", installedAliases)).toBe(true);
    expect(isCatalogEntryInstalled("Helper File", installedAliases)).toBe(true);
    expect(isCatalogEntryInstalled("Other Helper", installedAliases)).toBe(false);
  });

  it("does not treat read-only built-in records as catalog installs", () => {
    const installedAliases = buildInstalledCatalogAliasSet([
      modRecord({
        id: "official",
        name: "Forsaken City",
        fileName: "1-ForsakenCity.bin",
        metadataName: "Forsaken City",
        readOnly: true,
        relativePath: "Content/Maps/1-ForsakenCity.bin"
      })
    ]);

    expect(isCatalogEntryInstalled("Forsaken City", installedAliases)).toBe(false);
  });
});

describe("findDependencyReferencesByModId", () => {
  it("groups required and optional references by resolved mod aliases", () => {
    const helper = modRecord({
      id: "helper",
      name: "Helper One",
      fileName: "Helper_One.zip",
      metadataName: "Helper-One",
      relativePath: "Mods/Helper_One.zip"
    });
    const map = modRecord({
      id: "map",
      kind: "map",
      name: "Map Pack",
      fileName: "MapPack.zip",
      metadataName: "Map Pack",
      relativePath: "Mods/MapPack.zip",
      dependencies: [{ name: "Helper One", version: "1.0.0" }]
    });
    const mod = modRecord({
      id: "skin",
      name: "Skin Pack",
      fileName: "SkinPack.zip",
      metadataName: "Skin Pack",
      relativePath: "Mods/SkinPack.zip",
      optionalDependencies: [{ name: "Mods/Helper_One.zip", version: "" }]
    });

    const references = findDependencyReferencesByModId([map, mod], [helper]);

    expect(references.requiredReferencesByModId.get("helper")).toEqual([
      { fileName: "MapPack.zip", id: "map", kind: "map", name: "Map Pack" }
    ]);
    expect(references.optionalReferencesByModId.get("helper")).toEqual([
      { fileName: "SkinPack.zip", id: "skin", kind: "mod", name: "Skin Pack" }
    ]);
  });

  it("skips self references and deduplicates repeated dependency aliases", () => {
    const helper = modRecord({
      id: "helper",
      name: "Helper One",
      fileName: "Helper_One.zip",
      metadataName: "Helper-One",
      relativePath: "Mods/Helper_One.zip",
      dependencies: [
        { name: "Helper One", version: "" },
        { name: "Helper_One.zip", version: "" }
      ]
    });
    const map = modRecord({
      id: "map",
      kind: "map",
      name: "Map Pack",
      fileName: "MapPack.zip",
      metadataName: "Map Pack",
      relativePath: "Mods/MapPack.zip",
      dependencies: [
        { name: "Helper One", version: "1.0.0" },
        { name: "Helper_One.zip", version: "1.0.0" }
      ]
    });

    const references = findDependencyReferencesByModId([helper, map], [helper]);

    expect(references.requiredReferencesByModId.get("helper")).toEqual([
      { fileName: "MapPack.zip", id: "map", kind: "map", name: "Map Pack" }
    ]);
  });
});

function modRecord({
  id,
  dependencies = [],
  name,
  fileName,
  kind = "mod",
  metadataName,
  optionalDependencies = [],
  readOnly = false,
  relativePath
}: {
  id: string;
  dependencies?: ModRecord["dependencies"];
  name: string;
  fileName: string;
  kind?: ModRecord["kind"];
  metadataName: string;
  optionalDependencies?: ModRecord["optionalDependencies"];
  readOnly?: boolean;
  relativePath: string;
}) {
  return {
    dependencies,
    id,
    kind,
    name,
    fileName,
    optionalDependencies,
    relativePath,
    readOnly,
    metadata: { name: metadataName }
  } as ModRecord;
}
