import { describe, expect, it } from "vitest";
import type { ModRecord } from "../types";
import { buildModAliasMap, normalizeDependencyName } from "./dependencies";

describe("normalizeDependencyName", () => {
  it("normalizes zip suffixes, separators, whitespace, and case", () => {
    expect(normalizeDependencyName("  Some_Mod-Name.ZIP  ")).toBe("some mod name");
  });

  it("keeps nested folder names comparable across path separators", () => {
    expect(normalizeDependencyName("Mods\\Helper Pack")).toBe("mods/helper pack");
  });

  it("returns an empty alias for whitespace-only values", () => {
    expect(normalizeDependencyName(" \t\n ")).toBe("");
  });
});

describe("buildModAliasMap", () => {
  it("indexes common mod aliases with the shared normalization rule", () => {
    const mod = {
      id: "helper-one",
      name: "Helper One",
      fileName: "Helper_One.ZIP",
      relativePath: "Mods\\Helper_One.ZIP",
      metadata: { name: "Helper-One" }
    } as ModRecord;

    const aliases = buildModAliasMap([mod]);

    expect(aliases.get("helper one")).toBe("helper-one");
    expect(aliases.get("mods/helper one")).toBe("helper-one");
  });
});
