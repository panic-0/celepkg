import { describe, expect, it } from "vitest";
import { dependenciesIncludeEverest, isEverestDependencyName } from "./everestDependency";

describe("everest dependency helpers", () => {
  it("recognizes Everest dependency name variants", () => {
    expect(isEverestDependencyName("Everest")).toBe(true);
    expect(isEverestDependencyName("EverestCore")).toBe(true);
    expect(isEverestDependencyName("Everest 1.5577.0")).toBe(true);
    expect(isEverestDependencyName("Communal Helper")).toBe(false);
  });

  it("detects Everest in dependency lists", () => {
    expect(dependenciesIncludeEverest([{ name: "Everest", version: "1.5577.0" }])).toBe(true);
    expect(dependenciesIncludeEverest([{ name: "Helper", version: "1.0.0" }])).toBe(false);
  });
});
