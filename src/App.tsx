import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkModUpdates, createOperationId, updateMod } from "./api";
import { BackupManager } from "./components/BackupManager";
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
import type { ModDownloadProgress, ModUpdateCandidate, ModUpdateCheckResult } from "./types";
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
  const activeDownloadOperationId = useRef<string | null>(null);
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

  async function updateAllMods() {
    const candidates = [...downloadableModUpdates];
    if (!candidates.length) return;
    if (!window.confirm(`更新全部 ${candidates.length} 个 Mod？`)) return;
    try {
      for (const [index, candidate] of candidates.entries()) {
        const operationId = createOperationId("mod-update");
        startModDownloadProgress(candidate, operationId, `${index + 1}/${candidates.length}`);
        setLoading(true, `正在更新 Mod (${index + 1}/${candidates.length})...`);
        const result = await updateMod(celestePath, candidate.entry, candidate.installed.absolutePath, operationId);
        clearMockDownloadTimer();
        setScan(result.scan);
        removeUpdatedCandidate(candidate);
        finishModDownloadProgress(operationId, index === candidates.length - 1 ? 800 : 0);
      }
      notifier.showSuccess(`已更新 ${candidates.length} 个 Mod`);
    } catch (error) {
      const message = readError(error);
      markDownloadProgressError();
      notifier.showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function updateModCandidate(candidate: ModUpdateCandidate) {
    const operationId = createOperationId("mod-update");
    try {
      startModDownloadProgress(candidate, operationId);
      setLoading(true, `正在更新 ${candidate.installed.name}...`);
      const result = await updateMod(celestePath, candidate.entry, candidate.installed.absolutePath, operationId);
      clearMockDownloadTimer();
      setScan(result.scan);
      removeUpdatedCandidate(candidate);
      finishModDownloadProgress(operationId, 800);
      notifier.showSuccess(`已更新 ${candidate.installed.name}`);
    } catch (error) {
      const message = readError(error);
      markDownloadProgressError();
      notifier.showError(message);
    } finally {
      setLoading(false);
    }
  }

  function startModDownloadProgress(candidate: ModUpdateCandidate, operationId: string, batchLabel = "") {
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
      url: candidate.entry.downloadUrl
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
        if (downloaded >= total) return { ...current, phase: "verifying", downloaded: total, total };
        return { ...current, downloaded, total };
      });
      if (downloaded >= total) clearMockDownloadTimer();
    }, 75);
  }

  function removeUpdatedCandidate(candidate: ModUpdateCandidate) {
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
            modCatalogSources={modCatalogSources}
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
            celestePath={celestePath}
            loading={loading}
            notifier={notifier}
            scan={scan}
            sources={modCatalogSources}
            setLoading={setLoading}
            setScan={setScan}
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
            draftEnabled={workspaceView.selectedMod ? profileDraft.enabledModDraft.has(workspaceView.selectedMod.id) : false}
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
      <ToastHost notice={notice} onClose={clearNotice} />
    </main>
  );
}

function isWorkspaceLoadingMessage(message: string) {
  return message.includes("扫描") || message.includes("缓存") || message.includes("存档统计");
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
    url: typeof object.url === "string" ? object.url : ""
  };
}
