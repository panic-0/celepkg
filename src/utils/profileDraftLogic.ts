import type { Profile, ScanResult } from "../types";
import { collectTransitiveRequiredDependencyModIds } from "./dependencyRules";

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
  const helperMapModIds = new Set(helperMapMods.map((modItem) => modItem.id));
  const enabledModIds = profile.enabledModIds
    ? profile.enabledModIds.filter((id) => helperMapModIds.has(id))
    : helperMapMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id);
  return { enabledMapIds, enabledModIds };
}

export function profileContentNeedsSave(profile: Profile, content: { enabledMapIds?: string[]; enabledModIds: string[] }) {
  if (profile.profileType === "maps") {
    return (
      !sameStringArray(profile.enabledMapIds, content.enabledMapIds ?? []) || !sameStringArray(profile.enabledModIds, content.enabledModIds)
    );
  }
  return !sameStringArray(profile.enabledModIds, content.enabledModIds);
}

export function resolveModProfileContent(profile: Profile, scan: ScanResult) {
  const enabledModIds = profile.enabledModIds ?? scan.otherMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id);
  return { enabledModIds };
}

export function nextCopyName(name: string, profiles: Profile[]) {
  const base = `${name || "Main Profile"} Clone`;
  return nextAvailableProfileName(base, profiles);
}

export function nextNewProfileName(base: string, profiles: Profile[]) {
  return nextAvailableProfileName(base, profiles);
}

export function profileNameExists(profiles: Profile[], name: string, currentProfileId: string) {
  return profiles.some((profile) => profile.id !== currentProfileId && profile.name === name);
}

export function inferDependencyMods(scan: ScanResult, enabledMapIds: Set<string>, baseModIds: Set<string>) {
  const protectedModIds = scan.otherMods.filter((modItem) => modItem.protected).map((modItem) => modItem.id);
  return collectTransitiveRequiredDependencyModIds({
    baseModIds: new Set([...baseModIds, ...protectedModIds]),
    isSourceEnabled: (record) => record.protected || enabledMapIds.has(record.id),
    sourceRecords: scan.maps,
    targetMods: scan.otherMods
  });
}

function nextAvailableProfileName(base: string, profiles: Profile[]) {
  const names = new Set(profiles.map((profile) => profile.name));
  if (!names.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!names.has(candidate)) return candidate;
  }
}

function sameStringArray(left: string[] | null | undefined, right: string[]) {
  if (!left || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
