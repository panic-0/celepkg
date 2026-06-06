import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import type { AppNotifier } from "../types";
import {
  appUpdateAvailableState,
  appUpdateCheckingState,
  appUpdateDownloadProgressState,
  appUpdateDownloadStartedState,
  appUpdateErrorState,
  appUpdateReadyState,
  appUpdateUnavailableState,
  createTauriAppUpdateProvider,
  emptyAppUpdateState,
  type AppUpdateHandle,
  type AppUpdateProvider
} from "../utils/appUpdate";

type UseAppUpdateOptions = {
  autoCheckOnStartup: boolean;
  configLoaded: boolean;
  notifier: AppNotifier;
  provider?: AppUpdateProvider;
};

export function useAppUpdate({ autoCheckOnStartup, configLoaded, notifier, provider }: UseAppUpdateOptions) {
  const updateProvider = useMemo(() => provider ?? createTauriAppUpdateProvider(), [provider]);
  const [state, setState] = useState(emptyAppUpdateState);
  const updateRef = useRef<AppUpdateHandle | null>(null);
  const startupCheckDoneRef = useRef(false);

  const checkForAppUpdate = useCallback(
    async (silent = false) => {
      setState((current) => appUpdateCheckingState(current));
      try {
        const currentVersion = await updateProvider.currentVersion();
        const update = await updateProvider.check();
        updateRef.current = update;
        if (!update) {
          setState(appUpdateUnavailableState(currentVersion));
          if (!silent) notifier.showInfo("当前已是最新版本。");
          return null;
        }
        setState(appUpdateAvailableState(update));
        const message = `发现 CelePkg ${update.version}，可在设置页下载并安装。`;
        if (silent) notifier.showInfo(message);
        else notifier.showSuccess(message);
        return update;
      } catch (error) {
        setState((current) => appUpdateErrorState(current, error));
        if (!silent) notifier.showError(`检查应用更新失败：${readableError(error)}`);
        return null;
      }
    },
    [notifier, updateProvider]
  );

  const downloadAndInstallAppUpdate = useCallback(async () => {
    let update = updateRef.current;
    if (!update) {
      update = await checkForAppUpdate(false);
      if (!update) return;
    }
    try {
      await update.downloadAndInstall((event) => {
        setState((current) => applyDownloadEvent(current, event));
      });
      setState((current) => appUpdateReadyState(current));
      notifier.showSuccess("应用更新已安装，重启后生效。");
    } catch (error) {
      setState((current) => appUpdateErrorState(current, error));
      notifier.showError(`下载或安装应用更新失败：${readableError(error)}`);
    }
  }, [checkForAppUpdate, notifier]);

  const relaunchApp = useCallback(async () => {
    try {
      await updateProvider.relaunch();
    } catch (error) {
      notifier.showError(`重启应用失败：${readableError(error)}`);
    }
  }, [notifier, updateProvider]);

  useEffect(() => {
    if (!configLoaded || !autoCheckOnStartup || startupCheckDoneRef.current) return;
    startupCheckDoneRef.current = true;
    void checkForAppUpdate(true);
  }, [autoCheckOnStartup, checkForAppUpdate, configLoaded]);

  return {
    appUpdateState: state,
    checkForAppUpdate: () => checkForAppUpdate(false),
    downloadAndInstallAppUpdate,
    relaunchApp
  };
}

function applyDownloadEvent(current: ReturnType<typeof appUpdateCheckingState>, event: DownloadEvent) {
  if (event.event === "Started") return appUpdateDownloadStartedState(current, event.data.contentLength);
  if (event.event === "Progress") return appUpdateDownloadProgressState(current, event.data.chunkLength);
  return current;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
