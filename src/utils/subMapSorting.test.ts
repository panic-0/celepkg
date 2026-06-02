import { describe, expect, it } from "vitest";
import type { SubMapInfo } from "../types";
import { sortSubMaps } from "./subMapSorting";

function subMap(id: string, difficulty: string, displayName: string, deaths = 0): SubMapInfo {
  return {
    id,
    sid: `Pack/${id}`,
    modeIndex: null,
    displayName,
    chapter: "",
    filePath: `Maps/Pack/${id}.bin`,
    difficulty,
    strawberryCount: 0,
    strawberryTotalCount: 0,
    completionStatus: "unknown",
    stats: {
      deaths,
      strawberries: 0,
      strawberriesKnown: true,
      timePlayed: 0,
      completed: false,
      completionKnown: true,
      cassettes: 0,
      hearts: 0,
      saveFiles: ["0.celeste"]
    }
  };
}

describe("sub-map sorting", () => {
  it("groups Easy, Medium, Hard, and advanced difficulties while sorting within each group", () => {
    const result = sortSubMaps(
      [
        subMap("cracked-low", "Cracked", "A", 1),
        subMap("medium", "Medium", "M", 1),
        subMap("easy", "Easy", "E", 1),
        subMap("hard", "Hard", "H", 1),
        subMap("wtf-high", "WTF", "W", 8),
        subMap("hellish-mid", "Hellish", "Z", 4)
      ],
      { descending: false, groupByDifficulty: true, sortKey: "deaths", strawberryDenominator: "visible" }
    );

    expect(result.map((item) => item.id)).toEqual(["easy", "medium", "hard", "cracked-low", "hellish-mid", "wtf-high"]);
  });

  it("keeps difficulty groups ascending when the keyword sort is descending", () => {
    const result = sortSubMaps(
      [subMap("hard", "Hard", "H", 1), subMap("easy-high", "Easy", "E2", 9), subMap("easy-low", "Easy", "E1", 2)],
      { descending: true, groupByDifficulty: true, sortKey: "deaths", strawberryDenominator: "visible" }
    );

    expect(result.map((item) => item.id)).toEqual(["easy-high", "easy-low", "hard"]);
  });
});
