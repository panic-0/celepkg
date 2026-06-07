import { useCallback, useEffect, useRef, useState } from "react";
import { getGameStatus, stopGame } from "../api";
import type { AppNotifier, GameStatus } from "../types";
import { readError } from "../utils/format";
import type { AppConfirmPromptState } from "../components/AppDialogs";
import {
  GAME_STATUS_BACKGROUND_POLL_INTERVAL_MS,
  gameRunningNoticeForTransition,
  watchGameLaunch,
  type GameStatusRefreshSource
} from "../utils/gameStatusWatcher";

const idleStatus: GameStatus = {
  running: false,
  stopped: false,
  executable: "",
  pid: null
};

type GameStatusOptions = {
  celestePath: string;
  configLoaded: boolean;
  notifier: AppNotifier;
  requestAppConfirm: (prompt: Omit<AppConfirmPromptState, "resolve">) => Promise<boolean>;
  setLoading: (loading: boolean, message?: string) => void;
};

export function useGameStatus({ celestePath, configLoaded, notifier, requestAppConfirm, setLoading }: GameStatusOptions) {
  const [gameStatus, setGameStatus] = useState<GameStatus>(idleStatus);
  const [gameLaunchPending, setGameLaunchPending] = useState(false);
  const requestIdRef = useRef(0);
  const gameStatusRef = useRef(idleStatus);
  const launchWatchAbortRef = useRef<AbortController | null>(null);
  const launchWatchActiveRef = useRef(false);

  const setKnownGameStatus = useCallback((status: GameStatus) => {
    gameStatusRef.current = status;
    setGameStatus(status);
  }, []);

  const applyGameStatus = useCallback(
    (status: GameStatus, source: GameStatusRefreshSource) => {
      const notice = gameRunningNoticeForTransition(gameStatusRef.current.running, status.running, source, launchWatchActiveRef.current);
      setKnownGameStatus(status);
      if (notice === "launch") notifier.showSuccess("Celeste 已启动。");
      else if (notice === "detected") notifier.showInfo("检测到 Celeste 正在运行。");
    },
    [notifier, setKnownGameStatus]
  );

  const refreshGameStatus = useCallback(
    async (options: { resetOnError?: boolean; silent?: boolean; source?: GameStatusRefreshSource } = {}) => {
      const requestId = ++requestIdRef.current;
      if (!configLoaded || !celestePath.trim()) {
        setKnownGameStatus(idleStatus);
        return idleStatus;
      }
      try {
        const status = await getGameStatus(celestePath);
        if (requestId === requestIdRef.current) applyGameStatus(status, options.source ?? "manual");
        return status;
      } catch (error) {
        if (!options.silent) notifier.showError(readError(error));
        if (requestId === requestIdRef.current && options.resetOnError !== false) setKnownGameStatus(idleStatus);
        return idleStatus;
      }
    },
    [applyGameStatus, celestePath, configLoaded, notifier, setKnownGameStatus]
  );

  useEffect(() => {
    void refreshGameStatus({ silent: true, source: "initial" });
  }, [refreshGameStatus]);

  useEffect(() => {
    if (!configLoaded || !celestePath.trim()) return;
    const timer = window.setInterval(() => {
      void refreshGameStatus({ resetOnError: false, silent: true, source: "background" });
    }, GAME_STATUS_BACKGROUND_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [celestePath, configLoaded, refreshGameStatus]);

  useEffect(() => {
    return () => {
      launchWatchAbortRef.current?.abort();
      launchWatchAbortRef.current = null;
      launchWatchActiveRef.current = false;
      setGameLaunchPending(false);
    };
  }, [celestePath]);

  const startWatchingGameLaunch = useCallback(() => {
    if (!configLoaded || !celestePath.trim()) return;

    launchWatchAbortRef.current?.abort();
    const abortController = new AbortController();
    launchWatchAbortRef.current = abortController;
    launchWatchActiveRef.current = true;
    setGameLaunchPending(true);

    void watchGameLaunch({
      getStatus: () => refreshGameStatus({ resetOnError: false, silent: true, source: "launch" }),
      signal: abortController.signal
    })
      .then((outcome) => {
        if (launchWatchAbortRef.current !== abortController) return;
        if (outcome === "timeout" && !gameStatusRef.current.running) {
          notifier.showWarning("已发出启动命令，但暂未检测到 Celeste 进程，可稍后刷新状态。");
        }
      })
      .finally(() => {
        if (launchWatchAbortRef.current !== abortController) return;
        launchWatchAbortRef.current = null;
        launchWatchActiveRef.current = false;
        setGameLaunchPending(false);
      });
  }, [celestePath, configLoaded, notifier, refreshGameStatus]);

  async function stopGameWithConfirm() {
    if (!gameStatus.running) {
      await refreshGameStatus();
      return;
    }
    const confirmed = await requestAppConfirm({
      title: "停止 Celeste",
      description: "Celeste 正在运行。继续操作会关闭当前游戏进程，未保存的游戏状态可能丢失。",
      confirmLabel: "停止游戏",
      variant: "danger",
      facts: [
        { label: "可执行文件", value: gameStatus.executable || "未找到" },
        { label: "进程 ID", value: gameStatus.pid?.toString() ?? "未知" }
      ]
    });
    if (!confirmed) return;

    setLoading(true, "正在停止 Celeste");
    try {
      const status = await stopGame(celestePath);
      setKnownGameStatus(status);
      notifier.showSuccess(status.stopped ? "Celeste 已停止。" : "Celeste 当前未运行。");
    } catch (error) {
      notifier.showError(readError(error));
      await refreshGameStatus({ silent: true });
    } finally {
      setLoading(false);
    }
  }

  return {
    gameLaunchPending,
    gameRunning: gameStatus.running,
    gameStatus,
    refreshGameStatus,
    startWatchingGameLaunch,
    stopGameWithConfirm
  };
}
