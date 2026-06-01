export function normalizeDependencyName(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/[_-]/g, " ")
    .trim()
    .replace(/\.zip$/i, "")
    .split(/\s+/)
    .join(" ")
    .toLowerCase();
}
