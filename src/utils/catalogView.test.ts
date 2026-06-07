import { describe, expect, it } from "vitest";
import type { ModCatalogEntry } from "../types";
import { createDownloadTask } from "./downloadTask";
import {
  buildCatalogEntryViews,
  clampCatalogPage,
  filterCatalogEntryViews,
  paginateCatalogEntryViews,
  sortCatalogEntryViews,
  type CatalogFilters
} from "./catalogView";
import { buildPageItems } from "./pagination";
import { createModRecord } from "./testFixtures";

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

    const views = buildCatalogEntryViews([entry("Installed Helper"), queued], [createModRecord("Installed Helper")], task, "");

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
      [createModRecord("Installed Helper")],
      null,
      ""
    );

    expect(filterCatalogEntryViews(views, { ...allFilters, type: "maps" }).map((view) => view.entry.name)).toEqual(["Map Entry"]);
    expect(filterCatalogEntryViews(views, { ...allFilters, type: "tools" }).map((view) => view.entry.name)).toEqual(["Tool Entry"]);
    expect(filterCatalogEntryViews(views, { ...allFilters, source: "everestMirror" }).map((view) => view.entry.name)).toEqual([
      "Map Entry"
    ]);
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

  it("scores catalog relevance from categories and GameBanana ids", () => {
    const views = buildCatalogEntryViews(
      [
        entry("Plain Helper", { categoryName: "Helpers", gameBananaId: 100 }),
        entry("Map Pack", { categoryName: "Maps", gameBananaId: 4242 })
      ],
      [],
      null,
      "maps 4242"
    );

    expect(sortCatalogEntryViews(views, "relevance").map((view) => view.entry.name)).toEqual(["Map Pack", "Plain Helper"]);
    expect(views.find((view) => view.entry.name === "Map Pack")?.searchMatch.matched).toBe(true);
  });

  it("sorts by update time, name, and size", () => {
    const views = buildCatalogEntryViews(
      [entry("B", { lastUpdate: 1, size: 10 }), entry("A", { lastUpdate: 3, size: 30 }), entry("C", { lastUpdate: 2, size: 20 })],
      [],
      null,
      ""
    );

    expect(sortCatalogEntryViews(views, "updatedDesc").map((view) => view.entry.name)).toEqual(["A", "C", "B"]);
    expect(sortCatalogEntryViews(views, "nameAsc").map((view) => view.entry.name)).toEqual(["A", "B", "C"]);
    expect(sortCatalogEntryViews(views, "sizeDesc").map((view) => view.entry.name)).toEqual(["A", "C", "B"]);
  });

  it("paginates catalog results after filtering and sorting", () => {
    const items = Array.from({ length: 101 }, (_, index) => index + 1);

    const firstPage = paginateCatalogEntryViews(items, 1);
    const secondPage = paginateCatalogEntryViews(items, 2);
    const thirdPage = paginateCatalogEntryViews(items, 3);

    expect(firstPage.pageCount).toBe(3);
    expect(firstPage.items).toHaveLength(50);
    expect(firstPage.start).toBe(1);
    expect(firstPage.end).toBe(50);
    expect(secondPage.items).toEqual(Array.from({ length: 50 }, (_, index) => index + 51));
    expect(secondPage.start).toBe(51);
    expect(secondPage.end).toBe(100);
    expect(thirdPage.items).toEqual([101]);
    expect(thirdPage.start).toBe(101);
    expect(thirdPage.end).toBe(101);
  });

  it("clamps catalog page when filtered results shrink", () => {
    const items = Array.from({ length: 35 }, (_, index) => index + 1);

    expect(clampCatalogPage(5, items.length, 10)).toBe(4);
    expect(paginateCatalogEntryViews(items, 5, 10)).toMatchObject({
      page: 4,
      pageCount: 4,
      start: 31,
      end: 35
    });
    expect(paginateCatalogEntryViews([], 8)).toMatchObject({
      page: 1,
      pageCount: 1,
      start: 0,
      end: 0,
      items: []
    });
  });

  it("builds compact catalog page numbers around the current page", () => {
    expect(buildPageItems(10, 20, 3)).toEqual([1, "ellipsis", 7, 8, 9, 10, 11, 12, 13, "ellipsis", 20]);
    expect(buildPageItems(2, 20, 3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, "ellipsis", 20]);
    expect(buildPageItems(19, 20, 3)).toEqual([1, "ellipsis", 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("avoids unnecessary ellipses for catalog page number boundaries", () => {
    expect(buildPageItems(5, 8, 3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(buildPageItems(1, 1, 3)).toEqual([1]);
    expect(buildPageItems(99, 5, 3)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps catalog page number control length stable for every current page", () => {
    for (const pageCount of [12, 20, 100]) {
      const lengths = Array.from({ length: pageCount }, (_, index) => buildPageItems(index + 1, pageCount, 3).length);
      expect(new Set(lengths)).toEqual(new Set([11]));
    }

    for (const pageCount of [1, 2, 8, 11]) {
      const lengths = Array.from({ length: pageCount }, (_, index) => buildPageItems(index + 1, pageCount, 3).length);
      expect(new Set(lengths)).toEqual(new Set([pageCount]));
    }
  });

  it("pads compact page numbers at both edges instead of shrinking controls", () => {
    expect(buildPageItems(1, 12, 3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, "ellipsis", 12]);
    expect(buildPageItems(6, 12, 3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, "ellipsis", 12]);
    expect(buildPageItems(7, 12, 3)).toEqual([1, "ellipsis", 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(buildPageItems(12, 12, 3)).toEqual([1, "ellipsis", 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("keeps compact page numbers stable with a zero radius", () => {
    expect(buildPageItems(1, 20, 0)).toEqual([1, 2, 3, "ellipsis", 20]);
    expect(buildPageItems(10, 20, 0)).toEqual([1, "ellipsis", 10, "ellipsis", 20]);
    expect(buildPageItems(20, 20, 0)).toEqual([1, "ellipsis", 18, 19, 20]);

    const lengths = Array.from({ length: 20 }, (_, index) => buildPageItems(index + 1, 20, 0).length);
    expect(new Set(lengths)).toEqual(new Set([5]));
  });
});
