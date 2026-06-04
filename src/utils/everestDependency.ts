import type { Dependency } from "../types";

export function isEverestDependencyName(name: string) {
  const normalized = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized.startsWith("everest");
}

export function dependenciesIncludeEverest(dependencies: Dependency[]) {
  return dependencies.some((dependency) => isEverestDependencyName(dependency.name));
}
