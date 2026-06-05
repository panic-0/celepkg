import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  checkModUpdates,
  createOperationId,
  downloadEverestToStaging,
  downloadModToStaging,
  installStagedEverest,
  installStagedMod,
  listEverestReleases,
  previewModUpdateMetadata,
  searchModCatalog
} from "../api";
import { useAppPrompts } from "./useAppPrompts";
import type {
  AppNotifier,
  Dependency,
  EverestRelease,
  ModCatalogEntry,
  ModCatalogSourceKind,
  ModUpdateCandidate,
  ModUpdateCheckResult,
  ScanResult
} from "../types";
import {
  buildInstalledDependencyIndex,
  dependencyEntrySatisfies,
  formatDependencyIssue,
  isBuiltinDependencyName,
  updateCandidateFromRecord,
  versionTooLow,
  type DependencyActionLabel,
  type DependencyIssue,
  type DependencyUpdateAction,
  type DependencyUpdatePlan
} from "../utils/appDependencyResolution";
import { dedupeDependencyActions, dedupeDependencyIssues } from "../utils/dependencyUpdateDedupe";
import type { DownloadTask } from "../utils/downloadTask";
import type { ExecutableDownloadTaskItem } from "../utils/downloadTaskRunner";
import { normalizeDependencyName } from "../utils/dependencies";
import { createEverestInstallTaskDescriptor } from "../utils/everestTask";
import {
  formatEverestBuildVersion,
  installedEverestBuild,
  isEverestDependencyName,
  requiredEverestBuild,
  selectEverestReleaseForBuild
} from "../utils/everestDependency";
import { readError } from "../utils/format";
import {
  createCatalogInstallTaskDescriptor,
  createModUpdateTaskDescriptors,
  createSingleModUpdateTaskDescriptor
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
    closeEverestDependencyPrompt,
    confirmPrompt,
    dependencyPrompt,
    everestDependencyPrompt,
    requestAppConfirm,
    requestDependencyChoice,
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
          else if (result.updates.length) notifier.showSuccess(`发现 ${result.updates.length} 个可更新 Mod`);
          else notifier.showSuccess("本地 Mod 已是最新");
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
    const confirmed = await requestAppConfirm({
      title: "更新 Mod",
      description: "确认后会下载目录中的版本，并覆盖这个本地 Mod 文件。",
      confirmLabel: "更新",
      facts: [
        { label: "目标", value: candidate.installed.name },
        { label: "当前版本", value: candidate.installed.version || "未知版本" },
        { label: "目标版本", value: candidate.entry.version || "目录最新版本" },
        { label: "本地文件", value: candidate.installed.relativePath }
      ],
      variant: "danger"
    });
    if (!confirmed) return;
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

  async function updateAllMods() {
    const recordsBeforeUpdate = [...scan.maps, ...scan.otherMods];
    const descriptors = createModUpdateTaskDescriptors(downloadableModUpdates, recordsBeforeUpdate);
    if (!descriptors.length) return;
    const confirmed = await requestAppConfirm({
      title: "批量更新 Mod",
      description: "确认后会按依赖顺序下载并覆盖这些本地 Mod 文件。",
      confirmLabel: "更新全部",
      facts: [
        { label: "更新数量", value: `${descriptors.length} 个` },
        { label: "可下载更新", value: `${downloadableModUpdates.length} 个` }
      ],
      details: descriptors.map(
        (descriptor) => `${descriptor.candidate.installed.name} -> ${descriptor.candidate.entry.version || "目录最新版本"}`
      ),
      variant: "danger"
    });
    if (!confirmed) return;
    completedModUpdatePaths.current.clear();
    const items = descriptors.map((descriptor) => createModUpdateExecutableItem(descriptor.candidate, descriptor.dependsOn));
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
    const confirmed = await requestAppConfirm({
      title: "安装 Mod",
      description: "确认后会下载并安装此 Mod。若安装过程中发现依赖问题，会继续进入依赖检查流程。",
      confirmLabel: "安装",
      facts: [
        { label: "目标", value: entry.name },
        { label: "版本", value: entry.version || "无版本号" },
        { label: "来源", value: entry.source },
        { label: "下载地址", value: entry.downloadUrl || "无下载地址" }
      ]
    });
    if (!confirmed) return;
    return await performCatalogInstall(entry, `正在安装 ${entry.name}...`, `已安装 ${entry.name}`);
  }

  async function performModUpdate(candidate: ModUpdateCandidate, batchLabel = "", message = `正在更新 ${candidate.installed.name}...`) {
    void batchLabel;
    return await runExecutableDownloadTask(
      createOperationId("mod-update-task"),
      [createModUpdateExecutableItem(candidate)],
      message,
      `已更新 ${candidate.installed.name}`
    );
  }

  function createModUpdateExecutableItem(candidate: ModUpdateCandidate, dependsOn: string[] = []): ExecutableDownloadTaskItem {
    const descriptor = createSingleModUpdateTaskDescriptor(candidate);
    return {
      ...descriptor,
      dependsOn,
      download: (operationId, taskIndex, taskTotal) =>
        downloadModToStaging(celestePath, candidate.entry, operationId, taskIndex, taskTotal),
      prepareInstall: async () => await prepareDependencyItems(candidate.entry, candidate.installed.name, "更新"),
      install: async (staged) => {
        const result = await installStagedMod(celestePath, staged.stagedId, candidate.entry, candidate.installed.absolutePath);
        setScan(result.scan);
        removeUpdatedCandidate(candidate);
      }
    };
  }

  function createCatalogInstallExecutableItem(entry: ModCatalogEntry, dependsOn: string[] = []): ExecutableDownloadTaskItem {
    const descriptor = createCatalogInstallTaskDescriptor(entry);
    return {
      ...descriptor,
      dependsOn,
      download: (operationId, taskIndex, taskTotal) => downloadModToStaging(celestePath, entry, operationId, taskIndex, taskTotal),
      prepareInstall: async () => await prepareDependencyItems(entry, entry.name, "安装"),
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
      install: async (staged) => {
        const result = await installStagedEverest(celestePath, staged.stagedId, release);
        setScan(result.scan);
      }
    };
  }

  async function prepareDependencyItems(entry: ModCatalogEntry, targetName: string, actionLabel: DependencyActionLabel) {
    const actions = await prepareDependencyActions(entry, targetName, actionLabel);
    if (!actions) throw new Error("已取消依赖检查");
    return createDependencyExecutableItems(actions);
  }

  function createDependencyExecutableItems(actions: DependencyUpdateAction[]): ExecutableDownloadTaskItem[] {
    const dedupedActions = dedupeDependencyActions(actions);
    const updateActions = dedupedActions.filter(
      (action): action is Extract<DependencyUpdateAction, { kind: "update" }> => action.kind === "update"
    );
    const updateDescriptors = createModUpdateTaskDescriptors(
      updateActions.map((action) => action.candidate),
      [...scan.maps, ...scan.otherMods]
    );
    const updateItems = updateDescriptors.map((descriptor) => createModUpdateExecutableItem(descriptor.candidate, descriptor.dependsOn));
    const nonUpdateItems = dedupedActions
      .filter((action): action is Exclude<DependencyUpdateAction, { kind: "update" }> => action.kind !== "update")
      .map(dependencyActionToExecutableItem);
    return [...nonUpdateItems, ...updateItems];
  }

  function dependencyActionToExecutableItem(action: Exclude<DependencyUpdateAction, { kind: "update" }>): ExecutableDownloadTaskItem {
    if (action.kind === "everest") return createEverestExecutableItem(action.release);
    return createCatalogInstallExecutableItem(action.entry);
  }

  async function prepareDependencyActions(
    entry: ModCatalogEntry,
    targetName: string,
    actionLabel: DependencyActionLabel
  ): Promise<DependencyUpdateAction[] | null> {
    let metadata;
    try {
      setLoading(true, `正在检查 ${targetName} 的依赖...`);
      metadata = await previewModUpdateMetadata(celestePath, entry);
    } catch (error) {
      const message = readError(error);
      notifier.showWarning(message);
      const confirmed = await requestAppConfirm({
        title: "无法预览依赖",
        description: `无法预览 ${targetName} ${actionLabel}后的依赖。继续后可能遗漏必需依赖。`,
        confirmLabel: `继续${actionLabel}`,
        facts: [
          { label: "目标", value: targetName },
          { label: "操作", value: actionLabel },
          { label: "错误", value: message }
        ],
        variant: "danger"
      });
      if (!confirmed) return null;
      return [];
    } finally {
      setLoading(false);
    }

    const everestAction = await resolveEverestDependencyAction(
      metadata.dependencies.concat(metadata.optionalDependencies),
      targetName,
      actionLabel
    );
    if (everestAction === false) return null;

    const issues = dependencyIssuesForMetadata(metadata.dependencies, false)
      .concat(dependencyIssuesForMetadata(metadata.optionalDependencies, true))
      .filter((issue) => !isEverestDependencyName(issue.dependency.name));
    if (!issues.length) return everestAction ? [everestAction] : [];

    const choice = await requestDependencyChoice(targetName, actionLabel, issues);
    if (!choice) return null;
    const actions = await resolveDependencyActions({ actionLabel, choice, issues, targetName });
    if (!actions) return null;
    return everestAction ? [everestAction, ...actions] : actions;
  }

  async function resolveEverestDependencyAction(
    dependencies: Dependency[],
    targetName: string,
    actionLabel: DependencyActionLabel
  ): Promise<Extract<DependencyUpdateAction, { kind: "everest" }> | null | false> {
    const requiredBuild = requiredEverestBuild(dependencies);
    if (requiredBuild === null) return null;
    const installedBuild = installedEverestBuild(scan.otherMods);
    if (installedBuild !== null && installedBuild >= requiredBuild) return null;
    let release: EverestRelease | null = null;
    try {
      setLoading(true, "正在检查 Everest 版本...");
      const result = await listEverestReleases();
      release = selectEverestReleaseForBuild(result.releases, requiredBuild);
      if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
    } catch (error) {
      notifier.showWarning(readError(error));
    } finally {
      setLoading(false);
    }
    if (!release) {
      const requiredVersion = formatEverestBuildVersion(requiredBuild);
      const installedVersion = installedBuild === null ? "未识别" : formatEverestBuildVersion(installedBuild);
      return (await requestAppConfirm({
        title: "Everest 无法自动更新",
        description: `未找到可自动更新的 Everest 版本。继续${actionLabel}后，目标 Mod 可能无法正常运行。`,
        confirmLabel: `继续${actionLabel}`,
        facts: [
          { label: "目标", value: targetName },
          { label: "需要 Everest", value: `${requiredVersion} 或更高版本` },
          { label: "当前 Everest", value: installedVersion }
        ],
        variant: "danger"
      }))
        ? null
        : false;
    }
    const choice = await requestEverestDependencyChoice({
      installedBuild,
      release,
      requiredBuild,
      targetName
    });
    if (!choice) return false;
    if (choice === "ignore") return null;
    return { kind: "everest", name: "Everest", release };
  }

  async function resolveDependencyActions(plan: DependencyUpdatePlan): Promise<DependencyUpdateAction[] | null> {
    if (plan.choice === "none") return [];
    const selectedIssues = dedupeDependencyIssues(plan.issues.filter((issue) => !issue.optional || plan.choice === "all"));
    const actions: DependencyUpdateAction[] = [];
    const unavailable: DependencyIssue[] = [];
    for (const issue of selectedIssues) {
      const action = await resolveDependencyAction(issue);
      if (action) actions.push(action);
      else unavailable.push(issue);
    }
    if (unavailable.length) {
      const actionText = plan.actionLabel === "安装" ? "安装" : "覆盖";
      const confirmed = await requestAppConfirm({
        title: "依赖无法自动处理",
        description: `以下依赖无法自动更新或安装。继续后，目标 Mod 可能缺少依赖或版本不足。`,
        confirmLabel: `继续${actionText}`,
        facts: [
          { label: "目标", value: plan.targetName },
          { label: "操作", value: plan.actionLabel },
          { label: "无法处理", value: `${unavailable.length} 个` }
        ],
        details: unavailable.map(formatDependencyIssue),
        variant: "danger"
      });
      if (!confirmed) return null;
    }
    return dedupeDependencyActions(actions);
  }

  function dependencyIssuesForMetadata(dependencies: Dependency[], optional: boolean): DependencyIssue[] {
    const installedIndex = buildInstalledDependencyIndex([...scan.maps, ...scan.otherMods]);
    const issues: DependencyIssue[] = [];
    for (const dependency of dependencies) {
      const installed = installedIndex.get(normalizeDependencyName(dependency.name));
      if (!installed) {
        issues.push({ dependency, optional, reason: "missing" });
        continue;
      }
      if (dependency.version.trim() && versionTooLow(installed.metadata.version, dependency.version)) {
        issues.push({ dependency, installed, optional, reason: "tooLow" });
      }
    }
    return issues;
  }

  async function resolveDependencyAction(issue: DependencyIssue): Promise<DependencyUpdateAction | null> {
    if (isBuiltinDependencyName(issue.dependency.name)) return null;
    if (issue.installed) {
      const candidate = downloadableModUpdates.find((item) => item.installed.recordId === issue.installed?.id);
      if (candidate && dependencyEntrySatisfies(candidate.entry, issue.dependency)) {
        return { kind: "update", name: issue.dependency.name, candidate };
      }
    }
    const entry = await findCatalogEntryForDependency(issue.dependency);
    if (!entry) return null;
    if (issue.installed) {
      return {
        kind: "update",
        name: issue.dependency.name,
        candidate: updateCandidateFromRecord(entry, issue.installed)
      };
    }
    return { kind: "install", name: issue.dependency.name, entry };
  }

  async function findCatalogEntryForDependency(dependency: Dependency): Promise<ModCatalogEntry | null> {
    try {
      const result = await searchModCatalog(dependency.name, modCatalogSources);
      const normalized = normalizeDependencyName(dependency.name);
      return (
        result.entries.find((entry) => normalizeDependencyName(entry.name) === normalized && dependencyEntrySatisfies(entry, dependency)) ??
        null
      );
    } catch (error) {
      notifier.showWarning(readError(error));
      return null;
    }
  }

  async function performCatalogInstall(entry: ModCatalogEntry, message: string, successMessage: string) {
    return await runExecutableDownloadTask(
      createOperationId("mod-install-task"),
      [createCatalogInstallExecutableItem(entry)],
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
    closeEverestDependencyPrompt,
    confirmPrompt,
    dependencyPrompt,
    downloadableModUpdates,
    everestDependencyPrompt,
    installCatalogEntry,
    installEverestRelease,
    modUpdateChecking,
    modUpdateResult,
    modUpdatesByRecordId,
    updateAllMods,
    updateSingleMod
  };
}
