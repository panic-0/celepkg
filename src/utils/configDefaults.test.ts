import { describe, expect, it } from "vitest";
import {
  activeModCatalogSources,
  DEFAULT_AUTO_BACKUP_CLEANUP_ENABLED,
  DEFAULT_AUTO_BACKUP_ENABLED,
  DEFAULT_AUTO_BACKUP_RETENTION_COUNT,
  DEFAULT_AUTO_CHECK_APP_UPDATES_ON_STARTUP,
  DEFAULT_AUTO_CHECK_MOD_UPDATES_ON_STARTUP,
  DEFAULT_AUTO_REFRESH_MOD_CATALOG_CACHE_ON_STARTUP,
  DEFAULT_MOD_CATALOG_SOURCE_ENABLED_COUNT,
  DEFAULT_MOD_CATALOG_SOURCE_ORDER,
  DEFAULT_SELECTED_SAVE_FILES,
  normalizeModCatalogSourceOrder,
  normalizeModCatalogSourceSettings
} from "./configDefaults";
import type { ModCatalogSourceKind } from "../types";

describe("config defaults", () => {
  it("keeps frontend fallback defaults aligned with app defaults", () => {
    expect(DEFAULT_AUTO_BACKUP_ENABLED).toBe(true);
    expect(DEFAULT_AUTO_BACKUP_CLEANUP_ENABLED).toBe(true);
    expect(DEFAULT_AUTO_BACKUP_RETENTION_COUNT).toBe(20);
    expect(DEFAULT_AUTO_CHECK_MOD_UPDATES_ON_STARTUP).toBe(true);
    expect(DEFAULT_AUTO_CHECK_APP_UPDATES_ON_STARTUP).toBe(true);
    expect(DEFAULT_AUTO_REFRESH_MOD_CATALOG_CACHE_ON_STARTUP).toBe(true);
    expect(DEFAULT_SELECTED_SAVE_FILES).toEqual(["0.celeste"]);
    expect(DEFAULT_MOD_CATALOG_SOURCE_ORDER).toEqual(["wegfan", "everestMirror", "everest"]);
    expect(DEFAULT_MOD_CATALOG_SOURCE_ENABLED_COUNT).toBe(2);
  });

  it("normalizes source order by removing duplicates and appending missing sources", () => {
    expect(normalizeModCatalogSourceOrder(["everest", "everest", "wegfan"])).toEqual(["everest", "wegfan", "everestMirror"]);
  });

  it("normalizes source settings and clamps enabled count", () => {
    const settings = normalizeModCatalogSourceSettings(["everestMirror"], 99);
    expect(settings).toEqual({
      order: ["everestMirror", "wegfan", "everest"],
      enabledCount: 3
    });

    const withInvalidCount = normalizeModCatalogSourceSettings(["wegfan"], Number.NaN);
    expect(withInvalidCount.enabledCount).toBe(DEFAULT_MOD_CATALOG_SOURCE_ENABLED_COUNT);
  });

  it("returns the enabled source prefix from normalized settings", () => {
    const sources = activeModCatalogSources(["everestMirror", "wegfan", "everest"], 2);
    expect(sources).toEqual(["everestMirror", "wegfan"]);
  });

  it("ignores values outside known source kinds at runtime", () => {
    const order = ["unknown", "wegfan"] as ModCatalogSourceKind[];
    expect(normalizeModCatalogSourceOrder(order)).toEqual(["wegfan", "everestMirror", "everest"]);
  });
});
