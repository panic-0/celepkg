import type { ModCatalogEntry, ModRecord } from "../types";
import type { DownloadTask, DownloadTaskItem } from "./downloadTask";
import { buildInstalledCatalogAliasSet, isCatalogEntryInstalled, normalizeDependencyName } from "./dependencies";
import { DEFAULT_PAGE_SIZE, clampPage, paginateItems, type Page } from "./pagination";
import { createSearchMatcher, matchSearchFields, type SearchField, type SearchMatch } from "./search";

export type CatalogTypeFilter = "all" | string;
export type CatalogSourceFilter = "all" | ModCatalogEntry["source"];
export type CatalogInstallFilter = "all" | "installed" | "notInstalled";
export type CatalogSortKey = "relevance" | "updatedDesc" | "nameAsc" | "sizeDesc";

export const CATALOG_PAGE_SIZE = DEFAULT_PAGE_SIZE;

export type CatalogFilters = {
  type: CatalogTypeFilter;
  source: CatalogSourceFilter;
  install: CatalogInstallFilter;
  downloadableOnly: boolean;
};

export type CatalogEntryState = "notInstalled" | "installed" | "queued" | "downloading" | "waitingInstall" | "installing" | "failed";

export type CatalogEntryView = {
  entry: ModCatalogEntry;
  state: CatalogEntryState;
  installed: boolean;
  queued: boolean;
  failed: boolean;
  downloadable: boolean;
  taskItem: DownloadTaskItem | null;
  type: string;
  typeLabel: string;
  searchMatch: SearchMatch;
  relevance: number;
  originalIndex: number;
};

export type CatalogPage<T> = Page<T>;

export function buildCatalogEntryViews(
  entries: ModCatalogEntry[],
  records: ModRecord[],
  task: DownloadTask | null,
  query: string
): CatalogEntryView[] {
  const installedAliases = buildInstalledCatalogAliasSet(records);
  const searchMatcher = createSearchMatcher(query);
  return entries.map((entry, originalIndex) => {
    const taskItem = findTaskItemForEntry(entry, task);
    const state = catalogEntryState(entry, installedAliases, taskItem);
    const searchMatch = matchSearchFields(searchFieldsForCatalogEntry(entry), searchMatcher);
    return {
      entry,
      state,
      installed: state === "installed",
      queued: ["queued", "downloading", "waitingInstall", "installing"].includes(state),
      failed: state === "failed",
      downloadable: entry.downloadUrl.trim().length > 0,
      taskItem,
      type: catalogEntryTypeKey(entry),
      typeLabel: catalogEntryTypeLabel(entry),
      searchMatch,
      relevance: searchMatch.score,
      originalIndex
    };
  });
}

export function clampCatalogPage(page: number, totalItems: number, pageSize = CATALOG_PAGE_SIZE) {
  return clampPage(page, totalItems, pageSize);
}

export function paginateCatalogEntryViews<T>(views: T[], page: number, pageSize = CATALOG_PAGE_SIZE): CatalogPage<T> {
  return paginateItems(views, page, pageSize);
}

export function filterCatalogEntryViews(views: CatalogEntryView[], filters: CatalogFilters) {
  return views.filter((view) => {
    if (filters.type !== "all" && view.type !== filters.type) return false;
    if (filters.source !== "all" && view.entry.source !== filters.source) return false;
    if (filters.downloadableOnly && !view.downloadable) return false;
    if (filters.install === "notInstalled" && view.installed) return false;
    if (filters.install === "installed" && !view.installed) return false;
    return true;
  });
}

export function sortCatalogEntryViews(views: CatalogEntryView[], sortKey: CatalogSortKey) {
  return [...views].sort((left, right) => {
    if (sortKey === "updatedDesc") {
      return (right.entry.lastUpdate ?? 0) - (left.entry.lastUpdate ?? 0) || compareByOriginalIndex(left, right);
    }
    if (sortKey === "nameAsc") {
      return left.entry.name.localeCompare(right.entry.name, "zh-Hans-CN", { sensitivity: "base" }) || compareByOriginalIndex(left, right);
    }
    if (sortKey === "sizeDesc") {
      return (right.entry.size ?? 0) - (left.entry.size ?? 0) || compareByOriginalIndex(left, right);
    }
    return right.relevance - left.relevance || compareByOriginalIndex(left, right);
  });
}

export function catalogEntryTypeKey(entry: ModCatalogEntry): string {
  return normalizeCatalogType(catalogEntryTypeLabel(entry));
}

export function catalogEntryTypeLabel(entry: ModCatalogEntry): string {
  return entry.categoryName.trim() || entry.gameBananaType.trim() || "Mod";
}

export function normalizeCatalogType(value: string) {
  return normalizeDependencyName(value) || "mod";
}

export function catalogEntryRelevance(entry: ModCatalogEntry, query: string) {
  return matchSearchFields(searchFieldsForCatalogEntry(entry), createSearchMatcher(query)).score;
}

function catalogEntryState(entry: ModCatalogEntry, installedAliases: Set<string>, taskItem: DownloadTaskItem | null): CatalogEntryState {
  if (taskItem) {
    if (taskItem.status === "queued") return "queued";
    if (taskItem.status === "downloading") return "downloading";
    if (taskItem.status === "downloaded" || taskItem.status === "waitingInstall") return "waitingInstall";
    if (taskItem.status === "installing") return "installing";
    if (
      taskItem.status === "downloadFailed" ||
      taskItem.status === "installFailed" ||
      taskItem.status === "cancelled" ||
      taskItem.status === "skipped"
    ) {
      return "failed";
    }
  }
  if (isCatalogEntryInstalled(entry.name, installedAliases)) return "installed";
  return "notInstalled";
}

function findTaskItemForEntry(entry: ModCatalogEntry, task: DownloadTask | null) {
  if (!task) return null;
  const catalogTaskId = `mod-install:${entry.source}:${entry.id || entry.downloadUrl || entry.name}`;
  const normalizedName = normalizeDependencyName(entry.name);
  return (
    task.items.find((item) => item.id === catalogTaskId) ??
    task.items.find((item) => item.kind === "mod" && normalizeDependencyName(item.name) === normalizedName) ??
    null
  );
}

function compareByOriginalIndex(left: CatalogEntryView, right: CatalogEntryView) {
  return left.originalIndex - right.originalIndex;
}

function searchFieldsForCatalogEntry(entry: ModCatalogEntry): SearchField[] {
  return [
    { key: "name", text: entry.name, weight: 12 },
    { key: "version", text: entry.version, weight: 6 },
    { key: "type", text: entry.gameBananaType, weight: 5 },
    { key: "type", text: entry.categoryName, weight: 6 },
    { key: "type", text: entry.subCategoryName, weight: 5 },
    { key: "pageUrl", text: entry.pageUrl, weight: 2 },
    { key: "downloadUrl", text: entry.downloadUrl, weight: 2 },
    { key: "gameBananaId", text: entry.gameBananaId?.toString() ?? "", weight: 4 },
    { key: "gameBananaFileId", text: entry.gameBananaFileId?.toString() ?? "", weight: 4 }
  ];
}
