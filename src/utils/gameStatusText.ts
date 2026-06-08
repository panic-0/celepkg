import type { GameStatus } from "../types";

export type FrontendGameStatusPhase = GameStatus["phase"] | "steamStarting";

export function gameStatusText(phase: FrontendGameStatusPhase, detail: string, connected: boolean) {
  if (phase === "steamStarting") return "Steam 正在启动 Celeste";
  if (phase === "processStarting") return detail || "Celeste 正在启动";
  if (phase === "everestPreparing") return detail || "Everest 正在准备";
  if (phase === "running") return "Celeste 正在运行";
  return connected ? "已连接 Celeste" : "等待目录";
}
