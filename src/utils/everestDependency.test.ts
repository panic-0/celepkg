import { describe, expect, it } from "vitest";
import type { EverestRelease, ModRecord } from "../types";
import {
  dependenciesIncludeEverest,
  formatEverestBuildVersion,
  installedEverestBuild,
  isEverestDependencyName,
  requiredEverestBuild,
  selectEverestReleaseForBuild
} from "./everestDependency";

describe("everest dependency helpers", () => {
  it("recognizes Everest dependency name variants", () => {
    expect(isEverestDependencyName("Everest")).toBe(true);
    expect(isEverestDependencyName("EverestCore")).toBe(true);
    expect(isEverestDependencyName("Everest 1.5577.0")).toBe(true);
    expect(isEverestDependencyName("Communal Helper")).toBe(false);
  });

  it("detects Everest in dependency lists", () => {
    expect(dependenciesIncludeEverest([{ name: "Everest", version: "1.5577.0" }])).toBe(true);
    expect(dependenciesIncludeEverest([{ name: "Helper", version: "1.0.0" }])).toBe(false);
  });

  it("extracts the highest required Everest build", () => {
    expect(
      requiredEverestBuild([
        { name: "Everest", version: "1.5577.0" },
        { name: "EverestCore", version: "1.6123.0" },
        { name: "Helper", version: "9.0.0" }
      ])
    ).toBe(6123);
  });

  it("selects the lowest release satisfying the required build", () => {
    expect(selectEverestReleaseForBuild([release(6200), release(6123), release(6100)], 6110)?.version).toBe(6123);
  });

  it("reads the installed Everest build from Everest or EverestCore records", () => {
    expect(installedEverestBuild([record("EverestCore", "1.5577.0")])).toBe(5577);
  });

  it("formats an Everest build as a version", () => {
    expect(formatEverestBuildVersion(6123)).toBe("1.6123.0");
  });
});

function release(version: number): EverestRelease {
  return {
    branch: "stable",
    version,
    date: "",
    commit: "",
    mainFileSize: null,
    mainDownload: "",
    mirrorDownload: "",
    isNative: false
  };
}

function record(name: string, version: string): ModRecord {
  return {
    id: name,
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
    metadata: { name, version, author: "", description: "", dependencies: [], optionalDependencies: [] },
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
