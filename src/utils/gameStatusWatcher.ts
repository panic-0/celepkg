export const GAME_STATUS_BACKGROUND_POLL_INTERVAL_MS = 5000;
export const GAME_LAUNCH_POLL_INTERVAL_MS = 1000;
export const GAME_LAUNCH_TIMEOUT_MS = 120000;

export type GameStatusRefreshSource = "initial" | "manual" | "background" | "launch";
export type GameLaunchWatchOutcome = "running" | "timeout" | "aborted";
export type GameStatusNotice = "launch" | "detected" | "preparing" | null;

type RunnableStatus = {
  running: boolean;
  phase?: string;
};

type SleepResult = "completed" | "aborted";

export type GameLaunchWatchOptions<TStatus extends RunnableStatus> = {
  getStatus: () => Promise<TStatus>;
  now?: () => number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<SleepResult>;
  timeoutMs?: number;
};

export async function watchGameLaunch<TStatus extends RunnableStatus>({
  getStatus,
  now = Date.now,
  pollIntervalMs = GAME_LAUNCH_POLL_INTERVAL_MS,
  signal,
  sleep = sleepWithAbort,
  timeoutMs = GAME_LAUNCH_TIMEOUT_MS
}: GameLaunchWatchOptions<TStatus>): Promise<GameLaunchWatchOutcome> {
  const deadline = now() + timeoutMs;

  while (true) {
    if (signal?.aborted) return "aborted";

    const status = await getStatus();
    if (status.running) return "running";

    const remaining = deadline - now();
    if (remaining <= 0) return "timeout";

    const sleepResult = await sleep(Math.min(pollIntervalMs, remaining), signal);
    if (sleepResult === "aborted") return "aborted";
  }
}

export function gameStatusNoticeForTransition(
  previousPhase: string,
  nextPhase: string,
  source: GameStatusRefreshSource,
  launchWatchActive: boolean
): GameStatusNotice {
  if (previousPhase !== "everestPreparing" && nextPhase === "everestPreparing" && (source === "launch" || launchWatchActive)) {
    return "preparing";
  }
  if (previousPhase === "running" || nextPhase !== "running") return null;
  if (source === "launch" || launchWatchActive) return "launch";
  if (source === "background") return "detected";
  return null;
}

export function shouldWatchGameLaunch(launchResult: { launched: boolean } | null | undefined) {
  return Boolean(launchResult?.launched);
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<SleepResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve("aborted");
      return;
    }

    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve("completed");
    }, ms);

    function abort() {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve("aborted");
    }

    signal?.addEventListener("abort", abort, { once: true });
  });
}
