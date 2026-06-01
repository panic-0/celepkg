import { describe, expect, it } from "vitest";
import { validateConfigResponse, validateScanResult } from "./apiValidation";

const profiles = {
  activeMapProfileId: "default-maps",
  activeModProfileId: "default-mods",
  profiles: [
    {
      id: "default-maps",
      name: "Default Maps",
      profileType: "maps",
      enabledMapIds: null,
      enabledModIds: [],
      launchArgs: "",
      createdAt: "1",
      updatedAt: "1"
    }
  ]
};

const metadata = {
  name: "Spring Collab",
  version: "1.0.0",
  author: "Team",
  description: "",
  dependencies: [],
  optionalDependencies: []
};

describe("api validation", () => {
  it("accepts valid config responses", () => {
    expect(
      validateConfigResponse({
        celestePath: "D:/Celeste",
        autoBackupEnabled: true,
        selectedSaveFiles: ["0.celeste"],
        profiles
      })
    ).toEqual({
      celestePath: "D:/Celeste",
      autoBackupEnabled: true,
      selectedSaveFiles: ["0.celeste"],
      profiles
    });
  });

  it("rejects config responses with changed field types", () => {
    expect(() =>
      validateConfigResponse({
        celestePath: "D:/Celeste",
        autoBackupEnabled: "yes",
        selectedSaveFiles: ["0.celeste"],
        profiles
      })
    ).toThrow("config.autoBackupEnabled");
  });

  it("rejects scan records with unknown enum values", () => {
    expect(() =>
      validateScanResult({
        celestePath: "D:/Celeste",
        modsPath: "D:/Celeste/Mods",
        blacklistPath: "D:/Celeste/blacklist.txt",
        blacklistEntries: [],
        gameExecutable: "Celeste.exe",
        maps: [
          {
            id: "map",
            name: "Map",
            fileName: "Map.zip",
            relativePath: "Mods/Map.zip",
            absolutePath: "D:/Celeste/Mods/Map.zip",
            isArchive: true,
            kind: "campaign",
            enabled: true,
            favorite: false,
            protected: false,
            readOnly: false,
            metadata,
            mapIds: ["Map/Sid"],
            subMaps: [],
            mapCount: 1,
            strawberryCount: 0,
            completionStatus: "unknown",
            dependencies: [],
            optionalDependencies: [],
            stats: null,
            warnings: []
          }
        ],
        otherMods: [],
        profiles,
        availableSaveFiles: [],
        selectedSaveFiles: ["0.celeste"],
        warnings: []
      })
    ).toThrow("scan.maps[0].kind");
  });
});
