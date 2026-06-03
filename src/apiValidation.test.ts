import { describe, expect, it } from "vitest";
import {
  validateConfigResponse,
  validateModCatalogSearchResult,
  validateModInstallResult,
  validateModUpdateCheckResult,
  validateScanResult
} from "./apiValidation";

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

const catalogEntry = {
  source: "everestMirror",
  id: "helper",
  name: "Helper",
  version: "1.2.3",
  downloadUrl: "https://gamebanana.com/mmdl/1",
  pageUrl: "https://gamebanana.com/mods/1",
  gameBananaType: "Mod",
  gameBananaId: 1,
  gameBananaFileId: 2,
  size: 1024,
  lastUpdate: 1700000000,
  xxHash: ["abc"]
};

const scanResult = {
  celestePath: "D:/Celeste",
  modsPath: "D:/Celeste/Mods",
  blacklistPath: "D:/Celeste/blacklist.txt",
  blacklistEntries: [],
  gameExecutable: "Celeste.exe",
  maps: [],
  otherMods: [],
  profiles,
  availableSaveFiles: [],
  selectedSaveFiles: ["0.celeste"],
  warnings: [],
  timings: []
};

describe("api validation", () => {
  it("accepts valid config responses", () => {
    expect(
      validateConfigResponse({
        celestePath: "D:/Celeste",
        autoBackupEnabled: true,
        autoBackupCleanupEnabled: true,
        autoBackupRetentionCount: 20,
        modCatalogSources: ["everestMirror", "wegfan"],
        autoCheckModUpdatesOnStartup: true,
        selectedSaveFiles: ["0.celeste"],
        profiles,
        warnings: ["配置提示"]
      })
    ).toEqual({
      celestePath: "D:/Celeste",
      autoBackupEnabled: true,
      autoBackupCleanupEnabled: true,
      autoBackupRetentionCount: 20,
      modCatalogSources: ["everestMirror", "wegfan"],
      autoCheckModUpdatesOnStartup: true,
      selectedSaveFiles: ["0.celeste"],
      profiles,
      warnings: ["配置提示"]
    });
  });

  it("rejects config responses with changed field types", () => {
    expect(() =>
      validateConfigResponse({
        celestePath: "D:/Celeste",
        autoBackupEnabled: "yes",
        autoBackupCleanupEnabled: true,
        autoBackupRetentionCount: 20,
        modCatalogSources: ["everestMirror", "wegfan"],
        autoCheckModUpdatesOnStartup: true,
        selectedSaveFiles: ["0.celeste"],
        profiles,
        warnings: []
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
            strawberryTotalCount: 0,
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
        warnings: [],
        timings: []
      })
    ).toThrow("scan.maps[0].kind");
  });

  it("accepts mod catalog search and update responses", () => {
    expect(
      validateModCatalogSearchResult({
        sources: ["everestMirror"],
        entries: [catalogEntry],
        warnings: []
      }).entries[0].xxHash
    ).toEqual(["abc"]);

    expect(
      validateModUpdateCheckResult({
        sources: ["everestMirror"],
        updates: [
          {
            entry: catalogEntry,
            installed: {
              recordId: "helper",
              name: "Helper",
              fileName: "Helper.zip",
              relativePath: "Mods/Helper.zip",
              absolutePath: "D:/Celeste/Mods/Helper.zip",
              version: "1.0.0",
              hash: "old"
            },
            updateAvailable: true,
            reason: "hash changed"
          }
        ],
        matched: [],
        warnings: []
      }).updates[0].entry.source
    ).toBe("everestMirror");
  });

  it("accepts mod install responses with nested scan", () => {
    expect(
      validateModInstallResult({
        entry: catalogEntry,
        destinationPath: "D:/Celeste/Mods/Helper.zip",
        replacedPath: null,
        hash: "abc",
        scan: scanResult
      }).scan.celestePath
    ).toBe("D:/Celeste");
  });
});
