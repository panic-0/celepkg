import type { MapStats, ModRecord, Profile, ProfilesState, ScanResult, SubMapInfo } from "../types";

type MockRecordOptions = Partial<ModRecord> &
  Pick<ModRecord, "id" | "name" | "fileName" | "relativePath" | "kind"> & {
    description?: string;
    version?: string;
  };

export const mockCelestePath = "D:\\Games\\Celeste";
let fixtureProfiles: ProfilesState;
let fixtureSelectedSaveFiles: string[] = [];

export function createMockScan(profiles: ProfilesState, selectedSaveFiles: string[]): ScanResult {
  fixtureProfiles = profiles;
  fixtureSelectedSaveFiles = selectedSaveFiles;
  return createMockScanState();
}
function createMockScanState(): ScanResult {
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
    }),
    ...createMockBulkMaps()
  ];
  const otherMods = [
    record({
      id: "builtin-everest",
      name: "Everest",
      fileName: "Everest",
      relativePath: "Celeste/Everest",
      kind: "mod",
      enabled: true,
      readOnly: true,
      protected: true,
      description: "Celeste 的 Mod 加载器，安装在游戏根目录。",
      version: "1.4980.0"
    }),
    record({
      id: "builtin-everest-core",
      name: "EverestCore",
      fileName: "EverestCore",
      relativePath: "Celeste/EverestCore",
      kind: "mod",
      enabled: true,
      readOnly: true,
      protected: true,
      description: "Everest 内置核心依赖，由 Everest 安装器维护。",
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
    }),
    ...createMockDependencyTreeMods(),
    ...createMockBulkMods()
  ];
  return {
    celestePath: mockCelestePath,
    modsPath: `${mockCelestePath}\\Mods`,
    blacklistPath: `${mockCelestePath}\\Mods\\blacklist.txt`,
    blacklistEntries: ["Galactica.zip", "ChinaMirror.zip", "JungleHelper.zip", "SpeedrunTool.zip"],
    gameExecutable: `${mockCelestePath}\\Celeste.exe`,
    maps,
    otherMods,
    profiles: fixtureProfiles,
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
    selectedSaveFiles: fixtureSelectedSaveFiles,
    warnings: ["内置依赖版本无法确认：FNA 22.8.0，无法判断本地版本"],
    timings: createTimings()
  };
}

function createMockBulkMaps(): ModRecord[] {
  return Array.from({ length: 596 }, (_, index) => {
    const number = index + 1;
    const id = `mock-map-${number.toString().padStart(3, "0")}`;
    const strawberries = number % 12;
    const totalStrawberries = 12 + (number % 18);
    const completed = number % 5 === 0;
    return record({
      id,
      name: `Mock Map Pack ${number.toString().padStart(3, "0")}`,
      fileName: `MockMapPack${number.toString().padStart(3, "0")}.zip`,
      relativePath: `Mods/MockMapPack${number.toString().padStart(3, "0")}.zip`,
      kind: "map",
      enabled: number % 4 !== 0,
      favorite: number % 13 === 0,
      description: "Mock 批量地图，用于检查本地内容分页。",
      version: `0.${number}.0`,
      mapCount: 1 + (number % 6),
      strawberryCount: totalStrawberries,
      strawberryTotalCount: totalStrawberries + 6,
      completionStatus: completed ? "completed" : number % 3 === 0 ? "unfinished" : "unknown",
      stats: stats(40 + number * 3, strawberries, totalStrawberries, 3200 + number * 90, completed, number % 2, number % 4),
      subMaps: [
        subMap(
          `${id}-sub-1`,
          `MockMapPack${number.toString().padStart(3, "0")}/Main`,
          `Mock Map Pack ${number.toString().padStart(3, "0")}`,
          "Main",
          number % 3 === 0 ? "advanced" : number % 3 === 1 ? "intermediate" : "expert",
          strawberries,
          totalStrawberries,
          completed ? "completed" : "unfinished"
        )
      ]
    });
  });
}

function createMockBulkMods(): ModRecord[] {
  return Array.from({ length: 593 }, (_, index) => {
    const number = index + 1;
    const padded = number.toString().padStart(3, "0");
    return record({
      id: `mock-helper-${padded}`,
      name: `Mock Helper ${padded}`,
      fileName: `MockHelper${padded}.zip`,
      relativePath: `Mods/MockHelper${padded}.zip`,
      kind: "mod",
      enabled: number % 3 !== 0,
      favorite: number % 17 === 0,
      description: "Mock 批量 Mod，用于检查本地内容分页。",
      version: `1.${number}.0`,
      dependencies: number % 4 === 0 ? [{ name: "EverestCore", version: "1.4980.0" }] : [],
      warnings: number % 19 === 0 ? ["Mock：用于检查警告筛选和分页。"] : [],
      subMaps:
        number % 7 === 0
          ? [
              subMap(
                `mock-helper-${padded}-test`,
                `MockHelper${padded}/Test`,
                `Mock Helper ${padded}`,
                "Test",
                "test",
                0,
                0,
                "notApplicable"
              )
            ]
          : []
    });
  });
}

function createMockDependencyTreeMods(): ModRecord[] {
  return [
    record({
      id: "mock-dependency-tree-root",
      name: "Mock Dependency Tree Root",
      fileName: "MockDependencyTreeRoot.zip",
      relativePath: "Mods/MockDependencyTreeRoot.zip",
      kind: "mod",
      enabled: true,
      favorite: true,
      description: "用于在 mock 本地列表中检查依赖树：已满足、版本不足、缺失、可选、Everest 和循环依赖。",
      version: "1.0.0",
      dependencies: [
        { name: "Mock Dependency Tree Helper", version: "1.0.0" },
        { name: "Mock Dependency Tree Outdated", version: "2.0.0" },
        { name: "Mock Dependency Tree Missing", version: "1.0.0" },
        { name: "EverestCore", version: "1.4980.0" }
      ],
      optionalDependencies: [
        { name: "Mock Dependency Tree Optional", version: "1.0.0" },
        { name: "Mock Dependency Tree Cycle A", version: "1.0.0" }
      ],
      warnings: ["Mock：Mock Dependency Tree Outdated 版本不足，需要 2.0.0，本地 1.0.0", "Mock：缺少 Mock Dependency Tree Missing 1.0.0"]
    }),
    record({
      id: "mock-dependency-tree-helper",
      name: "Mock Dependency Tree Helper",
      fileName: "MockDependencyTreeHelper.zip",
      relativePath: "Mods/MockDependencyTreeHelper.zip",
      kind: "mod",
      enabled: true,
      description: "依赖树演示用 Helper，继续依赖一个叶子 Mod。",
      version: "1.0.0",
      dependencies: [{ name: "Mock Dependency Tree Leaf", version: "1.0.0" }]
    }),
    record({
      id: "mock-dependency-tree-leaf",
      name: "Mock Dependency Tree Leaf",
      fileName: "MockDependencyTreeLeaf.zip",
      relativePath: "Mods/MockDependencyTreeLeaf.zip",
      kind: "mod",
      enabled: true,
      description: "依赖树演示用叶子 Mod。",
      version: "1.0.0"
    }),
    record({
      id: "mock-dependency-tree-outdated",
      name: "Mock Dependency Tree Outdated",
      fileName: "MockDependencyTreeOutdated.zip",
      relativePath: "Mods/MockDependencyTreeOutdated.zip",
      kind: "mod",
      enabled: true,
      description: "依赖树演示用旧版本 Mod，Root 会要求 2.0.0。",
      version: "1.0.0"
    }),
    record({
      id: "mock-dependency-tree-optional",
      name: "Mock Dependency Tree Optional",
      fileName: "MockDependencyTreeOptional.zip",
      relativePath: "Mods/MockDependencyTreeOptional.zip",
      kind: "mod",
      enabled: false,
      description: "依赖树演示用可选依赖。",
      version: "1.0.0",
      dependencies: [{ name: "Mock Dependency Tree Leaf", version: "1.0.0" }]
    }),
    record({
      id: "mock-dependency-tree-cycle-a",
      name: "Mock Dependency Tree Cycle A",
      fileName: "MockDependencyTreeCycleA.zip",
      relativePath: "Mods/MockDependencyTreeCycleA.zip",
      kind: "mod",
      enabled: false,
      description: "依赖树演示用循环依赖 A。",
      version: "1.0.0",
      dependencies: [{ name: "Mock Dependency Tree Cycle B", version: "1.0.0" }]
    }),
    record({
      id: "mock-dependency-tree-cycle-b",
      name: "Mock Dependency Tree Cycle B",
      fileName: "MockDependencyTreeCycleB.zip",
      relativePath: "Mods/MockDependencyTreeCycleB.zip",
      kind: "mod",
      enabled: false,
      description: "依赖树演示用循环依赖 B。",
      version: "1.0.0",
      dependencies: [{ name: "Mock Dependency Tree Cycle A", version: "1.0.0" }]
    })
  ];
}

export function record(options: MockRecordOptions): ModRecord {
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
    totalStrawberries: strawberries,
    staleStrawberries: 0,
    strawberriesKnown: total >= strawberries,
    timePlayed,
    completed,
    completionKnown: true,
    cassettes,
    hearts,
    saveFiles: fixtureSelectedSaveFiles
  };
}

export function profile(
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

export function createTimings() {
  return [
    { stage: "读取 Mod 文件", ms: 84 },
    { stage: "解析 metadata", ms: 31 },
    { stage: "读取存档统计", ms: 18 },
    { stage: "依赖检查", ms: 7 }
  ];
}
