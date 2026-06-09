import { useEffect } from "react";
import { loadApiValidators } from "../apiValidatorsLoader";
import { isMockMode } from "../mockApi";
import type { ModDownloadProgress } from "../types";

export function useModDownloadProgressListener(applyProgress: (progress: ModDownloadProgress) => void) {
  useEffect(() => {
    if (isMockMode()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void Promise.all([import("@tauri-apps/api/event"), loadApiValidators()])
      .then(([{ listen }, { readEventPayload }]) =>
        listen<unknown>("mod-download-progress", (event) => {
          const progress = readEventPayload("mod-download-progress", event.payload);
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
