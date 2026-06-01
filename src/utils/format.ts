import type { MapStats, ModRecord, Profile } from "../types";

export function readError(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "操作失败。";
}

export function profileSummary(profile: Profile) {
  if (!profile.enabledMapIds && !profile.enabledModIds) {
    return "跟随当前状态";
  }
  if (profile.profileType === "maps") {
    return `${profile.enabledMapIds?.length ?? 0} 图 / ${profile.enabledModIds?.length ?? 0} 测试图 Mod`;
  }
  return `${profile.enabledModIds?.length ?? 0} Mod`;
}

export function isDraftEnabled(record: ModRecord, enabledMapDraft: Set<string>, enabledModDraft: Set<string>) {
  return record.kind === "mod" ? enabledModDraft.has(record.id) : enabledMapDraft.has(record.id);
}

export function formatTime(value?: number) {
  if (!value) return "-";
  const seconds = value > 10_000_000 ? Math.floor(value / 10_000_000) : value > 1000 ? Math.floor(value / 1000) : value;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function formatHeartCassette(stats?: MapStats | null) {
  return stats ? `${stats.hearts}/${stats.cassettes}` : "-";
}
