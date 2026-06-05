export const DEFAULT_PAGE_SIZE = 100;
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
  const pages = new Set<number>([1, safePageCount]);
  const start = Math.max(1, currentPage - safeRadius);
  const end = Math.min(safePageCount, currentPage + safeRadius);

  for (let item = start; item <= end; item += 1) {
    pages.add(item);
  }

  const sortedPages = [...pages].sort((left, right) => left - right);
  const items: PageItem[] = [];
  for (const item of sortedPages) {
    const previous = typeof items[items.length - 1] === "number" ? (items[items.length - 1] as number) : null;
    if (previous !== null && item - previous > 1) {
      items.push(item - previous === 2 ? previous + 1 : "ellipsis");
    }
    items.push(item);
  }
  return items;
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
