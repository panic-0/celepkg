import type { Profile, ScanResult } from "../types";
import { buildModAliasMap, normalizeDependencyName } from "./dependencies";

export function toggleSetValue(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function resolveMapProfileContent(profile: Profile, scan: ScanResult) {
  const readOnlyMapIds = scan.maps.filter((map) => map.readOnly).map((map) => map.id);
  const enabledMapIds = [
    ...new Set([...(profile.enabledMapIds ?? scan.maps.filter((map) => map.enabled).map((map) => map.id)), ...readOnlyMapIds])
  ];
  const helperMapMods = scan.otherMods.filter((modItem) => modItem.subMaps.length > 0);
  const enabledModIds = profile.enabledModIds ?? helperMapMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id);
  return { enabledMapIds, enabledModIds };
}

export function resolveModProfileContent(profile: Profile, scan: ScanResult) {
  const enabledModIds = profile.enabledModIds ?? scan.otherMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id);
  return { enabledModIds };
}

export function nextCopyName(name: string, profiles: Profile[]) {
  const base = `${name || "Main Profile"} Copy`;
  return nextAvailableProfileName(base, profiles);
}

export function nextNewProfileName(base: string, profiles: Profile[]) {
  return nextAvailableProfileName(base, profiles);
}

export function profileNameExists(profiles: Profile[], name: string, currentProfileId: string) {
  return profiles.some((profile) => profile.id !== currentProfileId && profile.name === name);
}

export function inferDependencyMods(scan: ScanResult, enabledMapIds: Set<string>, baseModIds: Set<string>) {
  const aliasToModId = buildModAliasMap(scan.otherMods);
  const modById = new Map(scan.otherMods.map((modItem) => [modItem.id, modItem]));
  const baseSeedModIds = new Set([...baseModIds, ...scan.otherMods.filter((modItem) => modItem.protected).map((modItem) => modItem.id)]);
  const inferred = new Set<string>();
  const queue: string[] = [];
  const addDependency = (name: string) => {
    const id = aliasToModId.get(normalizeDependencyName(name));
    if (id && !baseSeedModIds.has(id) && !inferred.has(id)) {
      inferred.add(id);
      queue.push(id);
    }
  };

  for (const map of scan.maps) {
    if (map.protected || enabledMapIds.has(map.id)) map.dependencies.forEach((dependency) => addDependency(dependency.name));
  }
  for (const id of baseSeedModIds) queue.push(id);
  while (queue.length) {
    const modItem = modById.get(queue.shift() ?? "");
    modItem?.dependencies.forEach((dependency) => addDependency(dependency.name));
  }
  return inferred;
}

function nextAvailableProfileName(base: string, profiles: Profile[]) {
  const names = new Set(profiles.map((profile) => profile.name));
  if (!names.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!names.has(candidate)) return candidate;
  }
}
