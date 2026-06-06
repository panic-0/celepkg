import type { SubMapInfo } from "../types";
import { strawberryCollected } from "./format";
import type { StrawberryDenominator } from "../viewTypes";

export type SubMapSortKey = "file" | "name" | "completion" | "deaths" | "time" | "strawberries";

export type SubMapSortOptions = {
  descending: boolean;
  groupByDifficulty: boolean;
  sortKey: SubMapSortKey;
  strawberryDenominator: StrawberryDenominator;
};

const difficultyRanks = new Map([
  ["Easy", 0],
  ["Medium", 1],
  ["Hard", 2],
  ["WTF", 3],
  ["Cracked", 3],
  ["Hellish", 3]
]);

const completionRanks = new Map([
  ["completed", 0],
  ["unfinished", 1],
  ["unknown", 2],
  ["notApplicable", 3]
]);

export function sortSubMaps(subMaps: SubMapInfo[], options: SubMapSortOptions) {
  return [...subMaps].sort((left, right) => compareSubMaps(left, right, options));
}

export function compareDifficulties(left: string, right: string) {
  return difficultyRank(left) - difficultyRank(right);
}

function compareSubMaps(left: SubMapInfo, right: SubMapInfo, options: SubMapSortOptions) {
  if (options.groupByDifficulty) {
    const difficultyComparison = compareDifficulties(left.difficulty, right.difficulty);
    if (difficultyComparison !== 0) return difficultyComparison;
  }

  const sortComparison = compareBySortKey(left, right, options);
  if (sortComparison !== 0) return options.descending ? -sortComparison : sortComparison;

  return naturalTextCompare(left.filePath || left.sid, right.filePath || right.sid);
}

function compareBySortKey(left: SubMapInfo, right: SubMapInfo, options: SubMapSortOptions) {
  switch (options.sortKey) {
    case "name":
      return naturalTextCompare(left.displayName || left.sid, right.displayName || right.sid);
    case "completion":
      return completionRank(left.completionStatus) - completionRank(right.completionStatus);
    case "deaths":
      return compareOptionalNumber(left.stats?.deaths, right.stats?.deaths);
    case "time":
      return compareOptionalNumber(left.stats?.timePlayed, right.stats?.timePlayed);
    case "strawberries":
      return compareOptionalNumber(
        strawberrySortValue(left, options.strawberryDenominator),
        strawberrySortValue(right, options.strawberryDenominator)
      );
    case "file":
    default:
      return naturalTextCompare(left.filePath || left.sid, right.filePath || right.sid);
  }
}

function compareOptionalNumber(left?: number, right?: number) {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left - right;
}

function strawberrySortValue(subMap: SubMapInfo, strawberryDenominator: StrawberryDenominator) {
  if (!subMap.stats) return undefined;
  const total = strawberryDenominator === "total" ? subMap.strawberryTotalCount : subMap.strawberryCount;
  const collected = strawberryCollected(subMap.stats, strawberryDenominator) ?? 0;
  return total ? collected / total : collected;
}

function difficultyRank(value: string) {
  return difficultyRanks.get(value) ?? Number.MAX_SAFE_INTEGER;
}

function completionRank(value: SubMapInfo["completionStatus"]) {
  return completionRanks.get(value) ?? Number.MAX_SAFE_INTEGER;
}

function naturalTextCompare(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN", { numeric: true });
}
