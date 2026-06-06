import type { EverestRelease, ModCatalogEntry, ModCatalogSourceKind, ModMetadata } from "./types";

export function createMockCatalog(): ModCatalogEntry[] {
  return [
    catalogEntry("everestMirror", "CommunalHelper", "1.24.3", "Mod", "https://gamebanana.com/mmdl/1111", ["new-communal-hash"], "Helpers"),
    catalogEntry(
      "everestMirror",
      "Galactica",
      "2.1.0",
      "Mod",
      "https://gamebanana.com/mmdl/2222",
      ["new-galactica-hash"],
      "Maps",
      "Campaign"
    ),
    catalogEntry(
      "wegfan",
      "Strawberry Jam Collab",
      "1.2.9",
      "Mod",
      "https://celeste.weg.fan/api/v2/download/files/sj",
      ["current-sj-hash"],
      "Maps",
      "Campaign"
    ),
    catalogEntry(
      "everestMirror",
      "Everest Gate",
      "1.0.0",
      "Mod",
      "https://gamebanana.com/mmdl/4444",
      ["everest-gate-hash"],
      "Maps",
      "Standalone"
    ),
    catalogEntry(
      "wegfan",
      "Aqua Shrine",
      "1.0.0",
      "Mod",
      "https://celeste.weg.fan/api/v2/download/files/aqua",
      ["aqua-hash"],
      "Maps",
      "Standalone"
    ),
    catalogEntry("everestMirror", "SpeedrunTool", "3.18.2", "Mod", "https://gamebanana.com/mmdl/3333", ["speedrun-hash"], "Tools"),
    catalogEntry(
      "wegfan",
      "Loading time optimizer",
      "0.1.0",
      "Mod",
      "https://celeste.weg.fan/api/v2/download/files/loading",
      ["loading-hash"],
      "Other/Misc"
    ),
    catalogEntry(
      "everestMirror",
      "Mock Dependency Tree Root",
      "1.1.0",
      "Mod",
      "https://gamebanana.com/mmdl/5555",
      ["mock-dependency-tree-root-new-hash"],
      "Helpers"
    ),
    catalogEntry(
      "everestMirror",
      "Mock Dependency Tree Outdated",
      "2.0.0",
      "Mod",
      "https://gamebanana.com/mmdl/5556",
      ["mock-dependency-tree-outdated-new-hash"],
      "Helpers"
    ),
    catalogEntry(
      "everestMirror",
      "Mock Dependency Tree Missing",
      "1.0.0",
      "Mod",
      "https://gamebanana.com/mmdl/5557",
      ["mock-dependency-tree-missing-hash"],
      "Helpers"
    ),
    ...createMockBulkCatalogEntries()
  ];
}

export function createMockEverestReleases(): EverestRelease[] {
  return [
    everestRelease("stable", 4980, "2026-05-21T18:15:00Z", "2f0a7cdb95ef", 43_600_000),
    everestRelease("stable", 4970, "2026-03-08T10:20:00Z", "714c9f30254a", 42_900_000),
    everestRelease("beta", 5011, "2026-05-30T09:42:00Z", "90bb31d6c4aa", 44_200_000),
    everestRelease("beta", 5004, "2026-05-18T14:10:00Z", "aa72cc19334e", 44_000_000),
    everestRelease("dev", 5033, "2026-06-02T22:05:00Z", "d7c92f4b11d0", 45_100_000),
    everestRelease("dev", 5027, "2026-06-01T21:34:00Z", "6f1d0a77be6a", 45_000_000)
  ];
}

export function mockUpdateMetadata(entry: ModCatalogEntry): ModMetadata {
  if (entry.name === "Galactica") {
    return {
      name: entry.name,
      version: entry.version,
      author: "Mock Author",
      description: "",
      dependencies: [{ name: "CommunalHelper", version: "1.24.0" }],
      optionalDependencies: [{ name: "SpeedrunTool", version: "3.19.0" }]
    };
  }
  if (entry.name === "Everest Gate") {
    return {
      name: entry.name,
      version: entry.version,
      author: "Mock Author",
      description: "",
      dependencies: [
        { name: "EverestCore", version: "1.5033.0" },
        { name: "CommunalHelper", version: "1.24.0" }
      ],
      optionalDependencies: []
    };
  }
  if (entry.name === "Mock Dependency Tree Root") {
    return {
      name: entry.name,
      version: entry.version,
      author: "Mock Author",
      description: "",
      dependencies: [
        { name: "Mock Dependency Tree Helper", version: "1.0.0" },
        { name: "Mock Dependency Tree Outdated", version: "2.0.0" },
        { name: "Mock Dependency Tree Missing", version: "1.0.0" },
        { name: "EverestCore", version: "1.4980.0" }
      ],
      optionalDependencies: [
        { name: "Mock Dependency Tree Optional", version: "1.0.0" },
        { name: "Mock Dependency Tree Cycle A", version: "1.0.0" }
      ]
    };
  }
  return {
    name: entry.name,
    version: entry.version,
    author: "Mock Author",
    description: "",
    dependencies: [],
    optionalDependencies: []
  };
}

function createMockBulkCatalogEntries(): ModCatalogEntry[] {
  return Array.from({ length: 635 }, (_, index) => {
    const number = index + 1;
    const source: ModCatalogSourceKind = number % 2 ? "wegfan" : "everestMirror";
    const type = number % 3 === 0 ? "Tools" : number % 3 === 1 ? "Maps" : "Helpers";
    return catalogEntry(
      source,
      `Mock Catalog Result ${number.toString().padStart(3, "0")}`,
      `0.${number}.0`,
      "Mod",
      `https://example.invalid/mock-catalog/${number}`,
      [`mock-catalog-hash-${number}`],
      type,
      type === "Maps" ? "Standalone" : ""
    );
  });
}

function everestRelease(branch: string, version: number, date: string, commit: string, size: number): EverestRelease {
  return {
    branch,
    version,
    date,
    commit,
    mainFileSize: size,
    mainDownload: `https://example.invalid/everest/${branch}/${version}.zip`,
    mirrorDownload: `https://celeste.weg.fan/api/v2/download/everest/${version}`,
    isNative: true
  };
}

export function catalogEntry(
  source: ModCatalogSourceKind,
  name: string,
  version: string,
  gameBananaType: string,
  downloadUrl: string,
  xxHash: string[],
  categoryName = gameBananaType,
  subCategoryName = ""
): ModCatalogEntry {
  return {
    source,
    id: `${source}-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    version,
    downloadUrl,
    pageUrl: `https://gamebanana.com/mods/mock-${encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"))}`,
    gameBananaType,
    categoryName,
    subCategoryName,
    gameBananaId: 1000,
    gameBananaFileId: 2000,
    size: 12_345_678,
    lastUpdate: 1770040000,
    xxHash
  };
}
