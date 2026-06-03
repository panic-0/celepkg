import type {
  BackupInfo,
  ConfigResponse,
  MapStats,
  ModCatalogEntry,
  ModCatalogSearchResult,
  ModCatalogSourceKind,
  ModInstallResult,
  ModRecord,
  ModUpdateCheckResult,
  Profile,
  ProfilesState,
  RestoreScope,
  ScanResult,
  SubMapInfo
} from "./types";

type MockRecordOptions = Partial<ModRecord> &
  Pick<ModRecord, "id" | "name" | "fileName" | "relativePath" | "kind"> & {
    description?: string;
    version?: string;
  };

const mockCelestePath = "D:\\Games\\Celeste";
let autoBackupEnabled = true;
let autoBackupCleanupEnabled = true;
let autoBackupRetentionCount = 20;
let selectedSaveFiles = ["0.celeste", "1.celeste"];
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
    profile("mods-main", "常用工具", "mods", null, ["everest-core", "communal-helper", "loenn", "infinite-backups"], ""),
    profile("mods-minimal", "最小启动", "mods", null, ["everest-core"], ""),
    profile("mods-testing", "测试图工具链", "mods", null, ["everest-core", "communal-helper", "jungle-helper", "speedrun-tool"], "")
  ]
};

let scan = createMockScan();
const catalogEntries = createMockCatalog();
let backups: BackupInfo[] = [
  backup("1770048600000000000-auto", "auto", "D:\\Games\\Celeste\\.celepkg\\backups\\1770048600000000000-auto", true, true),
  backup("1770045000000000000-auto", "auto", "D:\\Games\\Celeste\\.celepkg\\backups\\1770045000000000000-auto", true, false),
  backup("1770037800000000000-manual", "manual", "D:\\Games\\Celeste\\.celepkg\\backups\\1770037800000000000-manual", true, true)
];

export function isMockMode() {
  if (typeof window === "undefined") return false;
  return import.meta.env.DEV && (window.location.pathname === "/mock" || new URLSearchParams(window.location.search).has("mock"));
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
    const selectedSources = sources.length ? sources : (["everestMirror", "wegfan"] satisfies ModCatalogSourceKind[]);
    const needle = query.trim().toLowerCase();
    const entries = catalogEntries
      .filter((entry) => selectedSources.includes(entry.source))
      .filter((entry) => !needle || `${entry.name} ${entry.version} ${entry.gameBananaType}`.toLowerCase().includes(needle));
    return clone({
      sources: selectedSources,
      entries,
      warnings: selectedSources.includes("everest") ? ["Mock：官方指针源暂时较慢，已继续显示其他结果。"] : []
    });
  },

  async checkModUpdates(celestePath: string, sources: ModCatalogSourceKind[]): Promise<ModUpdateCheckResult> {
    void celestePath;
    const selectedSources = sources.length ? sources : (["everestMirror", "wegfan"] satisfies ModCatalogSourceKind[]);
    const installed = [...scan.maps, ...scan.otherMods];
    const matched = catalogEntries
      .filter((entry) => selectedSources.includes(entry.source))
      .flatMap((entry) => {
        const record = installed.find((item) => item.name.toLowerCase() === entry.name.toLowerCase());
        if (!record) return [];
        const updateAvailable = ["CommunalHelper", "Galactica"].includes(record.name);
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
    const mockBulkUpdates = Array.from({ length: 109 }, (_, index) => {
      const entry = catalogEntry(
        index % 2 ? "wegfan" : "everestMirror",
        `MockBulkUpdate${index + 1}`,
        `1.${index + 1}.0`,
        "Mod",
        `https://gamebanana.com/mmdl/${9000 + index}`,
        [`mock-bulk-hash-${index + 1}`]
      );
      return {
        entry,
        installed: {
          recordId: `mock-bulk-${index + 1}`,
          name: entry.name,
          fileName: `${entry.name}.zip`,
          relativePath: `Mods/${entry.name}.zip`,
          absolutePath: `${mockCelestePath}\\Mods\\${entry.name}.zip`,
          version: "0.1.0",
          hash: "old-local-hash"
        },
        updateAvailable: true,
        reason: "Mock：用于预览大量更新时的按钮显示"
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

  async installMod(celestePath: string, entry: ModCatalogEntry): Promise<ModInstallResult> {
    const installed = record({
      id: `mock-installed-${entry.id}`,
      name: entry.name,
      fileName: `${entry.name}.zip`,
      relativePath: `Mods/${entry.name}.zip`,
      kind: entry.gameBananaType.toLowerCase() === "map" ? "map" : "mod",
      enabled: false,
      description: "Mock 安装的目录条目。",
      version: entry.version
    });
    if (installed.kind === "map") {
      scan = { ...scan, maps: [...scan.maps, installed] };
    } else {
      scan = { ...scan, otherMods: [...scan.otherMods, installed] };
    }
    return clone({
      entry,
      destinationPath: `${celestePath}\\Mods\\${entry.name}.zip`,
      replacedPath: null,
      hash: entry.xxHash[0] ?? "mock-hash",
      scan
    });
  },

  async updateMod(celestePath: string, entry: ModCatalogEntry, installedPath: string): Promise<ModInstallResult> {
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
  ): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
    scan = applyProfileState({ ...scan, celestePath }, mapProfileId, modProfileId);
    return { launched: true, executable: `${celestePath}\\Celeste.exe`, mapProfileId, modProfileId };
  },

  async launchGame(
    celestePath: string,
    launchArgs: string
  ): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
    void launchArgs;
    return {
      launched: true,
      executable: `${celestePath}\\Celeste.exe`,
      mapProfileId: profiles.activeMapProfileId,
      modProfileId: profiles.activeModProfileId
    };
  },

  async setRecordFavorite(_celestePath: string, recordId: string, favorite: boolean): Promise<ScanResult> {
    scan = updateRecord(scan, recordId, (record) => ({ ...record, favorite }));
    return clone(scan);
  },

  async setRecordProtected(_celestePath: string, recordId: string, protectedValue: boolean): Promise<ScanResult> {
    scan = updateRecord(scan, recordId, (record) => ({ ...record, protected: protectedValue }));
    return clone(scan);
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
  }
};

function config(): ConfigResponse {
  return {
    celestePath: scan.celestePath,
    autoBackupEnabled,
    autoBackupCleanupEnabled,
    autoBackupRetentionCount,
    selectedSaveFiles,
    profiles,
    warnings: []
  };
}

function createMockScan(): ScanResult {
  const maps = [
    record({
      id: "official-celeste",
      name: "Celeste 官方地图",
      fileName: "Celeste/",
      relativePath: "Celeste/",
      kind: "map",
      enabled: true,
      readOnly: true,
      protected: true,
      description: "Celeste 自带关卡，只用于查看统计。",
      mapCount: 8,
      strawberryCount: 176,
      strawberryTotalCount: 202,
      completionStatus: "unfinished",
      stats: stats(412, 176, 202, 182340, true, 4, 5),
      subMaps: [
        subMap("official-1a", "Celeste/1-ForsakenCity", "被遗弃的城市", "A-Side", "beginner", 20, 20, "completed"),
        subMap("official-2b", "Celeste/2-OldSite/B-Side", "旧址", "B-Side", "intermediate", 18, 18, "completed"),
        subMap("official-7c", "Celeste/7-Summit/C-Side", "山顶", "C-Side", "expert", 0, 0, "unfinished")
      ]
    }),
    record({
      id: "strawberry-jam",
      name: "Strawberry Jam Collab",
      fileName: "StrawberryJam2021.zip",
      relativePath: "Mods/StrawberryJam2021.zip",
      kind: "map",
      enabled: true,
      favorite: true,
      description: "大型合作地图包，包含多个大厅与难度跨度。",
      version: "1.2.9",
      mapCount: 111,
      strawberryCount: 183,
      strawberryTotalCount: 310,
      completionStatus: "unfinished",
      dependencies: [
        { name: "EverestCore", version: "1.4980.0" },
        { name: "CommunalHelper", version: "1.22.0" }
      ],
      stats: stats(2680, 183, 310, 912420, false, 12, 9),
      subMaps: [
        subMap("sj-beginner-1", "StrawberryJam2021/1-BeginnerLobby/Squeeze", "Beginner Lobby", "Squeeze", "beginner", 5, 5, "completed"),
        subMap(
          "sj-advanced-1",
          "StrawberryJam2021/3-AdvancedLobby/SolarExpress",
          "Advanced Lobby",
          "Solar Express",
          "advanced",
          1,
          6,
          "unfinished"
        ),
        subMap(
          "sj-grandmaster-1",
          "StrawberryJam2021/5-GrandmasterLobby/PassionfruitPantheon",
          "Grandmaster Lobby",
          "Passionfruit Pantheon",
          "grandmaster",
          0,
          8,
          "unknown"
        )
      ]
    }),
    record({
      id: "galactica",
      name: "Galactica",
      fileName: "Galactica.zip",
      relativePath: "Mods/Galactica.zip",
      kind: "map",
      enabled: false,
      description: "偏视觉系的大型地图包，适合检查详情页长文本。",
      version: "2.0.0",
      mapCount: 14,
      strawberryCount: 12,
      strawberryTotalCount: 46,
      completionStatus: "unfinished",
      dependencies: [{ name: "CommunalHelper", version: "1.24.0" }],
      warnings: ["依赖版本可能过低：CommunalHelper 需要 1.24.0，本地 1.21.3"],
      stats: stats(924, 12, 46, 301200, false, 1, 1),
      subMaps: [
        subMap("galactica-1", "Galactica/Orbit", "Galactica", "Orbit", "advanced", 8, 12, "unfinished"),
        subMap("galactica-2", "Galactica/DeepSpace", "Galactica", "Deep Space", "expert", 4, 16, "unfinished")
      ]
    }),
    record({
      id: "china-mirror",
      name: "ChinaMirror",
      fileName: "ChinaMirror.zip",
      relativePath: "Mods/ChinaMirror.zip",
      kind: "map",
      enabled: false,
      description: "包含长名称、中文章节与缺失依赖提示的地图包。",
      version: "1.0.0",
      mapCount: 6,
      strawberryCount: 0,
      strawberryTotalCount: 35,
      completionStatus: "unknown",
      dependencies: [{ name: "JungleHelper", version: "1.1.0" }],
      warnings: ["缺少依赖：JungleHelper 1.1.0"],
      subMaps: [subMap("china-1", "ChinaMirror/镜中城", "镜中城", "入口", "intermediate", 0, 9, "unknown")]
    })
  ];
  const otherMods = [
    record({
      id: "everest-core",
      name: "EverestCore",
      fileName: "EverestCore.zip",
      relativePath: "Mods/EverestCore.zip",
      kind: "mod",
      enabled: true,
      readOnly: true,
      protected: true,
      description: "Everest 核心运行时。",
      version: "1.4980.0"
    }),
    record({
      id: "communal-helper",
      name: "CommunalHelper",
      fileName: "CommunalHelper.zip",
      relativePath: "Mods/CommunalHelper.zip",
      kind: "mod",
      enabled: true,
      favorite: true,
      protected: true,
      description: "常用 Helper，提供大量实体与机制。",
      version: "1.21.3",
      dependencies: [{ name: "EverestCore", version: "1.4980.0" }],
      warnings: ["依赖版本可能过低：CommunalHelper 需要 1.24.0，本地 1.21.3"]
    }),
    record({
      id: "loenn",
      name: "Loenn",
      fileName: "Loenn.zip",
      relativePath: "Mods/Loenn.zip",
      kind: "mod",
      enabled: true,
      description: "地图编辑器相关工具。",
      version: "0.7.0"
    }),
    record({
      id: "jungle-helper",
      name: "JungleHelper",
      fileName: "JungleHelper.zip",
      relativePath: "Mods/JungleHelper.zip",
      kind: "mod",
      enabled: false,
      description: "带测试图的 Helper，用来检查地图/Mod 两种视图的呈现。",
      version: "1.0.0",
      subMaps: [subMap("jungle-test-1", "JungleHelper/Test/Leaves", "JungleHelper", "Leaves Test", "test", 0, 0, "notApplicable")]
    }),
    record({
      id: "speedrun-tool",
      name: "SpeedrunTool",
      fileName: "SpeedrunTool.zip",
      relativePath: "Mods/SpeedrunTool.zip",
      kind: "mod",
      enabled: false,
      description: "练习与速通工具。",
      version: "3.18.2"
    }),
    record({
      id: "infinite-backups",
      name: "InfiniteBackups",
      fileName: "InfiniteBackups.zip",
      relativePath: "Mods/InfiniteBackups.zip",
      kind: "mod",
      enabled: true,
      description: "用于检查较长 Mod 名称与列表密度。",
      version: "0.5.0"
    })
  ];
  return {
    celestePath: mockCelestePath,
    modsPath: `${mockCelestePath}\\Mods`,
    blacklistPath: `${mockCelestePath}\\Mods\\blacklist.txt`,
    blacklistEntries: ["Galactica.zip", "ChinaMirror.zip", "JungleHelper.zip", "SpeedrunTool.zip"],
    gameExecutable: `${mockCelestePath}\\Celeste.exe`,
    maps,
    otherMods,
    profiles,
    availableSaveFiles: [
      { name: "0.celeste", playerName: "Madeline", currentMap: "Celeste/7-Summit", lastModified: "1770048000000000000" },
      {
        name: "1.celeste",
        playerName: "Theo",
        currentMap: "StrawberryJam2021/3-AdvancedLobby/SolarExpress",
        lastModified: "1770044400000000000"
      },
      { name: "2.celeste", playerName: "Badeline", currentMap: "Galactica/Orbit", lastModified: "1770037200000000000" }
    ],
    selectedSaveFiles,
    warnings: ["内置依赖版本无法确认：FNA 22.8.0，无法判断本地版本"],
    timings: createTimings()
  };
}

function createMockCatalog(): ModCatalogEntry[] {
  return [
    catalogEntry("everestMirror", "CommunalHelper", "1.24.3", "Mod", "https://gamebanana.com/mmdl/1111", ["new-communal-hash"]),
    catalogEntry("everestMirror", "Galactica", "2.1.0", "Map", "https://gamebanana.com/mmdl/2222", ["new-galactica-hash"]),
    catalogEntry("wegfan", "Strawberry Jam Collab", "1.2.9", "Map", "https://celeste.weg.fan/api/v2/download/files/sj", [
      "current-sj-hash"
    ]),
    catalogEntry("wegfan", "Aqua Shrine", "1.0.0", "Map", "https://celeste.weg.fan/api/v2/download/files/aqua", ["aqua-hash"]),
    catalogEntry("everestMirror", "SpeedrunTool", "3.18.2", "Mod", "https://gamebanana.com/mmdl/3333", ["speedrun-hash"])
  ];
}

function catalogEntry(
  source: ModCatalogSourceKind,
  name: string,
  version: string,
  gameBananaType: string,
  downloadUrl: string,
  xxHash: string[]
): ModCatalogEntry {
  return {
    source,
    id: `${source}-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    version,
    downloadUrl,
    pageUrl: `https://gamebanana.com/mods/mock-${encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"))}`,
    gameBananaType,
    gameBananaId: 1000,
    gameBananaFileId: 2000,
    size: 12_345_678,
    lastUpdate: 1770040000,
    xxHash
  };
}

function record(options: MockRecordOptions): ModRecord {
  const version = options.version ?? options.metadata?.version ?? "1.0.0";
  const subMaps = options.subMaps ?? [];
  return {
    id: options.id,
    name: options.name,
    fileName: options.fileName,
    relativePath: options.relativePath,
    absolutePath: `${mockCelestePath}\\${options.relativePath.split("/").join("\\")}`,
    isArchive: options.fileName.endsWith(".zip"),
    kind: options.kind,
    enabled: options.enabled ?? false,
    favorite: options.favorite ?? false,
    protected: options.protected ?? false,
    readOnly: options.readOnly ?? false,
    metadata: {
      name: options.metadata?.name ?? options.name,
      version: options.version ?? version,
      author: options.metadata?.author ?? "Mock Author",
      description: options.description ?? options.metadata?.description ?? "",
      dependencies: options.dependencies ?? [],
      optionalDependencies: options.optionalDependencies ?? []
    },
    mapIds: options.mapIds ?? subMaps.map((item) => item.sid),
    subMaps,
    mapCount: options.mapCount ?? (subMaps.length || 0),
    strawberryCount: options.strawberryCount ?? subMaps.reduce((total, item) => total + item.strawberryCount, 0),
    strawberryTotalCount: options.strawberryTotalCount ?? subMaps.reduce((total, item) => total + item.strawberryTotalCount, 0),
    completionStatus: options.completionStatus ?? (options.kind === "mod" && !subMaps.length ? "notApplicable" : "unknown"),
    dependencies: options.dependencies ?? [],
    optionalDependencies: options.optionalDependencies ?? [],
    stats: options.stats ?? null,
    warnings: options.warnings ?? []
  };
}

function subMap(
  id: string,
  sid: string,
  chapter: string,
  displayName: string,
  difficulty: string,
  strawberries: number,
  totalStrawberries: number,
  completionStatus: SubMapInfo["completionStatus"]
): SubMapInfo {
  return {
    id,
    sid,
    modeIndex: null,
    displayName,
    chapter,
    filePath: `Maps/${sid}.bin`,
    difficulty,
    strawberryCount: strawberries,
    strawberryTotalCount: totalStrawberries,
    completionStatus,
    stats:
      completionStatus === "notApplicable"
        ? null
        : stats(120 + strawberries * 8, strawberries, totalStrawberries, 4600, completionStatus === "completed", 0, 0)
  };
}

function stats(
  deaths: number,
  strawberries: number,
  total: number,
  timePlayed: number,
  completed: boolean,
  cassettes: number,
  hearts: number
): MapStats {
  return {
    deaths,
    strawberries,
    strawberriesKnown: total >= strawberries,
    timePlayed,
    completed,
    completionKnown: true,
    cassettes,
    hearts,
    saveFiles: selectedSaveFiles
  };
}

function profile(
  id: string,
  name: string,
  profileType: Profile["profileType"],
  enabledMapIds: string[] | null,
  enabledModIds: string[] | null,
  launchArgs: string
): Profile {
  return {
    id,
    name,
    profileType,
    enabledMapIds,
    enabledModIds,
    launchArgs,
    createdAt: "1770030000000000000",
    updatedAt: "1770040000000000000"
  };
}

function backup(id: string, kind: BackupInfo["kind"], backupPath: string, celesteExeExisted: boolean, dllExisted: boolean): BackupInfo {
  return {
    id,
    createdAt: id,
    kind,
    celestePath: mockCelestePath,
    backupPath,
    files: [
      fileEntry("state", "应用状态", `${mockCelestePath}\\.celepkg\\state.json`, `${backupPath}\\state.json`, true),
      fileEntry("state", "扫描缓存", `${mockCelestePath}\\.celepkg\\scan-cache.json`, `${backupPath}\\scan-cache.json`, true),
      fileEntry("game", "Celeste.exe", `${mockCelestePath}\\Celeste.exe`, `${backupPath}\\game\\Celeste.exe`, celesteExeExisted),
      fileEntry("game", "Celeste.dll", `${mockCelestePath}\\Celeste.dll`, `${backupPath}\\game\\Celeste.dll`, dllExisted)
    ]
  };
}

function fileEntry(category: "state" | "game", label: string, targetPath: string, backupPath: string, existed: boolean) {
  return { category, label, targetPath, backupPath, existed };
}

function createTimings() {
  return [
    { stage: "读取 Mod 文件", ms: 84 },
    { stage: "解析 metadata", ms: 31 },
    { stage: "读取存档统计", ms: 18 },
    { stage: "依赖检查", ms: 7 }
  ];
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
