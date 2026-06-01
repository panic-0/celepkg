import type { SubMapInfo } from "../types";

export const ALL_SUB_MAP_FOLDER = "all";

export type SubMapFolderOption = {
  count: number;
  label: string;
  path: string;
};

export function collectSubMapFolderOptions(subMaps: SubMapInfo[], selectedPath: string) {
  const prefix = normalizeFolderPath(selectedPath);
  const options = new Map<string, SubMapFolderOption>();
  for (const subMap of subMaps) {
    const segments = subMap.sid.split("/").filter(Boolean);
    if (!segments.length || !isUnderFolder(segments, prefix)) continue;
    if (segments.length <= prefix.length + 1) continue;
    const next = segments[prefix.length];
    const path = [...prefix, next].join("/");
    const option = options.get(path) ?? { count: 0, label: subMapFolderLabel(subMap, path, next), path };
    option.count += 1;
    options.set(path, option);
  }
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
}

export function getSubMapRootPath(subMaps: SubMapInfo[]) {
  const segmentGroups = subMaps.map((subMap) => subMap.sid.split("/").filter(Boolean)).filter((segments) => segments.length > 1);
  if (segmentGroups.length === 1) {
    const prefix = segmentGroups[0].slice(0, -1);
    return prefix.length ? prefix.join("/") : ALL_SUB_MAP_FOLDER;
  }
  if (segmentGroups.length < 2) return ALL_SUB_MAP_FOLDER;
  const maxPrefixLength = Math.min(...segmentGroups.map((segments) => segments.length - 1));
  const prefix: string[] = [];
  for (let index = 0; index < maxPrefixLength; index += 1) {
    const value = segmentGroups[0][index];
    if (!segmentGroups.every((segments) => segments[index] === value)) break;
    prefix.push(value);
  }
  return prefix.length ? prefix.join("/") : ALL_SUB_MAP_FOLDER;
}

export function subMapMatchesFolder(subMap: SubMapInfo, path: string) {
  const prefix = normalizeFolderPath(path);
  if (!prefix.length) return true;
  const segments = subMap.sid.split("/").filter(Boolean);
  return isUnderFolder(segments, prefix);
}

export function subMapIsDirectChildOfFolder(subMap: SubMapInfo, path: string) {
  const prefix = normalizeFolderPath(path);
  const segments = subMap.sid.split("/").filter(Boolean);
  return isUnderFolder(segments, prefix) && segments.length === prefix.length + 1;
}

export function normalizeFolderPath(path: string) {
  if (!path || path === ALL_SUB_MAP_FOLDER) return [];
  return path.split("/").filter(Boolean);
}

function isUnderFolder(segments: string[], prefix: string[]) {
  return prefix.every((part, index) => segments[index] === part);
}

function subMapFolderLabel(subMap: SubMapInfo, path: string, fallback: string) {
  if (path.startsWith("Celeste/") && subMap.chapter.startsWith("Celeste/")) {
    return subMap.chapter.split("/").filter(Boolean).at(-1) ?? fallback;
  }
  return fallback;
}
