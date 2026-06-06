import { describe, expect, it } from "vitest";
import { createSearchMatcher, highlightTextParts, matchSearchFields, normalizeSearchText, rangesForField } from "./search";

describe("search utilities", () => {
  it("normalizes case, separators, paths, and zip suffixes", () => {
    expect(normalizeSearchText("Mods\\Some_Helper-v1.zip").text).toBe("mods some helper v1");
  });

  it("matches tokens across different fields", () => {
    const match = matchSearchFields(
      [
        { key: "name", text: "Strawberry Jam", weight: 10 },
        { key: "dependency", text: "CommunalHelper", weight: 4 }
      ],
      createSearchMatcher("jam communal")
    );

    expect(match.matched).toBe(true);
    expect(match.score).toBeGreaterThan(0);
    expect(rangesForField(match, "name")).toHaveLength(1);
    expect(rangesForField(match, "dependency")).toHaveLength(1);
  });

  it("matches compact queries against spaced names", () => {
    const match = matchSearchFields([{ key: "name", text: "Communal Helper", weight: 10 }], createSearchMatcher("CommunalHelper"));

    expect(match.matched).toBe(true);
    expect(rangesForField(match, "name")).toEqual([{ start: 0, end: "Communal Helper".length }]);
  });

  it("requires every token to match", () => {
    const match = matchSearchFields([{ key: "name", text: "Everest Gate", weight: 10 }], createSearchMatcher("everest missing"));

    expect(match.matched).toBe(false);
    expect(match.score).toBe(0);
  });

  it("scores stronger fields higher", () => {
    const nameMatch = matchSearchFields([{ key: "name", text: "Helper", weight: 10 }], createSearchMatcher("helper"));
    const descriptionMatch = matchSearchFields([{ key: "description", text: "Helper", weight: 1 }], createSearchMatcher("helper"));

    expect(nameMatch.score).toBeGreaterThan(descriptionMatch.score);
  });

  it("splits text into highlighted parts", () => {
    const parts = highlightTextParts("Communal Helper", [{ start: 0, end: 8 }]);

    expect(parts).toEqual([
      { highlighted: true, text: "Communal" },
      { highlighted: false, text: " Helper" }
    ]);
  });
});
