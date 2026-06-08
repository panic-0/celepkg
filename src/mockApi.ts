import type {
  BackupInfo,
  BackupModEntry,
  ConfigResponse,
  Dependency,
  EverestInstallResult,
  EverestRelease,
  EverestReleaseList,
  GameBananaCatalogStatsResult,
  GameStatus,
  ModCatalogDependencyResolutionResult,
  ModCatalogEntry,
  ModCatalogSearchResult,
  ModCatalogSourceKind,
  ModInstallResult,
  ModMetadata,
  ModPreviewStaging,
  ModRecord,
  ModUpdateCheckResult,
  Profile,
  ProfilesState,
  RestoreScope,
  ScanResult,
  StagedDownload
} from "./types";
import { catalogEntry, createMockCatalog, createMockEverestReleases, mockUpdateMetadata } from "./mockCatalogData";
import { createMockScan, createTimings, mockCelestePath, profile, record } from "./mock/scanFixtures";
import { dependencyEntrySatisfies } from "./utils/appDependencyResolution";
import {
  DEFAULT_AUTO_BACKUP_CLEANUP_ENABLED,
  DEFAULT_AUTO_BACKUP_ENABLED,
  DEFAULT_AUTO_BACKUP_RETENTION_COUNT,
  DEFAULT_AUTO_CHECK_APP_UPDATES_ON_STARTUP,
  DEFAULT_AUTO_CHECK_MOD_UPDATES_ON_STARTUP,
  DEFAULT_AUTO_REFRESH_MOD_CATALOG_CACHE_ON_STARTUP,
  DEFAULT_MOD_CATALOG_SOURCE_ENABLED_COUNT,
  DEFAULT_MOD_CATALOG_SOURCE_ORDER,
  DEFAULT_SELECTED_SAVE_FILES,
  normalizeModCatalogSourceSettings
} from "./utils/configDefaults";
import { normalizeDependencyName } from "./utils/dependencies";
let autoBackupEnabled = DEFAULT_AUTO_BACKUP_ENABLED;
let autoBackupCleanupEnabled = DEFAULT_AUTO_BACKUP_CLEANUP_ENABLED;
let autoBackupRetentionCount = DEFAULT_AUTO_BACKUP_RETENTION_COUNT;
let modCatalogSourceOrder: ModCatalogSourceKind[] = [...DEFAULT_MOD_CATALOG_SOURCE_ORDER];
let modCatalogSourceEnabledCount = DEFAULT_MOD_CATALOG_SOURCE_ENABLED_COUNT;
let autoCheckModUpdatesOnStartup = DEFAULT_AUTO_CHECK_MOD_UPDATES_ON_STARTUP;
let autoCheckAppUpdatesOnStartup = DEFAULT_AUTO_CHECK_APP_UPDATES_ON_STARTUP;
let autoRefreshModCatalogCacheOnStartup = DEFAULT_AUTO_REFRESH_MOD_CATALOG_CACHE_ON_STARTUP;
let selectedSaveFiles = [...DEFAULT_SELECTED_SAVE_FILES, "1.celeste"];
let backupSequence = 4;

let profiles: ProfilesState = {
  activeMapProfileId: "maps-main",
  activeModProfileId: "mods-main",
  profiles: [
    profile("maps-main", "主线推进", "maps", ["official-celeste", "strawberry-jam", "galactica"], ["communal-helper"], "-debug"),
    profile("maps-clean", "只玩官图", "maps", ["official-celeste"], [], ""),
    profile(
      "maps-expert",
      "高难清图",
      "maps",
      ["official-celeste", "strawberry-jam", "china-mirror"],
      ["communal-helper", "jungle-helper"],
      "-debug"
    ),
    profile("mods-main", "常用工具", "mods", null, ["builtin-everest-core", "communal-helper", "loenn", "infinite-backups"], ""),
    profile("mods-minimal", "最小启动", "mods", null, ["builtin-everest-core"], ""),
    profile("mods-testing", "测试图工具链", "mods", null, ["builtin-everest-core", "communal-helper", "jungle-helper", "speedrun-tool"], "")
  ]
};

let scan = createMockScan(profiles, selectedSaveFiles);
const catalogEntries = createMockCatalog();
const stagedDownloads = new Map<string, StagedDownload>();
const stagedDownloadMetadata = new Map<string, ModMetadata>();
const consumedMockDownloadFailures = new Set<string>();
const mockDownloadFailureMessage = "下载 Mod 失败：网络连接已中断，无法继续读取远端文件。";
const mockInstallFailureMessage = "暂存旧 Mod 失败：另一个程序正在使用此文件，进程无法访问。 (os error 32)";
let mockGameRunning = false;
let pendingMockGameLaunchStatusMisses = 0;
let mockGameStatusPhaseSequence: GameStatus["phase"][] = [];
let backups: BackupInfo[] = [
  backup("1770048600000000000-auto", "auto", "D:\\Games\\Celeste\\celepkg\\backups\\1770048600000000000-auto", true, true),
  backup("1770045000000000000-auto", "auto", "D:\\Games\\Celeste\\celepkg\\backups\\1770045000000000000-auto", true, false),
  backup("1770037800000000000-manual", "manual", "D:\\Games\\Celeste\\celepkg\\backups\\1770037800000000000-manual", true, true)
];

export function isMockMode() {
  if (typeof window === "undefined") return false;
  return import.meta.env.DEV && (window.location.pathname === "/mock" || new URLSearchParams(window.location.search).has("mock"));
}

export function delayNextMockGameLaunchStatusChecks(misses: number) {
  pendingMockGameLaunchStatusMisses = Math.max(0, Math.trunc(misses));
}

export function setMockGameRunningForTests(running: boolean) {
  mockGameRunning = running;
  pendingMockGameLaunchStatusMisses = 0;
  mockGameStatusPhaseSequence = [];
}

export function setMockGameStatusPhaseSequenceForTests(phases: GameStatus["phase"][]) {
  mockGameStatusPhaseSequence = [...phases];
  mockGameRunning = phases[0] === "running";
  pendingMockGameLaunchStatusMisses = 0;
}

export const mockApi = {
  async getConfig(): Promise<ConfigResponse> {
    return clone(config());
  },

  async setCelestePath(celestePath: string): Promise<{ celestePath: string }> {
    scan = { ...scan, celestePath };
    return { celestePath };
  },

  async selectCelesteDirectory(): Promise<string | null> {
    return mockCelestePath;
  },

  async setAutoBackupEnabled(enabled: boolean): Promise<ConfigResponse> {
    autoBackupEnabled = enabled;
    return clone(config());
  },

  async setAutoBackupCleanupEnabled(enabled: boolean): Promise<ConfigResponse> {
    autoBackupCleanupEnabled = enabled;
    return clone(config());
  },

  async setAutoBackupRetentionCount(count: number): Promise<ConfigResponse> {
    autoBackupRetentionCount = Math.max(1, Math.min(100, Math.trunc(count)));
    return clone(config());
  },

  async setModCatalogSources(order: ModCatalogSourceKind[], enabledCount: number): Promise<ConfigResponse> {
    const settings = normalizeModCatalogSourceSettings(order, enabledCount);
    modCatalogSourceOrder = settings.order;
    modCatalogSourceEnabledCount = settings.enabledCount;
    return clone(config());
  },

  async setAutoCheckModUpdatesOnStartup(enabled: boolean): Promise<ConfigResponse> {
    autoCheckModUpdatesOnStartup = enabled;
    return clone(config());
  },

  async setAutoCheckAppUpdatesOnStartup(enabled: boolean): Promise<ConfigResponse> {
    autoCheckAppUpdatesOnStartup = enabled;
    return clone(config());
  },

  async setAutoRefreshModCatalogCacheOnStartup(enabled: boolean): Promise<ConfigResponse> {
    autoRefreshModCatalogCacheOnStartup = enabled;
    return clone(config());
  },

  async setSelectedSaveFiles(saveFiles: string[]): Promise<ConfigResponse> {
    selectedSaveFiles = [...saveFiles];
    scan = { ...scan, selectedSaveFiles };
    return clone(config());
  },

  async scanCeleste(celestePath: string): Promise<ScanResult> {
    scan = { ...scan, celestePath, profiles, selectedSaveFiles };
    return clone(scan);
  },

  async rescanCeleste(celestePath: string): Promise<ScanResult> {
    scan = { ...scan, celestePath, profiles, selectedSaveFiles, timings: createTimings() };
    return clone(scan);
  },

  async searchModCatalog(query: string, sources: ModCatalogSourceKind[]): Promise<ModCatalogSearchResult> {
    const selectedSources = sources.length ? sources : (["wegfan", "everestMirror"] satisfies ModCatalogSourceKind[]);
    const needle = query.trim().toLowerCase();
    const entries = catalogEntries
      .filter((entry) => selectedSources.includes(entry.source))
      .filter(
        (entry) =>
          !needle ||
          `${entry.name} ${entry.version} ${entry.gameBananaType} ${entry.categoryName} ${entry.subCategoryName}`
            .toLowerCase()
            .includes(needle)
      );
    return clone({
      sources: selectedSources,
      entries,
      warnings: selectedSources.includes("everest") ? ["Mock：官方指针源暂时较慢，已继续显示其他结果。"] : []
    });
  },

  async refreshModCatalogCache(sources: ModCatalogSourceKind[]): Promise<ModCatalogSearchResult> {
    await delay(250);
    return mockApi.searchModCatalog("", sources);
  },

  async getModCatalogStats(gameBananaIds: number[]): Promise<GameBananaCatalogStatsResult> {
    return clone({
      stats: [...new Set(gameBananaIds)]
        .filter((id) => Number.isFinite(id) && id > 0)
        .map((gameBananaId) => ({
          gameBananaId,
          viewCount: mockCatalogViewCount(gameBananaId),
          likeCount: mockCatalogLikeCount(gameBananaId)
        })),
      warnings: []
    });
  },

  async resolveModCatalogDependencies(
    dependencies: Dependency[],
    sources: ModCatalogSourceKind[]
  ): Promise<ModCatalogDependencyResolutionResult> {
    const selectedSources = sources.length ? sources : (["wegfan", "everestMirror"] satisfies ModCatalogSourceKind[]);
    const entries = catalogEntries.filter((entry) => selectedSources.includes(entry.source));
    return clone({
      sources: selectedSources,
      resolutions: dependencies.map((dependency) => {
        const normalized = normalizeDependencyName(dependency.name);
        return {
          dependency,
          entry:
            entries.find((entry) => normalizeDependencyName(entry.name) === normalized && dependencyEntrySatisfies(entry, dependency)) ??
            null
        };
      }),
      warnings: []
    });
  },

  async checkModUpdates(celestePath: string, sources: ModCatalogSourceKind[]): Promise<ModUpdateCheckResult> {
    void celestePath;
    const selectedSources = sources.length ? sources : (["wegfan", "everestMirror"] satisfies ModCatalogSourceKind[]);
    const installed = [...scan.maps, ...scan.otherMods];
    const matched = catalogEntries
      .filter((entry) => selectedSources.includes(entry.source))
      .flatMap((entry) => {
        const record = installed.find((item) => item.name.toLowerCase() === entry.name.toLowerCase());
        if (!record) return [];
        const updateAvailable = [
          "CommunalHelper",
          "Galactica",
          "Mock Install Failure",
          "Mock Download Failure",
          "Mock Dependency Tree Root"
        ].includes(record.name);
        return [
          {
            entry,
            installed: {
              recordId: record.id,
              name: record.name,
              fileName: record.fileName,
              relativePath: record.relativePath,
              absolutePath: record.absolutePath,
              version: record.metadata.version,
              hash: updateAvailable ? "old-local-hash" : entry.xxHash[0]
            },
            updateAvailable,
            reason: updateAvailable ? "本地文件哈希不在目录记录中" : "本地文件哈希已在目录记录中"
          }
        ];
      });
    const mockBulkUpdates = installed
      .filter((record) => record.name.startsWith("Mock Helper "))
      .slice(0, 109)
      .map((record, index) => {
        const entry = catalogEntry(
          index % 2 ? "wegfan" : "everestMirror",
          record.name,
          `2.${index + 1}.0`,
          "Mod",
          `https://gamebanana.com/mmdl/${9000 + index}`,
          [`mock-bulk-hash-${index + 1}`],
          index % 3 === 0 ? "Helpers" : index % 3 === 1 ? "Maps" : "Tools",
          index % 3 === 1 ? "Standalone" : ""
        );
        return {
          entry,
          installed: {
            recordId: record.id,
            name: record.name,
            fileName: record.fileName,
            relativePath: record.relativePath,
            absolutePath: record.absolutePath,
            version: record.metadata.version,
            hash: "old-local-hash"
          },
          updateAvailable: true,
          reason: "Mock：本地列表中的批量更新候选"
        };
      });
    const allMatched = [...matched, ...mockBulkUpdates];
    return clone({
      sources: selectedSources,
      updates: allMatched.filter((item) => item.updateAvailable),
      matched: allMatched,
      warnings: []
    });
  },

  async previewModUpdateMetadata(_celestePath: string, entry: ModCatalogEntry): Promise<ModMetadata> {
    return clone(mockUpdateMetadata(entry));
  },

  async stageModPreview(_celestePath: string, entry: ModCatalogEntry, operationId: string): Promise<ModPreviewStaging> {
    await delay(300);
    const staged = stagedDownload(
      `mod-preview-${entry.id || entry.name}-${operationId}`,
      entry.name,
      "mod",
      entry.size,
      entry.xxHash[0] ?? null
    );
    stagedDownloads.set(staged.stagedId, staged);
    const metadata = mockUpdateMetadata(entry);
    stagedDownloadMetadata.set(staged.stagedId, metadata);
    return clone({ staged, metadata });
  },

  async listEverestReleases(): Promise<EverestReleaseList> {
    await delay(250);
    return clone({
      releases: createMockEverestReleases(),
      warnings: []
    });
  },

  async downloadEverestToStaging(_celestePath: string, release: EverestRelease, operationId: string): Promise<StagedDownload> {
    await delay(300);
    const staged = stagedDownload(`everest-${release.version}-${operationId}`, "Everest", "everest", release.mainFileSize, null);
    stagedDownloads.set(staged.stagedId, staged);
    return clone(staged);
  },

  async installStagedEverest(_celestePath: string, stagedId: string, release: EverestRelease): Promise<EverestInstallResult> {
    requireStagedDownload(stagedId, "everest");
    stagedDownloads.delete(stagedId);
    await delay(100);
    scan = {
      ...scan,
      otherMods: scan.otherMods.map((item) =>
        item.name === "Everest" || item.name === "EverestCore"
          ? { ...item, metadata: { ...item.metadata, version: `1.${release.version}.0` } }
          : item
      )
    };
    return clone({ release, scan });
  },

  async downloadModToStaging(
    _celestePath: string,
    entry: ModCatalogEntry,
    operationId: string,
    _taskIndex = 1,
    _taskTotal = 1
  ): Promise<StagedDownload> {
    void _taskIndex;
    void _taskTotal;
    await delay(300);
    if (entry.name === "Mock Download Failure" && !consumedMockDownloadFailures.has(entry.id)) {
      consumedMockDownloadFailures.add(entry.id);
      throw new Error(mockDownloadFailureMessage);
    }
    const staged = stagedDownload(`mod-${entry.id || entry.name}-${operationId}`, entry.name, "mod", entry.size, entry.xxHash[0] ?? null);
    stagedDownloads.set(staged.stagedId, staged);
    stagedDownloadMetadata.set(staged.stagedId, mockUpdateMetadata(entry));
    return clone(staged);
  },

  async readStagedModMetadata(_celestePath: string, stagedId: string): Promise<ModMetadata> {
    requireStagedDownload(stagedId, "mod");
    return clone(
      stagedDownloadMetadata.get(stagedId) ?? {
        name: "",
        version: "",
        author: "",
        description: "",
        dependencies: [],
        optionalDependencies: []
      }
    );
  },

  async installStagedMod(celestePath: string, stagedId: string, entry: ModCatalogEntry, installedPath?: string): Promise<ModInstallResult> {
    requireStagedDownload(stagedId, "mod");
    stagedDownloads.delete(stagedId);
    stagedDownloadMetadata.delete(stagedId);
    await delay(100);
    if (entry.name === "Mock Install Failure") throw new Error(mockInstallFailureMessage);
    if (installedPath) {
      scan = updateRecord(scan, entry.name.toLowerCase().replace(/\s+/g, "-"), (item) => ({
        ...item,
        metadata: { ...item.metadata, version: entry.version }
      }));
      scan = {
        ...scan,
        maps: scan.maps.map((item) =>
          item.name === entry.name ? { ...item, metadata: { ...item.metadata, version: entry.version } } : item
        ),
        otherMods: scan.otherMods.map((item) =>
          item.name === entry.name ? { ...item, metadata: { ...item.metadata, version: entry.version } } : item
        )
      };
    } else {
      const installed = record({
        id: `mock-installed-${entry.id}`,
        name: entry.name,
        fileName: `${entry.name}.zip`,
        relativePath: `Mods/${entry.name}.zip`,
        kind: entry.categoryName.toLowerCase() === "maps" || entry.gameBananaType.toLowerCase() === "map" ? "map" : "mod",
        enabled: false,
        description: "Mock 安装的目录条目。",
        version: entry.version
      });
      if (installed.kind === "map") {
        scan = { ...scan, maps: [...scan.maps, installed] };
      } else {
        scan = { ...scan, otherMods: [...scan.otherMods, installed] };
      }
    }
    return clone({
      entry,
      destinationPath: installedPath || `${celestePath}\\Mods\\${entry.name}.zip`,
      replacedPath: installedPath || `${celestePath}\\Mods\\${entry.name}.zip`,
      hash: entry.xxHash[0] ?? "mock-hash",
      scan
    });
  },

  async saveProfile(profileDraft: Partial<Profile> & { name: string }): Promise<ProfilesState> {
    const now = "1770050400000000000";
    const existing = profileDraft.id ? profiles.profiles.find((item) => item.id === profileDraft.id) : undefined;
    const nextProfile: Profile = {
      id: existing?.id ?? `${profileDraft.profileType ?? "maps"}-${now}-${profiles.profiles.length + 1}`,
      name: profileDraft.name,
      profileType: profileDraft.profileType ?? existing?.profileType ?? "maps",
      enabledMapIds: profileDraft.enabledMapIds ?? existing?.enabledMapIds ?? null,
      enabledModIds: profileDraft.enabledModIds ?? existing?.enabledModIds ?? null,
      launchArgs: profileDraft.launchArgs ?? existing?.launchArgs ?? "",
      createdAt: profileDraft.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now
    };
    profiles = {
      activeMapProfileId: nextProfile.profileType === "maps" ? nextProfile.id : profiles.activeMapProfileId,
      activeModProfileId: nextProfile.profileType === "mods" ? nextProfile.id : profiles.activeModProfileId,
      profiles: existing
        ? profiles.profiles.map((item) => (item.id === nextProfile.id ? nextProfile : item))
        : [...profiles.profiles, nextProfile]
    };
    scan = { ...scan, profiles };
    return clone(profiles);
  },

  async deleteProfile(profileId: string): Promise<ProfilesState> {
    profiles = {
      activeMapProfileId: profiles.activeMapProfileId === profileId ? "maps-main" : profiles.activeMapProfileId,
      activeModProfileId: profiles.activeModProfileId === profileId ? "mods-main" : profiles.activeModProfileId,
      profiles: profiles.profiles.filter((profileItem) => profileItem.id !== profileId)
    };
    scan = { ...scan, profiles };
    return clone(profiles);
  },

  async applyProfile(celestePath: string, mapProfileId: string, modProfileId: string): Promise<ScanResult> {
    profiles = { ...profiles, activeMapProfileId: mapProfileId, activeModProfileId: modProfileId };
    scan = applyProfileState({ ...scan, celestePath, profiles }, mapProfileId, modProfileId);
    return clone(scan);
  },

  async launchProfile(
    celestePath: string,
    mapProfileId: string,
    modProfileId: string
  ): Promise<{
    launched: boolean;
    executable: string;
    mapProfileId: string;
    modProfileId: string;
    launchMethod: "direct";
    warnings: string[];
  }> {
    mockGameRunning = pendingMockGameLaunchStatusMisses === 0;
    scan = applyProfileState({ ...scan, celestePath }, mapProfileId, modProfileId);
    return { launched: true, executable: `${celestePath}\\Celeste.exe`, mapProfileId, modProfileId, launchMethod: "direct", warnings: [] };
  },

  async launchGame(
    celestePath: string,
    launchArgs: string
  ): Promise<{
    launched: boolean;
    executable: string;
    mapProfileId: string;
    modProfileId: string;
    launchMethod: "direct";
    warnings: string[];
  }> {
    void launchArgs;
    mockGameRunning = pendingMockGameLaunchStatusMisses === 0;
    return {
      launched: true,
      executable: `${celestePath}\\Celeste.exe`,
      mapProfileId: profiles.activeMapProfileId,
      modProfileId: profiles.activeModProfileId,
      launchMethod: "direct",
      warnings: []
    };
  },

  async getGameStatus(celestePath: string): Promise<GameStatus> {
    if (mockGameStatusPhaseSequence.length) {
      const phase = mockGameStatusPhaseSequence.shift() ?? "idle";
      mockGameRunning = phase === "running";
      return clone(mockGameStatus(celestePath, phase));
    }
    const running = mockGameRunning;
    if (!mockGameRunning && pendingMockGameLaunchStatusMisses > 0) {
      pendingMockGameLaunchStatusMisses -= 1;
      if (pendingMockGameLaunchStatusMisses === 0) mockGameRunning = true;
    }
    return clone(mockGameStatus(celestePath, running ? "running" : "idle"));
  },

  async stopGame(celestePath: string): Promise<GameStatus> {
    const wasRunning = mockGameRunning;
    mockGameRunning = false;
    pendingMockGameLaunchStatusMisses = 0;
    mockGameStatusPhaseSequence = [];
    return clone({ ...mockGameStatus(celestePath, "idle"), stopped: wasRunning });
  },

  async setRecordFavorite(_celestePath: string, recordId: string, favorite: boolean): Promise<ScanResult> {
    scan = updateRecord(scan, recordId, (record) => ({ ...record, favorite }));
    return clone(scan);
  },

  async setRecordProtected(_celestePath: string, recordId: string, protectedValue: boolean): Promise<ScanResult> {
    scan = updateRecord(scan, recordId, (record) => ({ ...record, protected: protectedValue }));
    return clone(scan);
  },

  async cancelModDownload(operationId: string): Promise<boolean> {
    void operationId;
    return true;
  },

  async deleteStagedDownload(_celestePath: string, stagedId: string): Promise<boolean> {
    stagedDownloadMetadata.delete(stagedId);
    return stagedDownloads.delete(stagedId);
  },

  async createBackup(celestePath: string, kind: "manual" | "auto" = "manual"): Promise<BackupInfo> {
    backupSequence += 1;
    const createdAt = `${1770050400000000000 + backupSequence * 1_000_000_000}`;
    const nextBackup = backup(`${createdAt}-${kind}`, kind, `${celestePath}\\.celepkg\\backups\\${createdAt}-${kind}`, true, true);
    backups = [nextBackup, ...backups];
    return clone(nextBackup);
  },

  async listBackups(): Promise<BackupInfo[]> {
    return clone(backups);
  },

  async restoreBackup(backupId: string, scope: RestoreScope): Promise<BackupInfo> {
    void scope;
    const found = backups.find((item) => item.id === backupId);
    if (!found) throw new Error("Mock 备份不存在。");
    return clone(found);
  },

  async deleteBackup(backupId: string): Promise<void> {
    backups = backups.filter((item) => item.id !== backupId);
  },

  async cleanupAutoBackups(): Promise<BackupInfo[]> {
    if (!autoBackupCleanupEnabled) return clone(backups);
    const autoBackups = backups.filter((item) => item.kind === "auto").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const keep = new Set(autoBackups.slice(0, autoBackupRetentionCount).map((item) => item.id));
    backups = backups.filter((item) => item.kind === "manual" || keep.has(item.id));
    return clone(backups);
  },

  async openBackupFolder(celestePath: string): Promise<void> {
    void celestePath;
  },

  async openBackupLocation(backupPath: string): Promise<void> {
    void backupPath;
  },

  async openModLocation(absolutePath: string): Promise<void> {
    void absolutePath;
  }
};

function config(): ConfigResponse {
  return {
    celestePath: scan.celestePath,
    autoBackupEnabled,
    autoBackupCleanupEnabled,
    autoBackupRetentionCount,
    modCatalogSourceOrder,
    modCatalogSourceEnabledCount,
    autoCheckModUpdatesOnStartup,
    autoCheckAppUpdatesOnStartup,
    autoRefreshModCatalogCacheOnStartup,
    selectedSaveFiles,
    profiles,
    warnings: []
  };
}

function backup(
  id: string,
  kind: BackupInfo["kind"],
  backupPath: string,
  blacklistExisted: boolean,
  favoritesExisted: boolean
): BackupInfo {
  return {
    id,
    createdAt: id,
    kind,
    celestePath: mockCelestePath,
    backupPath,
    files: [
      fileEntry(
        "game",
        "Mods/blacklist.txt",
        `${mockCelestePath}\\Mods\\blacklist.txt`,
        `${backupPath}\\game\\Mods\\blacklist.txt`,
        blacklistExisted
      ),
      fileEntry(
        "game",
        "Mods/favorites.txt",
        `${mockCelestePath}\\Mods\\favorites.txt`,
        `${backupPath}\\game\\Mods\\favorites.txt`,
        favoritesExisted
      )
    ],
    mods: backupMods()
  };
}

function fileEntry(category: "state" | "game", label: string, targetPath: string, backupPath: string, existed: boolean) {
  return { category, label, targetPath, backupPath, existed };
}

function backupMods(): BackupModEntry[] {
  return [...scan.maps, ...scan.otherMods].slice(0, 8).map((record) => ({
    name: record.name,
    metadataName: record.metadata.name,
    fileName: record.fileName,
    relativePath: record.relativePath,
    version: record.metadata.version,
    enabled: record.enabled,
    isArchive: record.isArchive
  }));
}

function applyProfileState(currentScan: ScanResult, mapProfileId: string, modProfileId: string) {
  const mapProfile = profiles.profiles.find((item) => item.id === mapProfileId);
  const modProfile = profiles.profiles.find((item) => item.id === modProfileId);
  const enabledMapIds = new Set(mapProfile?.enabledMapIds ?? []);
  const enabledModIds = new Set([...(mapProfile?.enabledModIds ?? []), ...(modProfile?.enabledModIds ?? [])]);
  return {
    ...currentScan,
    profiles,
    maps: currentScan.maps.map((item) => ({ ...item, enabled: item.readOnly || enabledMapIds.has(item.id) })),
    otherMods: currentScan.otherMods.map((item) => ({ ...item, enabled: item.readOnly || enabledModIds.has(item.id) }))
  };
}

function updateRecord(currentScan: ScanResult, recordId: string, update: (record: ModRecord) => ModRecord) {
  return {
    ...currentScan,
    maps: currentScan.maps.map((item) => (item.id === recordId ? update(item) : item)),
    otherMods: currentScan.otherMods.map((item) => (item.id === recordId ? update(item) : item))
  };
}

function stagedDownload(
  stagedId: string,
  name: string,
  kind: StagedDownload["kind"],
  size: number | null,
  hash: string | null
): StagedDownload {
  return {
    stagedId: stagedId.replace(/[^a-z0-9_.-]/gi, "_"),
    name,
    kind,
    size,
    hash
  };
}

function requireStagedDownload(stagedId: string, kind: StagedDownload["kind"]) {
  const staged = stagedDownloads.get(stagedId);
  if (!staged) throw new Error("Mock staged 下载不存在。");
  if (staged.kind !== kind) throw new Error("Mock staged 下载类型不匹配。");
  return staged;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mockGameStatus(celestePath: string, phase: GameStatus["phase"]): GameStatus {
  const running = phase === "running";
  const busy = phase === "processStarting" || phase === "everestPreparing" || phase === "running";
  return {
    running,
    busy,
    stopped: false,
    executable: `${celestePath}\\Celeste.exe`,
    pid: busy ? 1234 : null,
    phase,
    detail:
      phase === "processStarting"
        ? "Celeste 正在启动"
        : phase === "everestPreparing"
          ? "Everest 正在加载 Mod 12/87"
          : phase === "running"
            ? "Celeste 正在运行"
            : "",
    windowTitle: phase === "everestPreparing" ? "Everest Loading Mods 12/87" : phase === "running" ? "Celeste" : ""
  };
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function mockCatalogViewCount(gameBananaId: number) {
  return (gameBananaId * 37) % 250_000;
}

function mockCatalogLikeCount(gameBananaId: number) {
  return (gameBananaId * 17) % 8_000;
}
