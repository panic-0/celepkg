import { useEffect } from "react";
import { isMockMode } from "../mockApi";
import type { ModDownloadProgress } from "../types";

export function useModDownloadProgressListener(applyProgress: (progress: ModDownloadProgress) => void) {
  useEffect(() => {
    if (isMockMode()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<unknown>("mod-download-progress", (event) => {
          const progress = toModDownloadProgress(event.payload);
          if (!progress) return;
          applyProgress(progress);
        })
      )
      .then((listener) => {
        if (disposed) listener();
        else unlisten = listener;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [applyProgress]);
}

const modDownloadPhases = new Set(["downloading", "verifying", "installing", "done", "error"]);

function toModDownloadProgress(value: unknown): ModDownloadProgress | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  if (
    typeof object.operationId !== "string" ||
    typeof object.phase !== "string" ||
    !modDownloadPhases.has(object.phase) ||
    typeof object.downloaded !== "number"
  ) {
    return null;
  }
  return {
    operationId: object.operationId,
    modName: typeof object.modName === "string" ? object.modName : "",
    phase: object.phase as ModDownloadProgress["phase"],
    downloaded: object.downloaded,
    total: typeof object.total === "number" ? object.total : null,
    speedBytesPerSec: typeof object.speedBytesPerSec === "number" ? object.speedBytesPerSec : 0,
    taskIndex: typeof object.taskIndex === "number" ? object.taskIndex : 1,
    taskTotal: typeof object.taskTotal === "number" ? object.taskTotal : 1,
    url: typeof object.url === "string" ? object.url : ""
  };
}
