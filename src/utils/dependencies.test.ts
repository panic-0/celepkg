import { describe, expect, it } from "vitest";
import type { ModRecord } from "../types";
import { buildInstalledCatalogAliasSet, buildModAliasMap, isCatalogEntryInstalled, normalizeDependencyName } from "./dependencies";

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

function modRecord({
  id,
  name,
  fileName,
  metadataName,
  readOnly = false,
  relativePath
}: {
  id: string;
  name: string;
  fileName: string;
  metadataName: string;
  readOnly?: boolean;
  relativePath: string;
}) {
  return {
    id,
    name,
    fileName,
    relativePath,
    readOnly,
    metadata: { name: metadataName }
  } as ModRecord;
}
