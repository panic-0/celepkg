import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelModDownload,
  checkModUpdates,
  createOperationId,
  installEverest,
  installMod,
  previewModUpdateMetadata,
  searchModCatalog,
  updateMod
} from "./api";
import { BackupManager } from "./components/BackupManager";
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
import { dedupeDependencyActions, dedupeDependencyIssues, dependencyActionKey } from "./utils/dependencyUpdateDedupe";
import { isDraftEnabled, readError } from "./utils/format";
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
  const [modDownloadProgress, setModDownloadProgress] = useState<ModDownloadProgress | null>(null);
  const [modDownloadBatchLabel, setModDownloadBatchLabel] = useState("");
  const [dependencyPrompt, setDependencyPrompt] = useState<DependencyPromptState | null>(null);
  const activeDownloadOperationId = useRef<string | null>(null);
  const completedModUpdatePaths = useRef<Set<string>>(new Set());
  const dependencyActionPromises = useRef<Map<string, Promise<boolean>>>(new Map());
  const startupModUpdateCheckDone = useRef(false);
  const mapDetailMemory = useRef<Record<string, MapDetailMemoryState>>({});
  const mockDownloadTimer = useRef<number | null>(null);
  const progressClearTimer = useRef<number | null>(null);
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
          if (!progress || activeDownloadOperationId.current !== progress.operationId) return;
          setModDownloadProgress((current) => ({
            ...progress,
            modName: progress.modName || current?.modName || ""
          }));
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

  useEffect(() => {
    return () => {
      if (mockDownloadTimer.current !== null) window.clearInterval(mockDownloadTimer.current);
      if (progressClearTimer.current !== null) window.clearTimeout(progressClearTimer.current);
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
    const operationId = createOperationId("everest");
    try {
      startEverestDownloadProgress(release, operationId);
      setLoading(true, `正在安装 Everest ${version}...`);
      const result = await installEverest(celestePath, release, operationId);
      clearMockDownloadTimer();
      setScan(result.scan);
      finishModDownloadProgress(operationId, 1200);
      notifier.showSuccess(`已安装 Everest ${version}`);
    } catch (error) {
      const message = readError(error);
      markDownloadProgressError();
      notifier.showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function updateAllMods() {
    const recordsBeforeUpdate = [...scan.maps, ...scan.otherMods];
    const candidates = orderUpdatesByDependencyChain([...downloadableModUpdates], recordsBeforeUpdate);
    if (!candidates.length) return;
    if (!window.confirm(`更新全部 ${candidates.length} 个 Mod？`)) return;
    let updatedCount = 0;
    completedModUpdatePaths.current.clear();
    try {
      for (const [index, candidate] of candidates.entries()) {
        if (completedModUpdatePaths.current.has(candidate.installed.absolutePath)) continue;
        const updated = await performModUpdate(
          candidate,
          `${index + 1}/${candidates.length}`,
          `正在更新 Mod (${index + 1}/${candidates.length})...`,
          index + 1,
          candidates.length
        );
        if (updated) updatedCount += 1;
      }
      notifier.showSuccess(`已更新 ${updatedCount} 个 Mod`);
    } catch (error) {
      const message = readError(error);
      markDownloadProgressError();
      notifier.showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function updateModCandidate(candidate: ModUpdateCandidate, batchLabel = "") {
    const dependencyPlan = await prepareDependencyUpdates(candidate);
    if (!dependencyPlan) return false;
    const dependenciesUpdated = await applyDependencyPlan(dependencyPlan);
    if (!dependenciesUpdated) return false;
    return await performModUpdate(
      candidate,
      batchLabel,
      batchLabel ? `正在更新 Mod (${batchLabel})...` : `正在更新 ${candidate.installed.name}...`
    );
  }

  async function installCatalogEntry(entry: ModCatalogEntry) {
    if (!window.confirm(`安装 ${entry.name}${entry.version ? ` ${entry.version}` : ""}？`)) return;
    const dependencyPlan = await prepareDependencyInstall(entry);
    if (!dependencyPlan) return false;
    const dependenciesUpdated = await applyDependencyPlan(dependencyPlan);
    if (!dependenciesUpdated) return false;
    return await performCatalogInstall(entry, `正在安装 ${entry.name}...`, `已安装 ${entry.name}`);
  }

  async function performModUpdate(
    candidate: ModUpdateCandidate,
    batchLabel = "",
    message = `正在更新 ${candidate.installed.name}...`,
    taskIndex = 1,
    taskTotal = 1
  ) {
    const operationId = createOperationId("mod-update");
    try {
      startModDownloadProgress(candidate, operationId, batchLabel, taskIndex, taskTotal);
      setLoading(true, message);
      const result = await updateMod(celestePath, candidate.entry, candidate.installed.absolutePath, operationId, taskIndex, taskTotal);
      clearMockDownloadTimer();
      setScan(result.scan);
      removeUpdatedCandidate(candidate);
      finishModDownloadProgress(operationId, 800);
      notifier.showSuccess(`已更新 ${candidate.installed.name}`);
      return true;
    } catch (error) {
      const message = readError(error);
      markDownloadProgressError();
      notifier.showError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function prepareDependencyUpdates(candidate: ModUpdateCandidate): Promise<DependencyUpdatePlan | null> {
    return await prepareDependencyPlan(candidate.entry, candidate.installed.name, "更新");
  }

  async function prepareDependencyInstall(entry: ModCatalogEntry): Promise<DependencyUpdatePlan | null> {
    return await prepareDependencyPlan(entry, entry.name, "安装");
  }

  async function prepareDependencyPlan(
    entry: ModCatalogEntry,
    targetName: string,
    actionLabel: DependencyActionLabel
  ): Promise<DependencyUpdatePlan | null> {
    let metadata;
    try {
      setLoading(true, `正在检查 ${targetName} 的依赖...`);
      metadata = await previewModUpdateMetadata(celestePath, entry);
    } catch (error) {
      const message = readError(error);
      notifier.showWarning(message);
      if (!window.confirm(`无法预览 ${targetName} ${actionLabel}后的依赖。仍然继续${actionLabel}？`)) return null;
      return { actionLabel, choice: "none", issues: [], targetName };
    } finally {
      setLoading(false);
    }

    const issues = dependencyIssuesForMetadata(metadata.dependencies, false).concat(
      dependencyIssuesForMetadata(metadata.optionalDependencies, true)
    );
    if (!issues.length) return { actionLabel, choice: "none", issues: [], targetName };

    const choice = await requestDependencyChoice(targetName, actionLabel, issues);
    if (!choice) return null;
    return { actionLabel, choice, issues, targetName };
  }

  async function applyDependencyPlan(plan: DependencyUpdatePlan) {
    if (plan.choice === "none") return true;
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
      if (!window.confirm(`以下依赖无法自动更新或安装：\n${text}\n\n仍然继续${actionText}目标 Mod？`)) return false;
    }
    for (const action of dedupeDependencyActions(actions)) {
      const result = await runDependencyAction(action);
      if (!result) return false;
    }
    return true;
  }

  async function runDependencyAction(action: DependencyUpdateAction) {
    const key = dependencyActionKey(action);
    const existing = dependencyActionPromises.current.get(key);
    if (existing) return await existing;
    const promise =
      action.kind === "update"
        ? performModUpdate(action.candidate, "", `正在更新依赖 ${action.name}...`)
        : performDependencyInstall(action.entry);
    dependencyActionPromises.current.set(key, promise);
    try {
      return await promise;
    } finally {
      if (dependencyActionPromises.current.get(key) === promise) {
        dependencyActionPromises.current.delete(key);
      }
    }
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

  async function performDependencyInstall(entry: ModCatalogEntry) {
    return await performCatalogInstall(entry, `正在安装依赖 ${entry.name}...`, `已安装依赖 ${entry.name}`);
  }

  async function performCatalogInstall(entry: ModCatalogEntry, message: string, successMessage: string) {
    const operationId = createOperationId("mod-install");
    try {
      startCatalogDownloadProgress(entry, operationId);
      setLoading(true, message);
      const result = await installMod(celestePath, entry, operationId);
      clearMockDownloadTimer();
      setScan(result.scan);
      finishModDownloadProgress(operationId, 800);
      notifier.showSuccess(successMessage);
      return true;
    } catch (error) {
      const message = readError(error);
      markDownloadProgressError();
      notifier.showError(message);
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

  function startModDownloadProgress(candidate: ModUpdateCandidate, operationId: string, batchLabel = "", taskIndex = 1, taskTotal = 1) {
    clearMockDownloadTimer();
    clearProgressClearTimer();
    activeDownloadOperationId.current = operationId;
    setModDownloadBatchLabel(batchLabel);
    const initialProgress: ModDownloadProgress = {
      operationId,
      modName: candidate.installed.name || candidate.entry.name,
      phase: "downloading",
      downloaded: 0,
      total: candidate.entry.size,
      speedBytesPerSec: 0,
      taskIndex,
      taskTotal,
      url: candidate.entry.downloadUrl
    };
    setModDownloadProgress(initialProgress);
    if (isMockMode()) runMockDownloadProgress(initialProgress);
  }

  function startCatalogDownloadProgress(entry: ModCatalogEntry, operationId: string) {
    clearMockDownloadTimer();
    clearProgressClearTimer();
    activeDownloadOperationId.current = operationId;
    setModDownloadBatchLabel("");
    const initialProgress: ModDownloadProgress = {
      operationId,
      modName: entry.name,
      phase: "downloading",
      downloaded: 0,
      total: entry.size,
      speedBytesPerSec: 0,
      taskIndex: 1,
      taskTotal: 1,
      url: entry.downloadUrl
    };
    setModDownloadProgress(initialProgress);
    if (isMockMode()) runMockDownloadProgress(initialProgress);
  }

  function startEverestDownloadProgress(release: EverestRelease, operationId: string) {
    clearMockDownloadTimer();
    clearProgressClearTimer();
    activeDownloadOperationId.current = operationId;
    setModDownloadBatchLabel("");
    const initialProgress: ModDownloadProgress = {
      operationId,
      modName: "Everest",
      phase: "downloading",
      downloaded: 0,
      total: release.mainFileSize,
      speedBytesPerSec: 0,
      taskIndex: 1,
      taskTotal: 1,
      url: release.mirrorDownload || release.mainDownload
    };
    setModDownloadProgress(initialProgress);
    if (isMockMode()) runMockDownloadProgress(initialProgress);
  }

  function finishModDownloadProgress(operationId: string, clearDelay: number) {
    clearMockDownloadTimer();
    setModDownloadProgress((current) => {
      if (!current || current.operationId !== operationId) return current;
      const completedTotal = current.total ?? (current.downloaded || 1);
      return { ...current, phase: "done", downloaded: completedTotal, total: completedTotal };
    });
    if (clearDelay > 0) scheduleProgressClear(operationId, clearDelay);
  }

  function markDownloadProgressError() {
    clearMockDownloadTimer();
    setModDownloadProgress((current) => (current ? { ...current, phase: "error" } : current));
    const operationId = activeDownloadOperationId.current;
    if (operationId) scheduleProgressClear(operationId, 1800);
  }

  function scheduleProgressClear(operationId: string, delay: number) {
    clearProgressClearTimer();
    progressClearTimer.current = window.setTimeout(() => {
      if (activeDownloadOperationId.current !== operationId) return;
      activeDownloadOperationId.current = null;
      setModDownloadBatchLabel("");
      setModDownloadProgress(null);
    }, delay);
  }

  function clearMockDownloadTimer() {
    if (mockDownloadTimer.current === null) return;
    window.clearInterval(mockDownloadTimer.current);
    mockDownloadTimer.current = null;
  }

  function clearProgressClearTimer() {
    if (progressClearTimer.current === null) return;
    window.clearTimeout(progressClearTimer.current);
    progressClearTimer.current = null;
  }

  function runMockDownloadProgress(initialProgress: ModDownloadProgress) {
    const total = initialProgress.total ?? 12 * 1024 * 1024;
    const step = Math.max(256 * 1024, Math.floor(total / 14));
    let downloaded = 0;
    mockDownloadTimer.current = window.setInterval(() => {
      downloaded = Math.min(total, downloaded + step);
      setModDownloadProgress((current) => {
        if (!current || current.operationId !== initialProgress.operationId || current.phase !== "downloading") return current;
        const speedBytesPerSec = step / 0.075;
        if (downloaded >= total) return { ...current, phase: "verifying", downloaded: total, total, speedBytesPerSec: 0 };
        return { ...current, downloaded, total, speedBytesPerSec };
      });
      if (downloaded >= total) clearMockDownloadTimer();
    }, 75);
  }

  async function cancelActiveModDownload() {
    const operationId = activeDownloadOperationId.current;
    if (!operationId) return;
    try {
      const cancelled = await cancelModDownload(operationId);
      if (!cancelled) {
        notifier.showInfo("下载任务已结束或不存在");
        scheduleProgressClear(operationId, 800);
        return;
      }
      clearMockDownloadTimer();
      setModDownloadProgress((current) => (current && current.operationId === operationId ? { ...current, phase: "error" } : current));
      notifier.showInfo("已请求取消当前下载");
    } catch (error) {
      notifier.showError(readError(error));
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
          <EverestManager
            loading={loading}
            mods={scan.otherMods}
            notifier={notifier}
            progress={modDownloadProgress}
            onCancelDownload={cancelActiveModDownload}
            onInstall={installEverestRelease}
          />
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
            modDownloadBatchLabel={modDownloadBatchLabel}
            modDownloadProgress={modDownloadProgress}
            modUpdateCount={downloadableModUpdates.length}
            modUpdatesByRecordId={modUpdatesByRecordId}
            onDisableAll={recordActions.disableAllInCurrentView}
            onEnableAll={recordActions.enableAllInCurrentView}
            onCheckModUpdates={checkUpdatesForMods}
            onCancelModDownload={cancelActiveModDownload}
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
      <ToastHost notice={notice} onClose={clearNotice} />
    </main>
  );
}

function isWorkspaceLoadingMessage(message: string) {
  return message.includes("扫描") || message.includes("缓存") || message.includes("存档统计");
}

type DependencyUpdateChoice = "none" | "required" | "all";
type DependencyActionLabel = "安装" | "更新";

type DependencyIssue = {
  dependency: Dependency;
  installed?: ModRecord;
  optional: boolean;
  reason: "missing" | "tooLow";
};

type DependencyUpdateAction =
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
    normalized.startsWith("everest") ||
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
