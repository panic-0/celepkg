import { describe, expect, it } from "vitest";
import type { ModRecord, Profile, ScanResult } from "../types";
import {
  inferDependencyMods,
  nextCopyName,
  profileNameExists,
  resolveMapProfileContent,
  resolveModProfileContent,
  toggleSetValue
} from "./profileDraftLogic";

describe("profile draft logic", () => {
  it("toggles set values immutably", () => {
    const original = new Set(["a"]);

    expect([...toggleSetValue(original, "a")]).toEqual([]);
    expect([...toggleSetValue(original, "b")]).toEqual(["a", "b"]);
    expect([...original]).toEqual(["a"]);
  });

  it("fills legacy map profile content from current scan while preserving read-only maps", () => {
    const scan = scanWithRecords({
      maps: [record("official", "Official", "map", { enabled: false, readOnly: true }), record("map-a", "Map A", "map", { enabled: true })],
      otherMods: [record("helper", "Helper", "mod", { enabled: true, subMaps: [subMap("helper-test")] })]
    });
    const legacyProfile = profile({ enabledMapIds: null, enabledModIds: null });

    expect(resolveMapProfileContent(legacyProfile, scan)).toEqual({
      enabledMapIds: ["map-a", "official"],
      enabledModIds: ["helper"]
    });
  });

  it("fills legacy mod profile content from enabled mods", () => {
    const scan = scanWithRecords({
      otherMods: [record("enabled", "Enabled", "mod", { enabled: true }), record("disabled", "Disabled", "mod")]
    });

    expect(resolveModProfileContent(profile({ enabledModIds: null }), scan)).toEqual({ enabledModIds: ["enabled"] });
  });

  it("generates non-conflicting copy names and detects duplicate profile names", () => {
    const profiles = [profile({ id: "a", name: "Main" }), profile({ id: "b", name: "Main Copy" })];

    expect(nextCopyName("Main", profiles)).toBe("Main Copy 2");
    expect(profileNameExists(profiles, "Main", "b")).toBe(true);
    expect(profileNameExists(profiles, "Main", "a")).toBe(false);
  });

  it("infers map and transitive mod dependencies without adding explicit mods", () => {
    const scan = scanWithRecords({
      maps: [record("map", "Map", "map", { dependencies: [{ name: "Helper", version: "" }] })],
      otherMods: [
        record("helper", "Helper", "mod", { dependencies: [{ name: "Library", version: "" }] }),
        record("library", "Library", "mod"),
        record("explicit", "Explicit", "mod")
      ]
    });

    expect([...inferDependencyMods(scan, new Set(["map"]), new Set(["explicit"]))]).toEqual(["helper", "library"]);
  });
});

function profile(overrides: Partial<Profile>): Profile {
  return {
    id: "profile",
    name: "Profile",
    profileType: "maps",
    enabledMapIds: [],
    enabledModIds: [],
    launchArgs: "",
    createdAt: "1",
    updatedAt: "1",
    ...overrides
  };
}

function scanWithRecords({ maps = [], otherMods = [] }: { maps?: ModRecord[]; otherMods?: ModRecord[] }): ScanResult {
  return {
    celestePath: "D:/Celeste",
    modsPath: "D:/Celeste/Mods",
    blacklistPath: "D:/Celeste/Mods/blacklist.txt",
    blacklistEntries: [],
    gameExecutable: "D:/Celeste/Celeste.exe",
    maps,
    otherMods,
    profiles: { activeMapProfileId: "maps", activeModProfileId: "mods", profiles: [] },
    availableSaveFiles: [],
    selectedSaveFiles: [],
    warnings: [],
    timings: []
  };
}

function record(id: string, name: string, kind: ModRecord["kind"], overrides: Partial<ModRecord> = {}): ModRecord {
  return {
    id,
    name,
    fileName: `${name}.zip`,
    relativePath: `Mods/${name}.zip`,
    absolutePath: `D:/Celeste/Mods/${name}.zip`,
    isArchive: true,
    kind,
    enabled: false,
    favorite: false,
    protected: false,
    readOnly: false,
    metadata: {
      name,
      version: "",
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
    warnings: [],
    ...overrides
  };
}

function subMap(id: string) {
  return {
    id,
    sid: id,
    modeIndex: null,
    displayName: id,
    chapter: "",
    filePath: `${id}.bin`,
    difficulty: "",
    strawberryCount: 0,
    strawberryTotalCount: 0,
    completionStatus: "notApplicable" as const,
    stats: null
  };
}
