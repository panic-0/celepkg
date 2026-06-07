import { useEffect } from "react";
import { readEventPayload } from "../generated/api-validators";
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
