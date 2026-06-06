import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isMockMode } from "../mockApi";
import type { AppUpdateState } from "../types";
import { readError } from "./format";

export type AppUpdateInfo = {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
};

export type AppUpdateHandle = AppUpdateInfo & {
  downloadAndInstall: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
};

export type AppUpdateProvider = {
  currentVersion: () => Promise<string>;
  check: () => Promise<AppUpdateHandle | null>;
  relaunch: () => Promise<void>;
};

export const emptyAppUpdateState: AppUpdateState = {
  status: "idle",
  currentVersion: "",
  latestVersion: null,
  notes: null,
  date: null,
  downloaded: 0,
  total: null,
  error: null
};

export function appUpdateCheckingState(current: AppUpdateState): AppUpdateState {
  return { ...current, status: "checking", downloaded: 0, total: null, error: null };
}

export function appUpdateUnavailableState(currentVersion: string): AppUpdateState {
  return {
    ...emptyAppUpdateState,
    currentVersion
  };
}

export function appUpdateAvailableState(update: AppUpdateInfo): AppUpdateState {
  return {
    status: "available",
    currentVersion: update.currentVersion,
    latestVersion: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
    downloaded: 0,
    total: null,
    error: null
  };
}

export function appUpdateDownloadStartedState(current: AppUpdateState, total?: number): AppUpdateState {
  return { ...current, status: "downloading", downloaded: 0, total: total ?? null, error: null };
}

export function appUpdateDownloadProgressState(current: AppUpdateState, chunkLength: number): AppUpdateState {
  return { ...current, status: "downloading", downloaded: current.downloaded + chunkLength };
}

export function appUpdateReadyState(current: AppUpdateState): AppUpdateState {
  return { ...current, status: "ready", downloaded: current.total ?? current.downloaded, error: null };
}

export function appUpdateErrorState(current: AppUpdateState, error: unknown): AppUpdateState {
  return { ...current, status: "error", error: readError(error) };
}

export function createTauriAppUpdateProvider(): AppUpdateProvider {
  if (isMockMode()) return createMockAppUpdateProvider();
  return {
    currentVersion: getVersion,
    async check() {
      const update = await check();
      return update ? toAppUpdateHandle(update) : null;
    },
    relaunch
  };
}

export function createMockAppUpdateProvider(): AppUpdateProvider {
  const hasUpdate = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("appUpdate") === "available";
  const currentVersion = "0.5.0";
  const nextVersion = "0.5.1";
  return {
    async currentVersion() {
      return currentVersion;
    },
    async check() {
      await delay(250);
      if (!hasUpdate) return null;
      return {
        currentVersion,
        version: nextVersion,
        date: "2026-06-06T00:00:00Z",
        body: "Mock 更新：用于预览应用自更新流程。",
        async downloadAndInstall(onEvent) {
          onEvent?.({ event: "Started", data: { contentLength: 5_000_000 } });
          for (let index = 0; index < 5; index += 1) {
            await delay(120);
            onEvent?.({ event: "Progress", data: { chunkLength: 1_000_000 } });
          }
          onEvent?.({ event: "Finished" });
        }
      };
    },
    async relaunch() {
      await delay(150);
    }
  };
}

function toAppUpdateHandle(update: Update): AppUpdateHandle {
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date,
    body: update.body,
    downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent)
  };
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
