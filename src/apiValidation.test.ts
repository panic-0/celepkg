import { describe, expect, it } from "vitest";
import {
  validateBackupInfo,
  validateBackupList,
  validateConfigResponse,
  validateEverestInstallResult,
  validateEverestReleaseList,
  validateGameBananaCatalogStatsResult,
  validateModCatalogDependencyResolutionResult,
  validateModCatalogSearchResult,
  validateModInstallResult,
  validateModMetadata,
  validateModPreviewStaging,
  validateModUpdateCheckResult,
  validateScanResult,
  validateStagedDownload
} from "./apiValidation";
import apiContract from "./contractSamples/api-contract.json";
import { readEventPayload, validateCommandPayload } from "./generated/api-validators";

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
  categoryName: "Helpers",
  subCategoryName: "",
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
  it("accepts the shared API contract samples", () => {
    expect(validateConfigResponse(apiContract.configResponse)).toEqual(apiContract.configResponse);
    expect(validateScanResult(apiContract.scanResult)).toEqual(apiContract.scanResult);
    expect(validateModCatalogSearchResult(apiContract.modCatalogSearchResult)).toEqual(apiContract.modCatalogSearchResult);
    expect(validateModUpdateCheckResult(apiContract.modUpdateCheckResult)).toEqual(apiContract.modUpdateCheckResult);
    expect(validateModInstallResult(apiContract.modInstallResult)).toEqual(apiContract.modInstallResult);
    expect(validateStagedDownload(apiContract.stagedDownload)).toEqual(apiContract.stagedDownload);
    expect(
      validateModPreviewStaging({
        staged: apiContract.stagedDownload,
        metadata: apiContract.modMetadata
      }).metadata.name
    ).toBe(apiContract.modMetadata.name);
    expect(validateEverestReleaseList(apiContract.everestReleaseList)).toEqual(apiContract.everestReleaseList);
    expect(validateEverestInstallResult(apiContract.everestInstallResult)).toEqual(apiContract.everestInstallResult);
    expect(validateBackupInfo(apiContract.backupInfo)).toEqual(apiContract.backupInfo);
    expect(validateBackupList(apiContract.backupList)).toEqual(apiContract.backupList);
    expect(validateModMetadata(apiContract.modMetadata)).toEqual(apiContract.modMetadata);
  });

  it("accepts valid config responses", () => {
    expect(
      validateConfigResponse({
        celestePath: "D:/Celeste",
        autoBackupEnabled: true,
        autoBackupCleanupEnabled: true,
        autoBackupRetentionCount: 20,
        modCatalogSourceOrder: ["wegfan", "everestMirror", "everest"],
        modCatalogSourceEnabledCount: 2,
        autoCheckModUpdatesOnStartup: true,
        autoCheckAppUpdatesOnStartup: true,
        autoRefreshModCatalogCacheOnStartup: true,
        selectedSaveFiles: ["0.celeste"],
        profiles,
        warnings: ["配置提示"]
      })
    ).toEqual({
      celestePath: "D:/Celeste",
      autoBackupEnabled: true,
      autoBackupCleanupEnabled: true,
      autoBackupRetentionCount: 20,
      modCatalogSourceOrder: ["wegfan", "everestMirror", "everest"],
      modCatalogSourceEnabledCount: 2,
      autoCheckModUpdatesOnStartup: true,
      autoCheckAppUpdatesOnStartup: true,
      autoRefreshModCatalogCacheOnStartup: true,
      selectedSaveFiles: ["0.celeste"],
      profiles,
      warnings: ["配置提示"]
    });
  });

  it("accepts staged download responses", () => {
    expect(
      validateStagedDownload({
        stagedId: "Helper.zip.download",
        name: "Helper",
        kind: "mod",
        size: 1024,
        hash: "abc"
      })
    ).toEqual({
      stagedId: "Helper.zip.download",
      name: "Helper",
      kind: "mod",
      size: 1024,
      hash: "abc"
    });

    expect(() =>
      validateStagedDownload({
        stagedId: "Everest.zip.download",
        name: "Everest",
        kind: "core",
        size: null,
        hash: null
      })
    ).toThrow("/kind");
  });

  it("rejects config responses with changed field types", () => {
    expect(() =>
      validateConfigResponse({
        celestePath: "D:/Celeste",
        autoBackupEnabled: "yes",
        autoBackupCleanupEnabled: true,
        autoBackupRetentionCount: 20,
        modCatalogSourceOrder: ["wegfan", "everestMirror", "everest"],
        modCatalogSourceEnabledCount: 2,
        autoCheckModUpdatesOnStartup: true,
        autoCheckAppUpdatesOnStartup: true,
        autoRefreshModCatalogCacheOnStartup: true,
        selectedSaveFiles: ["0.celeste"],
        profiles,
        warnings: []
      })
    ).toThrow("/autoBackupEnabled");
  });

  it("rejects payloads with missing required fields and unknown fields", () => {
    expect(() => validateCommandPayload("set_celeste_path", {})).toThrow("缺少字段 celestePath");
    expect(() => validateCommandPayload("set_celeste_path", { celestePath: "D:/Celeste", extra: true })).toThrow("未知字段 extra");
  });

  it("accepts backup responses with installed mod snapshots", () => {
    expect(
      validateBackupInfo({
        id: "100-auto",
        createdAt: "100",
        kind: "auto",
        celestePath: "D:/Celeste",
        backupPath: "D:/Celeste/celepkg/backups/100-auto",
        files: [],
        mods: [
          {
            name: "Helper",
            metadataName: "Helper",
            fileName: "Helper.zip",
            relativePath: "Helper.zip",
            version: "1.2.3",
            enabled: true,
            isArchive: true
          }
        ]
      }).mods[0].version
    ).toBe("1.2.3");
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
    ).toThrow("/maps/0/kind");
  });

  it("rejects invalid progress event payloads", () => {
    expect(readEventPayload("mod-download-progress", { operationId: "op", phase: "done", downloaded: 1 })).toBeNull();
    expect(
      readEventPayload("mod-download-progress", {
        operationId: "op",
        modName: "Helper",
        phase: "queued",
        downloaded: 1,
        total: null,
        speedBytesPerSec: 0,
        taskIndex: 1,
        taskTotal: 1,
        url: ""
      })
    ).toBeNull();
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

  it("accepts mod catalog stats responses and rejects unknown fields", () => {
    expect(
      validateGameBananaCatalogStatsResult({
        stats: [{ gameBananaId: 504505, viewCount: 4263, likeCount: 5 }],
        warnings: []
      }).stats[0].viewCount
    ).toBe(4263);

    expect(() =>
      validateGameBananaCatalogStatsResult({
        stats: [{ gameBananaId: 504505, viewCount: 4263, likeCount: 5, downloads: 308 }],
        warnings: []
      })
    ).toThrow("downloads");
  });

  it("accepts mod catalog dependency resolution responses", () => {
    expect(
      validateModCatalogDependencyResolutionResult({
        sources: ["everestMirror"],
        resolutions: [
          {
            dependency: { name: "Helper", version: "1.0.0" },
            entry: catalogEntry
          },
          {
            dependency: { name: "Missing", version: "" },
            entry: null
          }
        ],
        warnings: []
      }).resolutions.map((resolution) => resolution.entry?.name ?? null)
    ).toEqual(["Helper", null]);
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
