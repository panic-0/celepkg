import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelModDownload,
  checkModUpdates,
  createOperationId,
  downloadEverestToStaging,
  downloadModToStaging,
  installStagedEverest,
  installStagedMod,
  listEverestReleases,
  previewModUpdateMetadata,
  searchModCatalog
} from "./api";
import { BackupManager } from "./components/BackupManager";
import { DownloadManager } from "./components/DownloadManager";
import { EverestManager } from "./components/EverestManager";
import { IssueDrawer } from "./components/IssueDrawer";
import { MapDetail } from "./components/MapDetail";
import { ModCatalogManager } from "./components/ModCatalogManager";
import { ModDetail } from "./components/ModDetail";
import { ProfileManager } from "./components/ProfileManager";
import { RecordList } from "./components/RecordList";
import { SettingsManager } from "./components/SettingsManager";
import { AppToolbar } from "./components/AppToolbar";
import { ToastHost } from "./components/ToastHost";
import { WorkspaceNav } from "./components/WorkspaceNav";
import { DialogFacts, DialogShell, type DialogFact } from "./components/common";
import { useBackups } from "./hooks/useBackups";
import { useCelePkgData } from "./hooks/useCelePkgData";
import { useMapDetailControls, type MapDetailMemoryState } from "./hooks/useMapDetailControls";
import { useModFilters } from "./hooks/useModFilters";
import { useProfileDraft } from "./hooks/useProfileDraft";
import { useRecordActions } from "./hooks/useRecordActions";
import type { ScrollPosition } from "./hooks/useScrollMemory";
import { useUiLayout } from "./hooks/useUiLayout";
import { useWorkspaceView } from "./hooks/useWorkspaceView";
import type {
  Dependency,
  EverestRelease,
  ModCatalogEntry,
  ModDownloadProgress,
  ModRecord,
  ModUpdateCandidate,
  ModUpdateCheckResult
} from "./types";
import { normalizeDependencyName } from "./utils/dependencies";
import { dedupeDependencyActions, dedupeDependencyIssues } from "./utils/dependencyUpdateDedupe";
import type { DownloadTask } from "./utils/downloadTask";
import { DownloadTaskRunner, type ExecutableDownloadTaskItem } from "./utils/downloadTaskRunner";
import { createEverestInstallTaskDescriptor } from "./utils/everestTask";
import {
  formatEverestBuildVersion,
  installedEverestBuild,
  isEverestDependencyName,
  requiredEverestBuild,
  selectEverestReleaseForBuild
} from "./utils/everestDependency";
import { isDraftEnabled, readError } from "./utils/format";
import {
  createCatalogInstallTaskDescriptor,
  createModUpdateTaskDescriptors,
  createSingleModUpdateTaskDescriptor
} from "./utils/modUpdateTask";
import { isMockMode } from "./mockApi";

export function App() {
  const {
    autoBackupCleanupEnabled,
    autoBackupEnabled,
    autoBackupRetentionCount,
    autoCheckModUpdatesOnStartup,
    autoRefreshModCatalogCacheOnStartup,
    catalogCacheRefreshing,
    celestePath,
    clearNotice,
    configWarnings,
    loading,
    loadingMessage,
    modCatalogSourceEnabledCount,
    modCatalogSourceOrder,
    modCatalogSources,
    notice,
    notifier,
    refresh,
    refreshModCatalogCacheNow,
    savePathAndRefresh,
    savePathAndRescan,
    scan,
    selectPathAndRefresh,
    setLoading,
    setPathInput,
    setScan,
    startupAutoCheckModUpdatesOnStartup,
    updateAutoBackupCleanupEnabled,
    updateAutoBackupEnabled,
    updateAutoBackupRetentionCount,
    updateAutoCheckModUpdatesOnStartup,
    updateAutoRefreshModCatalogCacheOnStartup,
    updateModCatalogSources,
    updateSelectedSaveFiles
  } = useCelePkgData();
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [modUpdateResult, setModUpdateResult] = useState<ModUpdateCheckResult>({ sources: [], updates: [], matched: [], warnings: [] });
  const [modUpdateChecking, setModUpdateChecking] = useState(false);
  const [downloadTask, setDownloadTask] = useState<DownloadTask | null>(null);
  const [downloadControls, setDownloadControls] = useState<DownloadControlState>({ downloadPaused: false, installPaused: false });
  const [confirmPrompt, setConfirmPrompt] = useState<AppConfirmPromptState | null>(null);
  const [dependencyPrompt, setDependencyPrompt] = useState<DependencyPromptState | null>(null);
  const [everestDependencyPrompt, setEverestDependencyPrompt] = useState<EverestDependencyPromptState | null>(null);
  const downloadTaskRunner = useRef<DownloadTaskRunner | null>(null);
  const downloadControlsRef = useRef<DownloadControlState>(downloadControls);
  const completedModUpdatePaths = useRef<Set<string>>(new Set());
  const modUpdateCheckRequest = useRef(0);
  const manualModUpdateCheckRequest = useRef(0);
  const startupModUpdateCheckDone = useRef(false);
  const mapDetailMemory = useRef<Record<string, MapDetailMemoryState>>({});
  const scrollMemory = useRef<Record<string, ScrollPosition>>({});
  const uiLayout = useUiLayout();
  const itemWarnings = useMemo(
    () => [...scan.maps, ...scan.otherMods].filter((record) => record.warnings.length),
    [scan.maps, scan.otherMods]
  );
  const issueCount = configWarnings.length + scan.warnings.length + itemWarnings.length;
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

  useEffect(() => {
    if (configWarnings.length && !celestePath.trim()) setIssuesOpen(true);
  }, [celestePath, configWarnings.length]);

  useEffect(() => {
    if (isMockMode()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<unknown>("mod-download-progress", (event) => {
          const progress = toModDownloadProgress(event.payload);
          if (!progress) return;
          downloadTaskRunner.current?.applyProgress(progress.operationId, progress);
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
  }, []);

  const backups = useBackups({
    celestePath,
    notifier,
    refresh,
    setLoading
  });

  const profileDraft = useProfileDraft({
    celestePath,
    notifier,
    scan,
    setLoading,
    setScan
  });
  const filters = useModFilters({
    enabledMapDraft: profileDraft.enabledMapDraft,
    enabledModDraft: profileDraft.enabledModDraft,
    scan
  });
  const workspaceView = useWorkspaceView({
    enabledMapDraft: profileDraft.enabledMapDraft,
    enabledModDraft: profileDraft.enabledModDraft,
    mapProfiles: profileDraft.mapProfiles,
    maps: scan.maps,
    modProfiles: profileDraft.modProfiles,
    otherMods: scan.otherMods,
    selectedMapProfileId: profileDraft.selectedMapProfileId,
    selectedModProfileId: profileDraft.selectedModProfileId,
    visibleMapRecords: filters.visibleMapRecords,
    onBackupsOpen: () => void backups.refreshBackups()
  });
  const mapDetailControls = useMapDetailControls(workspaceView.selectedMap, mapDetailMemory);
  const recordActions = useRecordActions({
    activeView: workspaceView.activeView,
    celestePath,
    dependencyModDraft: profileDraft.dependencyModDraft,
    enabledMapDraft: profileDraft.enabledMapDraft,
    enabledModDraft: profileDraft.enabledModDraft,
    filteredMaps: filters.filteredMaps,
    filteredMods: filters.filteredMods,
    notifier,
    scan,
    setEnabledExplicitModDraft: profileDraft.setEnabledExplicitModDraft,
    setEnabledMapDraft: profileDraft.setEnabledMapDraft,
    setEnabledMapModDraft: profileDraft.setEnabledMapModDraft,
    setLoading,
    setScan,
    toggleMap: profileDraft.toggleMap,
    toggleMapMod: profileDraft.toggleMapMod,
    toggleMod: profileDraft.toggleMod
  });
  const showWorkspaceLoading = loading && isWorkspaceLoadingMessage(loadingMessage);
  const showingModRecords = workspaceView.activeView === "mods";

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
    const runner = new DownloadTaskRunner(createOperationId("mod-update-task"), items, {
      concurrencyLimit: 3,
      initialDownloadPaused: downloadControlsRef.current.downloadPaused,
      initialInstallPaused: downloadControlsRef.current.installPaused,
      createOperationId: () => createOperationId("mod-update"),
      cancelOperation: cancelModDownload,
      onChange: setDownloadTask
    });
    downloadTaskRunner.current = runner;
    try {
      setLoading(true, `正在更新 ${items.length} 个 Mod...`);
      const result = await runner.start();
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

  async function runExecutableDownloadTask(taskId: string, items: ExecutableDownloadTaskItem[], message: string, successMessage: string) {
    const runner = new DownloadTaskRunner(taskId, items, {
      concurrencyLimit: 3,
      initialDownloadPaused: downloadControlsRef.current.downloadPaused,
      initialInstallPaused: downloadControlsRef.current.installPaused,
      createOperationId: () => createOperationId("mod-task"),
      cancelOperation: cancelModDownload,
      onChange: setDownloadTask
    });
    downloadTaskRunner.current = runner;
    try {
      setLoading(true, message);
      const result = await runner.start();
      if (result.status === "cancelled") {
        notifier.showInfo("已取消下载任务");
        return false;
      }
      if (result.status !== "done") {
        const failedItem = result.items.find((item) => item.error);
        notifier.showError(failedItem?.error ?? "下载或安装失败");
        return false;
      }
      notifier.showSuccess(successMessage);
      return true;
    } catch (error) {
      notifier.showError(readError(error));
      return false;
    } finally {
      setLoading(false);
    }
  }

  function requestDependencyChoice(targetName: string, actionLabel: DependencyActionLabel, issues: DependencyIssue[]) {
    return new Promise<DependencyUpdateChoice | null>((resolve) => {
      setDependencyPrompt({ actionLabel, issues, resolve, targetName });
    });
  }

  function requestEverestDependencyChoice(prompt: Omit<EverestDependencyPromptState, "resolve">) {
    return new Promise<EverestDependencyChoice | null>((resolve) => {
      setEverestDependencyPrompt({ ...prompt, resolve });
    });
  }

  function requestAppConfirm(prompt: Omit<AppConfirmPromptState, "resolve">) {
    return new Promise<boolean>((resolve) => {
      setConfirmPrompt({ ...prompt, resolve });
    });
  }

  function updateDownloadControls(update: (current: DownloadControlState) => DownloadControlState) {
    setDownloadControls((current) => {
      const next = update(current);
      downloadControlsRef.current = next;
      return next;
    });
  }

  async function pauseTaskDownloads() {
    updateDownloadControls((current) => ({ ...current, downloadPaused: true }));
    const runner = downloadTaskRunner.current;
    try {
      if (runner) await runner.pauseDownloads();
      notifier.showInfo("已停止下载，新项目会停在待下载列表");
    } catch (error) {
      notifier.showError(readError(error));
    }
  }

  function resumeTaskDownloads() {
    updateDownloadControls((current) => ({ ...current, downloadPaused: false }));
    const runner = downloadTaskRunner.current;
    if (runner) runner.resumeDownloads();
    notifier.showInfo("已恢复下载");
  }

  function pauseTaskInstalls() {
    updateDownloadControls((current) => ({ ...current, installPaused: true }));
    const runner = downloadTaskRunner.current;
    if (runner) runner.pauseInstalls();
    notifier.showInfo("已停止安装，新下载完成的项目会停在等待安装列表");
  }

  function resumeTaskInstalls() {
    updateDownloadControls((current) => ({ ...current, installPaused: false }));
    const runner = downloadTaskRunner.current;
    if (runner) runner.resumeInstalls();
    notifier.showInfo("已恢复安装");
  }

  async function cancelTaskDownloads() {
    const runner = downloadTaskRunner.current;
    if (!runner) return;
    try {
      await runner.cancelPendingDownloads();
      notifier.showInfo("已取消当前待下载项目");
    } catch (error) {
      notifier.showError(readError(error));
    }
  }

  function cancelTaskInstalls() {
    const runner = downloadTaskRunner.current;
    if (!runner) return;
    runner.cancelPendingInstalls();
    notifier.showInfo("已取消当前待安装项目");
  }

  async function retryFailedDownloadTask() {
    const runner = downloadTaskRunner.current;
    if (!runner) return;
    try {
      setLoading(true, "正在重试失败任务...");
      const result = await runner.retryFailed();
      const installedCount = result.items.filter((item) => item.status === "installed").length;
      const failedCount = result.items.filter(
        (item) => item.status === "downloadFailed" || item.status === "installFailed" || item.status === "skipped"
      ).length;
      if (result.status === "running") notifier.showInfo("已将失败项目重新加入重试队列");
      else if (result.status === "cancelled") notifier.showInfo("已取消重试任务");
      else if (failedCount) notifier.showWarning(`重试完成，成功 ${installedCount} 个，失败 ${failedCount} 个`);
      else notifier.showSuccess(`重试完成，成功 ${installedCount} 个`);
    } catch (error) {
      notifier.showError(readError(error));
    } finally {
      setLoading(false);
    }
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

  return (
    <main className="app-shell">
      <AppToolbar
        celestePath={celestePath}
        loading={loading}
        loadingMessage={loadingMessage}
        canLaunch={Boolean(scan.gameExecutable)}
        issueCount={issueCount}
        scan={scan}
        onApplyAndLaunch={profileDraft.launchSelectedProfiles}
        onDirectLaunch={profileDraft.launchCurrentGame}
        onIssuesOpen={() => setIssuesOpen(true)}
        onPathBrowse={selectPathAndRefresh}
        onPathChange={setPathInput}
        onRefresh={savePathAndRefresh}
        onRescan={savePathAndRescan}
      />

      <section
        className={`workspace ${
          workspaceView.activeView === "profiles" ||
          workspaceView.activeView === "settings" ||
          workspaceView.activeView === "backups" ||
          workspaceView.activeView === "downloads" ||
          workspaceView.activeView === "everest" ||
          workspaceView.activeView === "catalog"
            ? "management-view"
            : ""
        }`}
      >
        <WorkspaceNav
          activeView={workspaceView.activeView}
          dependencyModCount={profileDraft.dependencyModDraft.size}
          enabledFilter={showingModRecords ? filters.modEnabledFilter : filters.mapEnabledFilter}
          enabledMapCount={workspaceView.enabledMapCount}
          enabledModCount={workspaceView.enabledModCount}
          helperMapCount={filters.helperMapMods.length}
          mapProfileName={workspaceView.mapProfileName}
          modProfileName={workspaceView.modProfileName}
          progressFilter={showingModRecords ? filters.modProgressFilter : filters.mapProgressFilter}
          query={showingModRecords ? filters.modQuery : filters.mapQuery}
          referenceFilter={filters.modReferenceFilter}
          showHelperMaps={filters.showHelperMaps}
          sortKey={filters.mapSortKey}
          mainMode={workspaceView.mainMode}
          mapDetailTab={uiLayout.mapDetailTab}
          mapDetailControls={mapDetailControls}
          totalMapCount={scan.maps.length}
          totalModCount={scan.otherMods.length}
          onActiveViewChange={workspaceView.changeActiveView}
          onEnabledFilterChange={showingModRecords ? filters.setModEnabledFilter : filters.setMapEnabledFilter}
          onProgressFilterChange={showingModRecords ? filters.setModProgressFilter : filters.setMapProgressFilter}
          onQueryChange={showingModRecords ? filters.setModQuery : filters.setMapQuery}
          onReferenceFilterChange={filters.setModReferenceFilter}
          onShowHelperMapsChange={filters.setShowHelperMaps}
          onSortKeyChange={filters.setMapSortKey}
        />

        {workspaceView.activeView === "profiles" ? (
          <ProfileManager
            enabledMapCount={workspaceView.enabledMapCount}
            enabledModCount={workspaceView.enabledModCount}
            dependencyModCount={profileDraft.dependencyModDraft.size}
            launchArgs={profileDraft.launchArgs}
            loading={loading}
            mapProfileName={profileDraft.mapProfileName}
            mapProfiles={profileDraft.mapProfiles}
            modProfileName={profileDraft.modProfileName}
            modProfiles={profileDraft.modProfiles}
            selectedMapProfileId={profileDraft.selectedMapProfileId}
            selectedModProfileId={profileDraft.selectedModProfileId}
            totalMapCount={scan.maps.length}
            totalModCount={scan.otherMods.length}
            scrollMemory={scrollMemory}
            onApplyProfile={profileDraft.applySelectedProfiles}
            onLaunchArgsChange={profileDraft.setLaunchArgs}
            onMapProfileCopy={profileDraft.copyMapProfile}
            onMapProfileCreateEmpty={profileDraft.createEmptyMapProfile}
            onMapProfileDelete={profileDraft.deleteMapProfile}
            onMapProfileNameChange={profileDraft.setMapProfileName}
            onMapProfileOverwriteFromCurrent={profileDraft.overwriteMapProfileFromCurrent}
            onMapProfileOverwriteFromProfile={profileDraft.overwriteMapProfileFromProfile}
            onMapProfileRename={profileDraft.renameMapProfile}
            onMapProfileSelect={profileDraft.setMapProfileDraft}
            onModProfileCopy={profileDraft.copyModProfile}
            onModProfileCreateEmpty={profileDraft.createEmptyModProfile}
            onModProfileDelete={profileDraft.deleteModProfile}
            onModProfileNameChange={profileDraft.setModProfileName}
            onModProfileOverwriteFromCurrent={profileDraft.overwriteModProfileFromCurrent}
            onModProfileOverwriteFromProfile={profileDraft.overwriteModProfileFromProfile}
            onModProfileRename={profileDraft.renameModProfile}
            onModProfileSelect={profileDraft.setModProfileDraft}
          />
        ) : workspaceView.activeView === "settings" ? (
          <SettingsManager
            autoBackupCleanupEnabled={autoBackupCleanupEnabled}
            autoBackupEnabled={autoBackupEnabled}
            autoBackupRetentionCount={autoBackupRetentionCount}
            autoCheckModUpdatesOnStartup={autoCheckModUpdatesOnStartup}
            autoRefreshModCatalogCacheOnStartup={autoRefreshModCatalogCacheOnStartup}
            catalogCacheRefreshing={catalogCacheRefreshing}
            loading={loading}
            modCatalogSourceEnabledCount={modCatalogSourceEnabledCount}
            modCatalogSourceOrder={modCatalogSourceOrder}
            saveFiles={scan.availableSaveFiles}
            selectedSaveFiles={scan.selectedSaveFiles}
            showWarningColumn={uiLayout.showWarningColumn}
            strawberryDenominator={uiLayout.strawberryDenominator}
            onAutoBackupCleanupEnabledChange={updateAutoBackupCleanupEnabled}
            onAutoBackupEnabledChange={updateAutoBackupEnabled}
            onAutoBackupRetentionCountChange={updateAutoBackupRetentionCount}
            onAutoCheckModUpdatesOnStartupChange={updateAutoCheckModUpdatesOnStartup}
            onAutoRefreshModCatalogCacheOnStartupChange={updateAutoRefreshModCatalogCacheOnStartup}
            onModCatalogSourcesChange={updateModCatalogSources}
            onModCatalogCacheRefresh={refreshModCatalogCacheNow}
            onSelectedSaveFilesChange={updateSelectedSaveFiles}
            onShowWarningColumnChange={uiLayout.setShowWarningColumn}
            onStrawberryDenominatorChange={uiLayout.setStrawberryDenominator}
          />
        ) : workspaceView.activeView === "backups" ? (
          <BackupManager
            autoBackupCleanupEnabled={autoBackupCleanupEnabled}
            backups={backups.backups}
            backupsRefreshing={backups.backupsRefreshing}
            celestePath={celestePath}
            loading={loading}
            onBackupCreate={backups.createManualBackup}
            onBackupDelete={backups.deleteSelectedBackup}
            onBackupFolderOpen={backups.openCurrentBackupFolder}
            onBackupLocationOpen={backups.openSelectedBackupLocation}
            onBackupRestore={backups.restoreSelectedBackup}
            onBackupsCleanup={backups.cleanupOldAutoBackups}
            onBackupsRefresh={backups.refreshBackups}
          />
        ) : workspaceView.activeView === "downloads" ? (
          <DownloadManager
            task={downloadTask}
            downloadPaused={downloadControls.downloadPaused}
            installPaused={downloadControls.installPaused}
            onPauseDownloads={pauseTaskDownloads}
            onResumeDownloads={resumeTaskDownloads}
            onPauseInstalls={pauseTaskInstalls}
            onResumeInstalls={resumeTaskInstalls}
            onCancelDownloads={cancelTaskDownloads}
            onCancelInstalls={cancelTaskInstalls}
            onRetryFailed={retryFailedDownloadTask}
          />
        ) : workspaceView.activeView === "catalog" ? (
          <ModCatalogManager
            downloadTask={downloadTask}
            loading={loading}
            notifier={notifier}
            scan={scan}
            sources={modCatalogSources}
            onInstall={installCatalogEntry}
            onRetryFailed={retryFailedDownloadTask}
          />
        ) : workspaceView.activeView === "everest" ? (
          <EverestManager loading={loading} mods={scan.otherMods} notifier={notifier} onInstall={installEverestRelease} />
        ) : workspaceView.mainMode === "detail" && workspaceView.activeView === "maps" ? (
          <MapDetail
            activeTab={uiLayout.mapDetailTab}
            map={workspaceView.selectedMap}
            mapDetailControls={mapDetailControls}
            strawberryDenominator={uiLayout.strawberryDenominator}
            draftEnabled={
              workspaceView.selectedMap
                ? isDraftEnabled(workspaceView.selectedMap, profileDraft.enabledMapDraft, profileDraft.enabledModDraft)
                : false
            }
            scrollMemory={scrollMemory}
            onBack={workspaceView.showList}
            onTabChange={uiLayout.setMapDetailTab}
          />
        ) : workspaceView.mainMode === "detail" && workspaceView.activeView === "mods" ? (
          <ModDetail
            activeTab={uiLayout.modDetailTab}
            modItem={workspaceView.selectedMod}
            draftEnabled={
              workspaceView.selectedMod
                ? workspaceView.selectedMod.readOnly || profileDraft.enabledModDraft.has(workspaceView.selectedMod.id)
                : false
            }
            scrollMemory={scrollMemory}
            onBack={workspaceView.showList}
            onTabChange={uiLayout.setModDetailTab}
          />
        ) : (
          <RecordList
            activeView={workspaceView.activeView}
            filteredMaps={filters.filteredMaps}
            filteredMods={filters.filteredMods}
            selectedMap={workspaceView.selectedMap}
            selectedMod={workspaceView.selectedMod}
            showWarningColumn={uiLayout.showWarningColumn}
            strawberryDenominator={uiLayout.strawberryDenominator}
            visibleMapCount={filters.visibleMapRecords.length}
            modCount={scan.otherMods.length}
            scrollMemory={scrollMemory}
            loading={loading && !showWorkspaceLoading}
            loadingMessage={loadingMessage}
            modUpdateChecking={modUpdateChecking}
            modUpdateCount={downloadableModUpdates.length}
            modUpdatesByRecordId={modUpdatesByRecordId}
            onDisableAll={recordActions.disableAllInCurrentView}
            onEnableAll={recordActions.enableAllInCurrentView}
            onCheckModUpdates={checkUpdatesForMods}
            onMapSelect={workspaceView.selectMap}
            onMapToggle={recordActions.toggleMapLikeRecord}
            onModSelect={workspaceView.selectMod}
            onModToggle={recordActions.toggleModRecord}
            onModUpdate={updateSingleMod}
            onRecordViewChange={workspaceView.changeActiveView}
            onUpdateAllMods={updateAllMods}
            onFavoriteToggle={recordActions.updateRecordFavorite}
            onProtectedToggle={recordActions.updateRecordProtected}
            isMapEnabled={recordActions.isMapEnabled}
            isModEnabled={recordActions.isModEnabled}
          />
        )}

        {showWorkspaceLoading && (
          <div className="workspace-loading" role="status" aria-live="polite">
            <LoaderCircle className="spin-icon" size={34} />
            <strong>{loadingMessage}</strong>
          </div>
        )}
      </section>

      <IssueDrawer
        configWarnings={configWarnings}
        itemWarnings={itemWarnings}
        open={issuesOpen}
        scanWarnings={scan.warnings}
        onClose={() => setIssuesOpen(false)}
      />
      {dependencyPrompt && (
        <DependencyUpdateDialog
          prompt={dependencyPrompt}
          onClose={(choice) => {
            dependencyPrompt.resolve(choice);
            setDependencyPrompt(null);
          }}
        />
      )}
      {everestDependencyPrompt && (
        <EverestDependencyDialog
          prompt={everestDependencyPrompt}
          onClose={(choice) => {
            everestDependencyPrompt.resolve(choice);
            setEverestDependencyPrompt(null);
          }}
        />
      )}
      {confirmPrompt && (
        <AppConfirmDialog
          prompt={confirmPrompt}
          onClose={(confirmed) => {
            confirmPrompt.resolve(confirmed);
            setConfirmPrompt(null);
          }}
        />
      )}
      <ToastHost notice={notice} onClose={clearNotice} />
    </main>
  );
}

function isWorkspaceLoadingMessage(message: string) {
  return message.includes("扫描") || message.includes("缓存") || message.includes("存档统计");
}

type DependencyUpdateChoice = "none" | "required" | "all";
type DependencyActionLabel = "安装" | "更新";
type EverestDependencyChoice = "update" | "ignore";

type DownloadControlState = {
  downloadPaused: boolean;
  installPaused: boolean;
};

type AppConfirmPromptState = {
  cancelLabel?: string;
  confirmLabel: string;
  description: string;
  details?: string[];
  facts?: DialogFact[];
  resolve: (confirmed: boolean) => void;
  title: string;
  variant?: "primary" | "danger";
};

type DependencyIssue = {
  dependency: Dependency;
  installed?: ModRecord;
  optional: boolean;
  reason: "missing" | "tooLow";
};

type DependencyUpdateAction =
  | { kind: "everest"; name: string; release: EverestRelease }
  | { kind: "update"; name: string; candidate: ModUpdateCandidate }
  | { kind: "install"; name: string; entry: ModCatalogEntry };

type DependencyUpdatePlan = {
  actionLabel: DependencyActionLabel;
  choice: DependencyUpdateChoice;
  issues: DependencyIssue[];
  targetName: string;
};

type DependencyPromptState = {
  actionLabel: DependencyActionLabel;
  issues: DependencyIssue[];
  resolve: (choice: DependencyUpdateChoice | null) => void;
  targetName: string;
};

type EverestDependencyPromptState = {
  installedBuild: number | null;
  release: EverestRelease;
  requiredBuild: number;
  resolve: (choice: EverestDependencyChoice | null) => void;
  targetName: string;
};

function AppConfirmDialog({ prompt, onClose }: { prompt: AppConfirmPromptState; onClose: (confirmed: boolean) => void }) {
  return (
    <DialogShell
      actions={[
        { label: prompt.cancelLabel ?? "取消", onClick: () => onClose(false) },
        { label: prompt.confirmLabel, onClick: () => onClose(true), variant: prompt.variant ?? "primary" }
      ]}
      icon={<AlertTriangle size={18} />}
      onClose={() => onClose(false)}
      title={prompt.title}
    >
      <p>{prompt.description}</p>
      {prompt.facts && prompt.facts.length > 0 && <DialogFacts facts={prompt.facts} />}
      {prompt.details && prompt.details.length > 0 && (
        <div className="dependency-preview-list">
          {prompt.details.map((detail) => (
            <div className="dependency-preview-row" key={detail}>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      )}
    </DialogShell>
  );
}

function EverestDependencyDialog({
  prompt,
  onClose
}: {
  prompt: EverestDependencyPromptState;
  onClose: (choice: EverestDependencyChoice | null) => void;
}) {
  const requiredVersion = formatEverestBuildVersion(prompt.requiredBuild);
  const installedVersion = prompt.installedBuild === null ? "未识别" : formatEverestBuildVersion(prompt.installedBuild);
  const updateVersion = formatEverestBuildVersion(prompt.release.version);
  return (
    <DialogShell
      actions={[
        { label: "取消", onClick: () => onClose(null) },
        { label: "忽略继续", onClick: () => onClose("ignore") },
        { label: "更新 Everest 后继续", onClick: () => onClose("update"), variant: "primary" }
      ]}
      icon={<LoaderCircle size={18} />}
      onClose={() => onClose(null)}
      title="需要更新 Everest"
    >
      <p>{`${prompt.targetName} 需要 Everest ${requiredVersion} 或更高版本，当前版本 ${installedVersion}。`}</p>
      <p>{`可以先更新到 Everest ${updateVersion} 后继续，也可以忽略此检查继续。`}</p>
    </DialogShell>
  );
}

function DependencyUpdateDialog({
  prompt,
  onClose
}: {
  prompt: DependencyPromptState;
  onClose: (choice: DependencyUpdateChoice | null) => void;
}) {
  const requiredCount = prompt.issues.filter((issue) => !issue.optional).length;
  const optionalCount = prompt.issues.length - requiredCount;
  return (
    <DialogShell
      actions={[
        { label: "取消", onClick: () => onClose(null) },
        { label: "不更新依赖", onClick: () => onClose("none") },
        { label: "更新必须", onClick: () => onClose("required"), variant: "primary" },
        { label: "更新全部", onClick: () => onClose("all"), variant: "primary" }
      ]}
      icon={<LoaderCircle size={18} />}
      onClose={() => onClose(null)}
      title={`${prompt.actionLabel}前依赖检查`}
    >
      <p>{`${prompt.targetName} ${prompt.actionLabel}后有 ${requiredCount} 个必需依赖、${optionalCount} 个可选依赖可能未满足。`}</p>
      <div className="dependency-preview-list">
        {prompt.issues.map((issue) => (
          <div className="dependency-preview-row" key={`${issue.optional ? "optional" : "required"}:${issue.dependency.name}`}>
            <strong>{issue.dependency.name}</strong>
            <span>{issue.optional ? "可选依赖" : "必需依赖"}</span>
            <small>{formatDependencyIssue(issue)}</small>
          </div>
        ))}
      </div>
    </DialogShell>
  );
}

function buildInstalledDependencyIndex(records: ModRecord[]) {
  const index = new Map<string, ModRecord>();
  for (const record of records) {
    for (const alias of [
      record.id,
      record.name,
      record.metadata.name,
      record.fileName,
      record.fileName.replace(/\.zip$/i, ""),
      record.relativePath
    ]) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) index.set(normalized, record);
    }
  }
  return index;
}

function updateCandidateFromRecord(entry: ModCatalogEntry, record: ModRecord): ModUpdateCandidate {
  return {
    entry,
    installed: {
      recordId: record.id,
      name: record.name,
      fileName: record.fileName,
      relativePath: record.relativePath,
      absolutePath: record.absolutePath,
      version: record.metadata.version,
      hash: ""
    },
    updateAvailable: true,
    reason: "依赖版本需要更新"
  };
}

function dependencyEntrySatisfies(entry: ModCatalogEntry, dependency: Dependency) {
  return entry.downloadUrl.trim().length > 0 && !versionTooLow(entry.version, dependency.version);
}

function formatDependencyIssue(issue: DependencyIssue) {
  const requiredVersion = issue.dependency.version.trim() || "未指定版本";
  if (issue.reason === "missing") return `缺少 ${requiredVersion}`;
  return `需要 ${requiredVersion}，本地 ${issue.installed?.metadata.version || "未知版本"}`;
}

function versionTooLow(installedVersion: string, requiredVersion: string) {
  const installed = parseNumericVersion(installedVersion);
  const required = parseNumericVersion(requiredVersion);
  if (!installed || !required) return false;
  return compareNumericVersions(installed, required) < 0;
}

function parseNumericVersion(value: string) {
  const matches = value.match(/\d+/g);
  return matches?.map((part) => Number.parseInt(part, 10)).filter((part) => Number.isFinite(part)) ?? null;
}

function compareNumericVersions(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isBuiltinDependencyName(name: string) {
  const normalized = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    isEverestDependencyName(name) ||
    normalized === "celeste" ||
    normalized === "monocle" ||
    normalized === "fna" ||
    normalized === "dotnet" ||
    normalized === "netframework" ||
    normalized === "microsoftnetframework"
  );
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
