export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_PAGE_RADIUS = 3;

export type Page<T> = {
  page: number;
  pageSize: number;
  pageCount: number;
  start: number;
  end: number;
  items: T[];
};

export type PageItem = number | "ellipsis";

export function clampPage(page: number, totalItems: number, pageSize = DEFAULT_PAGE_SIZE) {
  const safePageSize = normalizePageSize(pageSize);
  const safeTotal = Math.max(0, Math.trunc(totalItems));
  const pageCount = Math.max(1, Math.ceil(safeTotal / safePageSize));
  return clampPageNumber(page, pageCount);
}

export function paginateItems<T>(items: T[], page: number, pageSize = DEFAULT_PAGE_SIZE): Page<T> {
  const safePageSize = normalizePageSize(pageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const currentPage = clampPageNumber(page, pageCount);
  const startIndex = (currentPage - 1) * safePageSize;
  const pageItems = items.slice(startIndex, startIndex + safePageSize);
  return {
    page: currentPage,
    pageSize: safePageSize,
    pageCount,
    start: items.length ? startIndex + 1 : 0,
    end: items.length ? startIndex + pageItems.length : 0,
    items: pageItems
  };
}

export function buildPageItems(page: number, pageCount: number, radius = DEFAULT_PAGE_RADIUS): PageItem[] {
  const safePageCount = normalizePageCount(pageCount);
  const currentPage = clampPageNumber(page, safePageCount);
  const safeRadius = normalizePageRadius(radius);
  const maxItems = safeRadius * 2 + 5;

  if (safePageCount <= maxItems) {
    return pageRange(1, safePageCount);
  }

  const edgeWindowSize = maxItems - 2;
  if (currentPage - safeRadius <= 3) {
    return [...pageRange(1, edgeWindowSize), "ellipsis", safePageCount];
  }
  if (currentPage + safeRadius >= safePageCount - 2) {
    return [1, "ellipsis", ...pageRange(safePageCount - edgeWindowSize + 1, safePageCount)];
  }

  return [1, "ellipsis", ...pageRange(currentPage - safeRadius, currentPage + safeRadius), "ellipsis", safePageCount];
}

function normalizePageSize(pageSize: number) {
  if (!Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.trunc(pageSize));
}

function normalizePageCount(pageCount: number) {
  if (!Number.isFinite(pageCount)) return 1;
  return Math.max(1, Math.trunc(pageCount));
}

function normalizePageRadius(radius: number) {
  if (!Number.isFinite(radius)) return DEFAULT_PAGE_RADIUS;
  return Math.max(0, Math.trunc(radius));
}

function clampPageNumber(page: number, pageCount: number) {
  const safePage = Number.isFinite(page) ? Math.trunc(page) : 1;
  return Math.min(Math.max(1, safePage), pageCount);
}

function pageRange(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
