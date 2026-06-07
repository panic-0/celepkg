import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  checkModUpdates,
  createOperationId,
  downloadEverestToStaging,
  downloadModToStaging,
  installStagedEverest,
  installStagedMod
} from "../api";
import { useAppPrompts } from "./useAppPrompts";
import { createDependencyWorkflow } from "./modInstallWorkflow/dependencyWorkflow";
import type {
  AppNotifier,
  EverestRelease,
  ModCatalogEntry,
  ModCatalogSourceKind,
  StagedDownload,
  ModUpdateCandidate,
  ModUpdateCheckResult,
  ScanResult
} from "../types";
import { buildInstalledDependencyIndex } from "../utils/appDependencyResolution";
import type { DownloadTask } from "../utils/downloadTask";
import type { ExecutableDownloadTaskItem } from "../utils/downloadTaskRunner";
import { createEverestInstallTaskDescriptor } from "../utils/everestTask";
import { readError } from "../utils/format";
import {
  createCatalogInstallTaskDescriptor,
  createModUpdateTaskDescriptors,
  createSingleModUpdateTaskDescriptor,
  formatModUpdateVersionChange
} from "../utils/modUpdateTask";

type ModInstallWorkflowOptions = {
  autoCheckModUpdatesOnStartup: boolean;
  celestePath: string;
  modCatalogSources: ModCatalogSourceKind[];
  notifier: AppNotifier;
  runExecutableDownloadTask: (
    taskId: string,
    items: ExecutableDownloadTaskItem[],
    message: string,
    successMessage: string
  ) => Promise<boolean>;
  scan: ScanResult;
  setLoading: (loading: boolean, message?: string) => void;
  setScan: Dispatch<SetStateAction<ScanResult>>;
  startupAutoCheckModUpdatesOnStartup: boolean;
  startDownloadTask: (taskId: string, items: ExecutableDownloadTaskItem[], operationIdPrefix?: string) => Promise<DownloadTask>;
};

export function useModInstallWorkflow({
  autoCheckModUpdatesOnStartup,
  celestePath,
  modCatalogSources,
  notifier,
  runExecutableDownloadTask,
  scan,
  setLoading,
  setScan,
  startupAutoCheckModUpdatesOnStartup,
  startDownloadTask
}: ModInstallWorkflowOptions) {
  const [modUpdateResult, setModUpdateResult] = useState<ModUpdateCheckResult>({ sources: [], updates: [], matched: [], warnings: [] });
  const [modUpdateChecking, setModUpdateChecking] = useState(false);
  const {
    closeConfirmPrompt,
    closeDependencyPrompt,
    closeDependencyTreePrompt,
    closeEverestDependencyPrompt,
    confirmPrompt,
    dependencyPrompt,
    dependencyTreePrompt,
    everestDependencyPrompt,
    requestAppConfirm,
    requestDependencyChoice,
    requestDependencyTreeChoice,
    requestEverestDependencyChoice
  } = useAppPrompts();
  const completedModUpdatePaths = useRef<Set<string>>(new Set());
  const modUpdateCheckRequest = useRef(0);
  const manualModUpdateCheckRequest = useRef(0);
  const startupModUpdateCheckDone = useRef(false);

  const modUpdatesByRecordId = useMemo(() => {
    const byRecordId = new Map<string, ModUpdateCandidate>();
    for (const candidate of modUpdateResult.updates) {
      byRecordId.set(candidate.installed.recordId, candidate);
    }
    return byRecordId;
  }, [modUpdateResult.updates]);
  const downloadableModUpdates = useMemo(
    () => modUpdateResult.updates.filter((candidate) => candidate.entry.downloadUrl.trim().length > 0),
    [modUpdateResult.updates]
  );
  const allRecords = useMemo(() => [...scan.maps, ...scan.otherMods], [scan.maps, scan.otherMods]);
  const installedIndex = useMemo(() => buildInstalledDependencyIndex(allRecords), [allRecords]);
  const downloadableModUpdatesByRecordId = useMemo(() => {
    const byRecordId = new Map<string, ModUpdateCandidate>();
    for (const candidate of downloadableModUpdates) byRecordId.set(candidate.installed.recordId, candidate);
    return byRecordId;
  }, [downloadableModUpdates]);

  const checkUpdatesForMods = useCallback(
    async (mode: "manual" | "startup" = "manual") => {
      if (!celestePath.trim()) return;
      const startupMode = mode === "startup";
      const sources = modCatalogSources;
      const requestId = modUpdateCheckRequest.current + 1;
      modUpdateCheckRequest.current = requestId;
      const manualRequestId = startupMode ? 0 : manualModUpdateCheckRequest.current + 1;
      if (!startupMode) {
        manualModUpdateCheckRequest.current = manualRequestId;
        setModUpdateChecking(true);
      }
      try {
        const result = await checkModUpdates(celestePath, sources);
        const latestResultRequest = modUpdateCheckRequest.current === requestId;
        if (latestResultRequest) setModUpdateResult(result);
        if (!startupMode) {
          if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
          else if (result.updates.length) {
            const downloadableCount = result.updates.filter((candidate) => candidate.entry.downloadUrl.trim().length > 0).length;
            notifier.showSuccess(
              downloadableCount === result.updates.length
                ? `发现 ${result.updates.length} 个可更新 Mod`
                : `发现 ${result.updates.length} 个可更新 Mod，其中 ${downloadableCount} 个可下载`
            );
          } else notifier.showSuccess("本地 Mod 已是最新");
        }
      } catch (error) {
        const message = readError(error);
        if (!startupMode) notifier.showError(message);
      } finally {
        if (!startupMode && manualModUpdateCheckRequest.current === manualRequestId) setModUpdateChecking(false);
      }
    },
    [celestePath, modCatalogSources, notifier]
  );

  useEffect(() => {
    if (
      startupModUpdateCheckDone.current ||
      !startupAutoCheckModUpdatesOnStartup ||
      !autoCheckModUpdatesOnStartup ||
      !celestePath.trim() ||
      !scan.modsPath
    ) {
      return;
    }
    startupModUpdateCheckDone.current = true;
    void checkUpdatesForMods("startup");
  }, [autoCheckModUpdatesOnStartup, celestePath, checkUpdatesForMods, scan.modsPath, startupAutoCheckModUpdatesOnStartup]);

  async function updateSingleMod(candidate: ModUpdateCandidate) {
    await updateModCandidate(candidate);
  }

  async function installEverestRelease(release: EverestRelease) {
    const version = `1.${release.version}.0`;
    const confirmed = await requestAppConfirm({
      title: "安装 Everest",
      description: "安装器会覆盖游戏目录中的 Everest 相关文件。请确认目标版本无误。",
      confirmLabel: "安装 Everest",
      facts: [
        { label: "目标版本", value: version },
        { label: "游戏目录", value: celestePath }
      ],
      variant: "danger"
    });
    if (!confirmed) return;
    await performEverestInstall(release, `正在安装 Everest ${version}...`, `已安装 Everest ${version}`);
  }

  async function performEverestInstall(release: EverestRelease, message: string, successMessage: string) {
    const descriptor = createEverestInstallTaskDescriptor(release);
    return await runExecutableDownloadTask(
      createOperationId("everest-task"),
      [
        {
          ...descriptor,
          download: (operationId) => downloadEverestToStaging(celestePath, release, operationId),
          cleanupStaged: cleanupStagedDownload,
          install: async (staged) => {
            const result = await installStagedEverest(celestePath, staged.stagedId, release);
            setScan(result.scan);
          }
        }
      ],
      message,
      successMessage
    );
  }

  async function updateAllMods(candidates: ModUpdateCandidate[] = downloadableModUpdates) {
    const recordsBeforeUpdate = [...scan.maps, ...scan.otherMods];
    const descriptors = createModUpdateTaskDescriptors(candidates, recordsBeforeUpdate);
    if (!descriptors.length) return;
    const confirmed = await requestAppConfirm({
      title: "批量更新 Mod",
      description: "确认后会按依赖顺序下载并覆盖这些本地 Mod 文件。",
      confirmLabel: "更新全部",
      facts: [
        { label: "更新数量", value: `${descriptors.length} 个` },
        { label: "可下载更新", value: `${candidates.length} 个` }
      ],
      details: descriptors.map(
        (descriptor) => `${descriptor.candidate.installed.name}: ${formatModUpdateVersionChange(descriptor.candidate)}`
      ),
      variant: "danger"
    });
    if (!confirmed) return;
    completedModUpdatePaths.current.clear();
    const items = descriptors.map((descriptor) =>
      createModUpdateExecutableItem(descriptor.candidate, descriptor.dependsOn, undefined, { prepareDependencies: false })
    );
    try {
      setLoading(true, `正在更新 ${items.length} 个 Mod...`);
      const result = await startDownloadTask(createOperationId("mod-update-task"), items, "mod-update");
      const installedCount = result.items.filter((item) => item.status === "installed").length;
      const failedCount = result.items.filter(
        (item) => item.status === "downloadFailed" || item.status === "installFailed" || item.status === "skipped"
      ).length;
      if (result.status === "cancelled") notifier.showInfo("已取消更新任务");
      else if (failedCount) notifier.showWarning(`更新完成，成功 ${installedCount} 个，失败 ${failedCount} 个`);
      else notifier.showSuccess(`已更新 ${installedCount} 个 Mod`);
    } catch (error) {
      const message = readError(error);
      notifier.showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function updateModCandidate(candidate: ModUpdateCandidate, batchLabel = "") {
    return await performModUpdate(
      candidate,
      batchLabel,
      batchLabel ? `正在更新 Mod (${batchLabel})...` : `正在更新 ${candidate.installed.name}...`
    );
  }

  async function installCatalogEntry(entry: ModCatalogEntry) {
    return await performCatalogInstall(entry, `正在安装 ${entry.name}...`, `已安装 ${entry.name}`);
  }

  async function performModUpdate(candidate: ModUpdateCandidate, batchLabel = "", message = `正在更新 ${candidate.installed.name}...`) {
    void batchLabel;
    const preview = await prepareTargetDependencyPreview(candidate.entry, candidate.installed.name, "更新");
    if (!preview) return false;
    return await runExecutableDownloadTask(
      createOperationId("mod-update-task"),
      [
        createModUpdateExecutableItem(candidate, [], {
          dependencies: preview.dependencyItems,
          staged: preview.targetStaged
        })
      ],
      message,
      `已更新 ${candidate.installed.name}`
    );
  }

  function createModUpdateExecutableItem(
    candidate: ModUpdateCandidate,
    dependsOn: string[] = [],
    prepared?: { dependencies: ExecutableDownloadTaskItem[]; staged: StagedDownload },
    options: { prepareDependencies?: boolean } = {}
  ): ExecutableDownloadTaskItem {
    const descriptor = createSingleModUpdateTaskDescriptor(candidate);
    return {
      ...descriptor,
      dependsOn,
      download: prepared
        ? async () => prepared.staged
        : (operationId, taskIndex, taskTotal) => downloadModToStaging(celestePath, candidate.entry, operationId, taskIndex, taskTotal),
      cleanupStaged: cleanupStagedDownload,
      prepareInstall: prepared
        ? async () => prepared.dependencies
        : options.prepareDependencies === false
          ? undefined
          : async (staged) => await prepareDependencyItems(candidate.entry, candidate.installed.name, "更新", staged),
      install: async (staged) => {
        const result = await installStagedMod(celestePath, staged.stagedId, candidate.entry, candidate.installed.absolutePath);
        setScan(result.scan);
        removeUpdatedCandidate(candidate);
      }
    };
  }

  function createCatalogInstallExecutableItem(
    entry: ModCatalogEntry,
    dependsOn: string[] = [],
    prepared?: { dependencies: ExecutableDownloadTaskItem[]; staged: StagedDownload }
  ): ExecutableDownloadTaskItem {
    const descriptor = createCatalogInstallTaskDescriptor(entry);
    return {
      ...descriptor,
      dependsOn,
      download: prepared
        ? async () => prepared.staged
        : (operationId, taskIndex, taskTotal) => downloadModToStaging(celestePath, entry, operationId, taskIndex, taskTotal),
      cleanupStaged: cleanupStagedDownload,
      prepareInstall: prepared
        ? async () => prepared.dependencies
        : async (staged) => await prepareDependencyItems(entry, entry.name, "安装", staged),
      install: async (staged) => {
        const result = await installStagedMod(celestePath, staged.stagedId, entry);
        setScan(result.scan);
      }
    };
  }

  function createEverestExecutableItem(release: EverestRelease): ExecutableDownloadTaskItem {
    const descriptor = createEverestInstallTaskDescriptor(release);
    return {
      ...descriptor,
      download: (operationId) => downloadEverestToStaging(celestePath, release, operationId),
      cleanupStaged: cleanupStagedDownload,
      install: async (staged) => {
        const result = await installStagedEverest(celestePath, staged.stagedId, release);
        setScan(result.scan);
      }
    };
  }

  const { cleanupStagedDownload, prepareDependencyItems, prepareTargetDependencyPreview } = createDependencyWorkflow({
    allRecords,
    celestePath,
    createCatalogInstallExecutableItem,
    createEverestExecutableItem,
    createModUpdateExecutableItem,
    downloadableModUpdatesByRecordId,
    installedIndex,
    modCatalogSources,
    notifier,
    requestAppConfirm,
    requestDependencyChoice,
    requestDependencyTreeChoice,
    requestEverestDependencyChoice,
    scanOtherMods: scan.otherMods,
    setLoading
  });

  async function performCatalogInstall(entry: ModCatalogEntry, message: string, successMessage: string) {
    if (entry.name === "Mock Download Failure") {
      return await runExecutableDownloadTask(
        createOperationId("mod-install-task"),
        [createCatalogInstallExecutableItem(entry)],
        message,
        successMessage
      );
    }
    const preview = await prepareTargetDependencyPreview(entry, entry.name, "安装");
    if (!preview) return false;
    return await runExecutableDownloadTask(
      createOperationId("mod-install-task"),
      [
        createCatalogInstallExecutableItem(entry, [], {
          dependencies: preview.dependencyItems,
          staged: preview.targetStaged
        })
      ],
      message,
      successMessage
    );
  }

  function removeUpdatedCandidate(candidate: ModUpdateCandidate) {
    completedModUpdatePaths.current.add(candidate.installed.absolutePath);
    setModUpdateResult((current) => ({
      ...current,
      updates: current.updates.filter((item) => item.installed.absolutePath !== candidate.installed.absolutePath),
      matched: current.matched.map((item) =>
        item.installed.absolutePath === candidate.installed.absolutePath ? { ...item, updateAvailable: false, reason: "刚刚已更新" } : item
      )
    }));
  }

  return {
    checkUpdatesForMods,
    closeConfirmPrompt,
    closeDependencyPrompt,
    closeDependencyTreePrompt,
    closeEverestDependencyPrompt,
    confirmPrompt,
    dependencyPrompt,
    dependencyTreePrompt,
    downloadableModUpdates,
    everestDependencyPrompt,
    installCatalogEntry,
    installEverestRelease,
    modUpdateChecking,
    modUpdateResult,
    modUpdatesByRecordId,
    requestAppConfirm,
    updateAllMods,
    updateSingleMod
  };
}
