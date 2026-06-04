import { LoaderCircle } from "lucide-react";
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
    savePathAndRefresh,
    savePathAndRescan,
    scan,
    selectPathAndRefresh,
    setLoading,
    setPathInput,
    setScan,
    updateAutoBackupCleanupEnabled,
    updateAutoBackupEnabled,
    updateAutoBackupRetentionCount,
    updateAutoCheckModUpdatesOnStartup,
    updateModCatalogSources,
    updateSelectedSaveFiles
  } = useCelePkgData();
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [modUpdateResult, setModUpdateResult] = useState<ModUpdateCheckResult>({ sources: [], updates: [], matched: [], warnings: [] });
  const [downloadTask, setDownloadTask] = useState<DownloadTask | null>(null);
  const [dependencyPrompt, setDependencyPrompt] = useState<DependencyPromptState | null>(null);
  const [everestDependencyPrompt, setEverestDependencyPrompt] = useState<EverestDependencyPromptState | null>(null);
  const downloadTaskRunner = useRef<DownloadTaskRunner | null>(null);
  const completedModUpdatePaths = useRef<Set<string>>(new Set());
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

  const checkUpdatesForMods = useCallback(
    async (mode: "manual" | "startup" = "manual") => {
      if (!celestePath.trim()) return;
      const startupMode = mode === "startup";
      const sources = modCatalogSources;
      const previousLoading = loading;
      if (!startupMode || !previousLoading) {
        setLoading(true, "正在检查 Mod 更新...");
      }
      try {
        const result = await checkModUpdates(celestePath, sources);
        setModUpdateResult(result);
        if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
        else if (result.updates.length) notifier.showSuccess(`发现 ${result.updates.length} 个可更新 Mod`);
        else if (!startupMode) notifier.showSuccess("本地 Mod 已是最新");
      } catch (error) {
        const message = readError(error);
        notifier.showError(message);
      } finally {
        if (!startupMode || !previousLoading) {
          setLoading(false);
        }
      }
    },
    [celestePath, loading, modCatalogSources, notifier, setLoading]
  );

  useEffect(() => {
    if (startupModUpdateCheckDone.current || !autoCheckModUpdatesOnStartup || loading || !celestePath.trim() || !scan.modsPath) return;
    startupModUpdateCheckDone.current = true;
    void checkUpdatesForMods("startup");
  }, [autoCheckModUpdatesOnStartup, celestePath, checkUpdatesForMods, loading, scan.modsPath]);

  async function updateSingleMod(candidate: ModUpdateCandidate) {
    if (!window.confirm(`更新 ${candidate.installed.name} 到 ${candidate.entry.version || "目录最新版本"}？`)) return;
    await updateModCandidate(candidate);
  }

  async function installEverestRelease(release: EverestRelease) {
    const version = `1.${release.version}.0`;
    if (!window.confirm(`安装 Everest ${version}？安装器会覆盖游戏目录中的 Everest 相关文件。`)) return;
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
    const candidates = orderUpdatesByDependencyChain([...downloadableModUpdates], recordsBeforeUpdate);
    if (!candidates.length) return;
    if (!window.confirm(`更新全部 ${candidates.length} 个 Mod？`)) return;
    completedModUpdatePaths.current.clear();
    const items = createModUpdateTaskDescriptors(candidates, recordsBeforeUpdate).map((descriptor) =>
      createModUpdateExecutableItem(descriptor.candidate, descriptor.dependsOn)
    );
    const runner = new DownloadTaskRunner(createOperationId("mod-update-task"), items, {
      concurrencyLimit: 3,
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
      if (downloadTaskRunner.current === runner) downloadTaskRunner.current = null;
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
    if (!window.confirm(`安装 ${entry.name}${entry.version ? ` ${entry.version}` : ""}？`)) return;
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
    return actions.map(dependencyActionToExecutableItem);
  }

  function dependencyActionToExecutableItem(action: DependencyUpdateAction): ExecutableDownloadTaskItem {
    if (action.kind === "everest") return createEverestExecutableItem(action.release);
    if (action.kind === "update") return createModUpdateExecutableItem(action.candidate);
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
      if (!window.confirm(`无法预览 ${targetName} ${actionLabel}后的依赖。仍然继续${actionLabel}？`)) return null;
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
      return window.confirm(
        `${targetName} ${actionLabel}需要 Everest ${requiredVersion} 或更高版本，当前版本 ${installedVersion}。\n\n未找到可自动更新的 Everest 版本，仍然继续${actionLabel}？`
      )
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
      const text = unavailable.map(formatDependencyIssue).join("\n");
      const actionText = plan.actionLabel === "安装" ? "安装" : "覆盖";
      if (!window.confirm(`以下依赖无法自动更新或安装：\n${text}\n\n仍然继续${actionText}目标 Mod？`)) return null;
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
      if (downloadTaskRunner.current === runner) downloadTaskRunner.current = null;
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

  async function cancelActiveModDownload() {
    const runner = downloadTaskRunner.current;
    if (runner) {
      try {
        await runner.cancel();
        notifier.showInfo("已请求取消当前下载任务");
      } catch (error) {
        notifier.showError(readError(error));
      }
      return;
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
          enabledFilter={filters.enabledFilter}
          enabledMapCount={workspaceView.enabledMapCount}
          enabledModCount={workspaceView.enabledModCount}
          helperMapCount={filters.helperMapMods.length}
          mapProfileName={workspaceView.mapProfileName}
          modProfileName={workspaceView.modProfileName}
          progressFilter={filters.progressFilter}
          query={filters.query}
          referenceFilter={filters.referenceFilter}
          showHelperMaps={filters.showHelperMaps}
          sortKey={filters.sortKey}
          mainMode={workspaceView.mainMode}
          mapDetailTab={uiLayout.mapDetailTab}
          mapDetailControls={mapDetailControls}
          totalMapCount={scan.maps.length}
          totalModCount={scan.otherMods.length}
          onActiveViewChange={workspaceView.changeActiveView}
          onEnabledFilterChange={filters.setEnabledFilter}
          onProgressFilterChange={filters.setProgressFilter}
          onQueryChange={filters.setQuery}
          onReferenceFilterChange={filters.setReferenceFilter}
          onShowHelperMapsChange={filters.setShowHelperMaps}
          onSortKeyChange={filters.setSortKey}
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
            onModCatalogSourcesChange={updateModCatalogSources}
            onSelectedSaveFilesChange={updateSelectedSaveFiles}
            onShowWarningColumnChange={uiLayout.setShowWarningColumn}
            onStrawberryDenominatorChange={uiLayout.setStrawberryDenominator}
          />
        ) : workspaceView.activeView === "backups" ? (
          <BackupManager
            autoBackupCleanupEnabled={autoBackupCleanupEnabled}
            backups={backups.backups}
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
          <DownloadManager task={downloadTask} onCancelTask={cancelActiveModDownload} />
        ) : workspaceView.activeView === "catalog" ? (
          <ModCatalogManager
            loading={loading}
            notifier={notifier}
            scan={scan}
            sources={modCatalogSources}
            setLoading={setLoading}
            onInstall={installCatalogEntry}
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
    <div className="confirm-dialog-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="everest-dependency-title">
        <div className="confirm-dialog-heading">
          <LoaderCircle size={18} />
          <h3 id="everest-dependency-title">需要更新 Everest</h3>
        </div>
        <p>{`${prompt.targetName} 需要 Everest ${requiredVersion} 或更高版本，当前版本 ${installedVersion}。`}</p>
        <p>{`可以先更新到 Everest ${updateVersion} 后继续，也可以忽略此检查继续。`}</p>
        <div className="confirm-dialog-actions">
          <button onClick={() => onClose(null)}>取消</button>
          <button onClick={() => onClose("ignore")}>忽略继续</button>
          <button className="confirm-primary-button" onClick={() => onClose("update")}>
            更新 Everest 后继续
          </button>
        </div>
      </section>
    </div>
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
    <div className="confirm-dialog-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="dependency-update-title">
        <div className="confirm-dialog-heading">
          <LoaderCircle size={18} />
          <h3 id="dependency-update-title">{prompt.actionLabel}前依赖检查</h3>
        </div>
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
        <div className="confirm-dialog-actions">
          <button onClick={() => onClose(null)}>取消</button>
          <button onClick={() => onClose("none")}>不更新依赖</button>
          <button className="confirm-primary-button" onClick={() => onClose("required")}>
            更新必须
          </button>
          <button className="confirm-primary-button" onClick={() => onClose("all")}>
            更新全部
          </button>
        </div>
      </section>
    </div>
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

function orderUpdatesByDependencyChain(candidates: ModUpdateCandidate[], recordsBeforeUpdate: ModRecord[]) {
  const installedIndex = buildInstalledDependencyIndex(recordsBeforeUpdate);
  const candidateByRecordId = new Map(candidates.map((candidate) => [candidate.installed.recordId, candidate]));
  const originalIndex = new Map(candidates.map((candidate, index) => [candidate.installed.recordId, index]));
  const ordered: ModUpdateCandidate[] = [];
  const state = new Map<string, "visiting" | "visited">();

  function visit(candidate: ModUpdateCandidate) {
    const recordId = candidate.installed.recordId;
    const currentState = state.get(recordId);
    if (currentState === "visited") return;
    if (currentState === "visiting") {
      ordered.push(candidate);
      state.set(recordId, "visited");
      return;
    }

    state.set(recordId, "visiting");
    const record = recordsBeforeUpdate.find((item) => item.id === recordId);
    if (record) {
      const dependencies = record.dependencies
        .map((dependency) => installedIndex.get(normalizeDependencyName(dependency.name)))
        .filter((dependencyRecord): dependencyRecord is ModRecord => Boolean(dependencyRecord))
        .map((dependencyRecord) => candidateByRecordId.get(dependencyRecord.id))
        .filter((dependencyCandidate): dependencyCandidate is ModUpdateCandidate => Boolean(dependencyCandidate))
        .sort((left, right) => (originalIndex.get(left.installed.recordId) ?? 0) - (originalIndex.get(right.installed.recordId) ?? 0));

      for (const dependencyCandidate of dependencies) {
        visit(dependencyCandidate);
      }
    }
    if (state.get(recordId) !== "visited") {
      state.set(recordId, "visited");
      ordered.push(candidate);
    }
  }

  for (const candidate of candidates) {
    visit(candidate);
  }

  return ordered;
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
