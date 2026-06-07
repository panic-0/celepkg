import type { ModCatalogSourceKind } from "../types";

export const DEFAULT_AUTO_BACKUP_ENABLED = true;
export const DEFAULT_AUTO_BACKUP_CLEANUP_ENABLED = true;
export const DEFAULT_AUTO_BACKUP_RETENTION_COUNT = 20;
export const DEFAULT_AUTO_CHECK_MOD_UPDATES_ON_STARTUP = true;
export const DEFAULT_AUTO_CHECK_APP_UPDATES_ON_STARTUP = true;
export const DEFAULT_AUTO_REFRESH_MOD_CATALOG_CACHE_ON_STARTUP = true;
export const DEFAULT_SELECTED_SAVE_FILES = ["0.celeste"];
export const DEFAULT_MOD_CATALOG_SOURCE_ORDER: ModCatalogSourceKind[] = ["wegfan", "everestMirror", "everest"];
export const DEFAULT_MOD_CATALOG_SOURCE_ENABLED_COUNT = 2;

export function activeModCatalogSources(order: ModCatalogSourceKind[], enabledCount: number) {
  const normalizedOrder = normalizeModCatalogSourceOrder(order);
  return normalizedOrder.slice(0, normalizeModCatalogSourceEnabledCount(enabledCount, normalizedOrder.length));
}

export function normalizeModCatalogSourceSettings(order: ModCatalogSourceKind[], enabledCount: number) {
  const normalizedOrder = normalizeModCatalogSourceOrder(order);
  return {
    order: normalizedOrder,
    enabledCount: normalizeModCatalogSourceEnabledCount(enabledCount, normalizedOrder.length)
  };
}

export function normalizeModCatalogSourceOrder(order: ModCatalogSourceKind[]) {
  const seen = new Set<ModCatalogSourceKind>();
  const normalized = order.filter((source) => {
    if (!DEFAULT_MOD_CATALOG_SOURCE_ORDER.includes(source) || seen.has(source)) return false;
    seen.add(source);
    return true;
  });
  for (const source of DEFAULT_MOD_CATALOG_SOURCE_ORDER) {
    if (!seen.has(source)) normalized.push(source);
  }
  return normalized;
}

function normalizeModCatalogSourceEnabledCount(count: number, max: number) {
  const value = Number.isFinite(count) ? Math.trunc(count) : DEFAULT_MOD_CATALOG_SOURCE_ENABLED_COUNT;
  return Math.max(1, Math.min(value, max));
}
