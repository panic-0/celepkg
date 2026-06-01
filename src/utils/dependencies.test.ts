import { describe, expect, it } from "vitest";
import { normalizeDependencyName } from "./dependencies";

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
