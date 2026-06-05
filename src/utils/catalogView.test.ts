import { describe, expect, it } from "vitest";
import type { ModCatalogEntry, ModRecord } from "../types";
import { createDownloadTask } from "./downloadTask";
import { buildCatalogEntryViews, filterCatalogEntryViews, sortCatalogEntryViews, type CatalogFilters } from "./catalogView";

function entry(name: string, partial: Partial<ModCatalogEntry> = {}): ModCatalogEntry {
  return {
    source: "wegfan",
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    version: "1.0.0",
    downloadUrl: `https://example.test/${name}.zip`,
    pageUrl: `https://gamebanana.com/mods/${name}`,
    gameBananaType: "Mod",
    categoryName: "Mod",
    subCategoryName: "",
    gameBananaId: 10,
    gameBananaFileId: 20,
    size: 100,
    lastUpdate: 1000,
    xxHash: [],
    ...partial
  };
}

function record(name: string): ModRecord {
  return {
    id: name.toLowerCase(),
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
    metadata: { name, version: "1.0.0", author: "", description: "", dependencies: [], optionalDependencies: [] },
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

const allFilters: CatalogFilters = {
  type: "all",
  source: "all",
  install: "all",
  downloadableOnly: false
};

describe("catalog view model", () => {
  it("maps installed and queued entries into display states", () => {
    const queued = entry("Queued Helper");
    const task = createDownloadTask("task", [
      {
        id: `mod-install:${queued.source}:${queued.id}`,
        name: queued.name,
        kind: "mod",
        status: "downloading"
      }
    ]);

    const views = buildCatalogEntryViews([entry("Installed Helper"), queued], [record("Installed Helper")], task, "");

    expect(views.map((view) => [view.entry.name, view.state])).toEqual([
      ["Installed Helper", "installed"],
      ["Queued Helper", "downloading"]
    ]);
  });

  it("filters by catalog type, source, install state, and downloadable status", () => {
    const views = buildCatalogEntryViews(
      [
        entry("Map Entry", { gameBananaType: "Mod", categoryName: "Maps", subCategoryName: "Standalone", source: "everestMirror" }),
        entry("Tool Entry", { categoryName: "Tools" }),
        entry("Installed Helper"),
        entry("Missing Link", { downloadUrl: "" })
      ],
      [record("Installed Helper")],
      null,
      ""
    );

    expect(filterCatalogEntryViews(views, { ...allFilters, type: "maps" }).map((view) => view.entry.name)).toEqual(["Map Entry"]);
    expect(filterCatalogEntryViews(views, { ...allFilters, type: "tools" }).map((view) => view.entry.name)).toEqual(["Tool Entry"]);
    expect(filterCatalogEntryViews(views, { ...allFilters, source: "everestMirror" }).map((view) => view.entry.name)).toEqual(["Map Entry"]);
    expect(filterCatalogEntryViews(views, { ...allFilters, install: "installed" }).map((view) => view.entry.name)).toEqual([
      "Installed Helper"
    ]);
    expect(filterCatalogEntryViews(views, { ...allFilters, install: "notInstalled" }).map((view) => view.entry.name)).toEqual([
      "Map Entry",
      "Tool Entry",
      "Missing Link"
    ]);
    expect(filterCatalogEntryViews(views, { ...allFilters, downloadableOnly: true }).map((view) => view.entry.name)).toEqual([
      "Map Entry",
      "Tool Entry",
      "Installed Helper"
    ]);
  });

  it("sorts by relevance before falling back to original order", () => {
    const views = buildCatalogEntryViews([entry("Other Helper"), entry("Communal Helper"), entry("Communal")], [], null, "Communal");

    expect(sortCatalogEntryViews(views, "relevance").map((view) => view.entry.name)).toEqual([
      "Communal",
      "Communal Helper",
      "Other Helper"
    ]);
  });

  it("sorts by update time, name, and size", () => {
    const views = buildCatalogEntryViews(
      [
        entry("B", { lastUpdate: 1, size: 10 }),
        entry("A", { lastUpdate: 3, size: 30 }),
        entry("C", { lastUpdate: 2, size: 20 })
      ],
      [],
      null,
      ""
    );

    expect(sortCatalogEntryViews(views, "updatedDesc").map((view) => view.entry.name)).toEqual(["A", "C", "B"]);
    expect(sortCatalogEntryViews(views, "nameAsc").map((view) => view.entry.name)).toEqual(["A", "B", "C"]);
    expect(sortCatalogEntryViews(views, "sizeDesc").map((view) => view.entry.name)).toEqual(["A", "C", "B"]);
  });
});
