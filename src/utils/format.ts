import type { CompletionStatus, MapStats, ModRecord, Profile } from "../types";
import type { StrawberryDenominator } from "../viewTypes";

export function readError(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "操作失败。";
}

export function profileSummary(profile: Profile) {
  if (!profile.enabledMapIds && !profile.enabledModIds) {
    return "未初始化，编辑后自动保存";
  }
  if (profile.profileType === "maps") {
    return `${profile.enabledMapIds?.length ?? 0} 图 / ${profile.enabledModIds?.length ?? 0} 测试图 Mod`;
  }
  return `${profile.enabledModIds?.length ?? 0} Mod`;
}

export function isDraftEnabled(record: ModRecord, enabledMapDraft: Set<string>, enabledModDraft: Set<string>) {
  if (record.readOnly || record.protected) return true;
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

export function formatStrawberries(collected?: number | null, total?: number | null, known = true) {
  if (!known) {
    return typeof total === "number" ? `未知/${total}` : "未知";
  }
  if (typeof total === "number") {
    return `${collected ?? 0}/${total}`;
  }
  if (typeof collected === "number") {
    return `${collected}`;
  }
  return "-";
}

export function strawberryCollected(stats: MapStats | null | undefined, denominator: StrawberryDenominator) {
  if (!stats) return undefined;
  return denominator === "total" ? stats.totalStrawberries : stats.strawberries;
}

export function formatCompletionStatus(status?: CompletionStatus | null) {
  switch (status) {
    case "completed":
      return "已完成";
    case "unfinished":
      return "未完成";
    case "notApplicable":
      return "不适用";
    default:
      return "未知";
  }
}

export function formatFileSize(size: number | null) {
  if (!size) return "未知大小";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KiB`;
  return `${(size / 1024 / 1024).toFixed(1)} MiB`;
}

export function formatUnixSeconds(value: number | null) {
  if (!value) return "未知";
  return new Date(value * 1000).toLocaleString();
}

export function formatByteProgress(downloaded: number, total: number | null) {
  if (!total || total <= 0) return formatFileSize(downloaded);
  return `${Math.round((downloaded / total) * 100)}%`;
}
