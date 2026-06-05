import type { Dependency, EverestRelease, ModRecord } from "../types";

export function isEverestDependencyName(name: string) {
  const normalized = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized.startsWith("everest");
}

export function requiredEverestBuild(dependencies: Dependency[]) {
  const builds = dependencies
    .filter((dependency) => isEverestDependencyName(dependency.name))
    .map((dependency) => parseEverestBuild(dependency.version))
    .filter((build): build is number => build !== null);
  return builds.length ? Math.max(...builds) : null;
}

export function installedEverestBuild(mods: ModRecord[]) {
  const builds = mods
    .filter((mod) => isEverestDependencyName(mod.name) || isEverestDependencyName(mod.metadata.name))
    .map((mod) => parseEverestBuild(mod.metadata.version))
    .filter((build): build is number => build !== null);
  return builds.length ? Math.max(...builds) : null;
}

export function selectEverestReleaseForBuild(releases: EverestRelease[], minimumBuild: number) {
  return releases.filter((release) => release.version >= minimumBuild).sort((left, right) => left.version - right.version)[0] ?? null;
}

export function formatEverestBuildVersion(build: number) {
  return `1.${build}.0`;
}

function parseEverestBuild(version: string) {
  const parts =
    version
      .match(/\d+/g)
      ?.map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part)) ?? [];
  if (!parts.length) return null;
  return parts.length >= 2 ? parts[1] : parts[0];
}
