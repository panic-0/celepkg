const NANOS_PER_MILLISECOND = 1_000_000n;
const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000;

export function formatUnixNanoseconds(value: unknown, fallback: string) {
  const milliseconds = parseUnixNanosecondsToMilliseconds(value);
  if (milliseconds === null) return fallback;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

export function parseUnixNanosecondsToMilliseconds(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;

  try {
    const milliseconds = BigInt(text) / NANOS_PER_MILLISECOND;
    if (milliseconds <= 0n || milliseconds > BigInt(MAX_DATE_MILLISECONDS)) return null;
    return Number(milliseconds);
  } catch {
    return null;
  }
}
