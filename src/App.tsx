import { useEffect, useMemo, useRef, useState } from "react";
import { BackupManager } from "./components/BackupManager";
import { DownloadManager } from "./components/DownloadManager";
import { EverestManager } from "./components/EverestManager";
import { MapDetail } from "./components/MapDetail";
import { ModCatalogManager } from "./components/ModCatalogManager";
import { ModDetail } from "./components/ModDetail";
import { ProfileManager } from "./components/ProfileManager";
import { RecordList } from "./components/RecordList";
import { SettingsManager } from "./components/SettingsManager";
import { AppToolbar } from "./components/AppToolbar";
import { WorkspaceNav } from "./components/WorkspaceNav";
import { AppOverlays } from "./components/AppOverlays";
import { WorkspaceLoadingOverlay } from "./components/WorkspaceLoadingOverlay";
import { openModLocation } from "./api";
import { useBackups } from "./hooks/useBackups";
import { useCelePkgData } from "./hooks/useCelePkgData";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useDownloadTaskControls } from "./hooks/useDownloadTaskControls";
import { useGameStatus } from "./hooks/useGameStatus";
import { useMapDetailControls, type MapDetailMemoryState } from "./hooks/useMapDetailControls";
import { useModDownloadProgressListener } from "./hooks/useModDownloadProgressListener";
import { useModInstallWorkflow } from "./hooks/useModInstallWorkflow";
import { useModFilters } from "./hooks/useModFilters";
import { useProfileDraft } from "./hooks/useProfileDraft";
import { useRecordActions } from "./hooks/useRecordActions";
import type { ScrollPosition } from "./hooks/useScrollMemory";
import { useUiLayout } from "./hooks/useUiLayout";
import { useWorkspaceView } from "./hooks/useWorkspaceView";
import { findDependencyReferencesByModId } from "./utils/dependencies";
import { isDraftEnabled, readError } from "./utils/format";
import { shouldWatchGameLaunch } from "./utils/gameStatusWatcher";
import type { ModRecord } from "./types";
import type { ActiveView } from "./viewTypes";

export function App() {
  const {
    autoBackupCleanupEnabled,
    autoBackupEnabled,
    autoBackupRetentionCount,
    autoCheckAppUpdatesOnStartup,
    autoCheckModUpdatesOnStartup,
    autoRefreshModCatalogCacheOnStartup,
    catalogCacheRefreshing,
    celestePath,
    clearNotice,
    configLoaded,
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
    updateAutoCheckAppUpdatesOnStartup,
    updateAutoCheckModUpdatesOnStartup,
    updateAutoRefreshModCatalogCacheOnStartup,
    updateModCatalogSources,
    updateSelectedSaveFiles
  } = useCelePkgData();
  const { appUpdateState, checkForAppUpdate, downloadAndInstallAppUpdate, relaunchApp } = useAppUpdate({
    autoCheckOnStartup: autoCheckAppUpdatesOnStartup,
    configLoaded,
    notifier
  });
  const [issuesOpen, setIssuesOpen] = useState(false);
  const mapDetailMemory = useRef<Record<string, MapDetailMemoryState>>({});
  const scrollMemory = useRef<Record<string, ScrollPosition>>({});
  const uiLayout = useUiLayout();
  const downloadTaskControls = useDownloadTaskControls({ notifier, setLoading });
  const {
    applyProgress,
    cancelTaskDownloads,
    cancelTaskInstalls,
    downloadControls,
    downloadTask,
    pauseTaskDownloads,
    pauseTaskInstalls,
    resumeTaskDownloads,
    resumeTaskInstalls,
    retryFailedDownloadTask,
    runExecutableDownloadTask,
    startDownloadTask
  } = downloadTaskControls;
  const modInstallWorkflow = useModInstallWorkflow({
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
  });
  const {
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
    modUpdatesByRecordId,
    requestAppConfirm,
    updateAllMods,
    updateSingleMod
  } = modInstallWorkflow;
  const gameStatus = useGameStatus({
    celestePath,
    configLoaded,
    notifier,
    requestAppConfirm,
    setLoading
  });
  const itemWarnings = useMemo(
    () => [...scan.maps, ...scan.otherMods].filter((record) => record.warnings.length),
    [scan.maps, scan.otherMods]
  );
  const issueCount = configWarnings.length + scan.warnings.length + itemWarnings.length;

  useEffect(() => {
    if (configWarnings.length && !celestePath.trim()) setIssuesOpen(true);
  }, [celestePath, configWarnings.length]);

  useModDownloadProgressListener(applyProgress);

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
  const dependencyReferences = useMemo(
    () => findDependencyReferencesByModId([...scan.maps, ...scan.otherMods], scan.otherMods),
    [scan.maps, scan.otherMods]
  );
  const referencedModIds = useMemo(() => new Set(dependencyReferences.requiredReferencesByModId.keys()), [dependencyReferences]);
  const optionalReferencedModIds = useMemo(() => new Set(dependencyReferences.optionalReferencesByModId.keys()), [dependencyReferences]);
  const downloadableUpdateRecordOrder = useMemo(
    () => new Map(downloadableModUpdates.map((candidate, index) => [candidate.installed.recordId, index])),
    [downloadableModUpdates]
  );
  const filters = useModFilters({
    enabledMapDraft: profileDraft.enabledMapDraft,
    enabledModDraft: profileDraft.enabledModDraft,
    downloadableUpdateRecordOrder,
    optionalReferencesByModId: dependencyReferences.optionalReferencesByModId,
    optionalReferencedModIds,
    requiredReferencesByModId: dependencyReferences.requiredReferencesByModId,
    referencedModIds,
    scan
  });
  const allRecords = useMemo(() => [...scan.maps, ...scan.otherMods], [scan.maps, scan.otherMods]);
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
    requiredReferencesByModId: dependencyReferences.requiredReferencesByModId,
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
  const writeActionsDisabled = gameStatus.gameBusy;
  const activeUpdateRecordIds = useMemo(
    () => new Set((showingModRecords ? filters.filteredMods : filters.filteredMaps).map((record) => record.id)),
    [filters.filteredMaps, filters.filteredMods, showingModRecords]
  );
  const activeDownloadableModUpdates = useMemo(
    () => downloadableModUpdates.filter((candidate) => activeUpdateRecordIds.has(candidate.installed.recordId)),
    [activeUpdateRecordIds, downloadableModUpdates]
  );

  async function openRecordLocation(record: ModRecord) {
    try {
      await openModLocation(record.absolutePath);
      notifier.showSuccess("已打开本地内容位置。");
    } catch (error) {
      notifier.showError(readError(error));
    }
  }

  async function launchSelectedProfiles() {
    const result = await profileDraft.launchSelectedProfiles();
    if (result && shouldWatchGameLaunch(result)) gameStatus.startWatchingGameLaunch(result.launchMethod);
  }

  async function launchOrStopGame() {
    if (gameStatus.canStopGame) {
      await gameStatus.stopGameWithConfirm();
      return;
    }
    const result = await profileDraft.launchCurrentGame();
    if (result && shouldWatchGameLaunch(result)) gameStatus.startWatchingGameLaunch(result.launchMethod);
  }

  return (
    <main className="app-shell">
      <AppToolbar
        celestePath={celestePath}
        loading={loading}
        loadingMessage={loadingMessage}
        canLaunch={Boolean(scan.gameExecutable)}
        canStopGame={gameStatus.canStopGame}
        gameLaunchPending={gameStatus.gameLaunchPending}
        gamePhase={gameStatus.gamePhase}
        gameRunning={gameStatus.gameRunning}
        gameStatusDetail={gameStatus.gameStatus.detail}
        issueCount={issueCount}
        scan={scan}
        onApplyAndLaunch={launchSelectedProfiles}
        onDirectLaunch={launchOrStopGame}
        onIssuesOpen={() => setIssuesOpen(true)}
        onPathBrowse={selectPathAndRefresh}
        onPathChange={setPathInput}
        onRefresh={savePathAndRefresh}
        onRescan={savePathAndRescan}
      />

      <section className={`workspace ${isManagementView(workspaceView.activeView) ? "management-view" : ""}`}>
        <WorkspaceNav
          activeView={workspaceView.activeView}
          dependencyModCount={profileDraft.dependencyModDraft.size}
          downloadTask={downloadTask}
          mapDependencyModCount={profileDraft.enabledMapModDraft.size + profileDraft.dependencyModDraft.size}
          enabledMapCount={workspaceView.enabledMapCount}
          enabledModCount={workspaceView.enabledModCount}
          mapProfileName={workspaceView.mapProfileName}
          modProfileName={workspaceView.modProfileName}
          totalMapCount={scan.maps.length}
          totalModCount={scan.otherMods.length}
          onActiveViewChange={workspaceView.changeActiveView}
        />

        {workspaceView.activeView === "profiles" ? (
          <ProfileManager
            enabledMapCount={workspaceView.enabledMapCount}
            enabledModCount={workspaceView.enabledModCount}
            dependencyModCount={profileDraft.dependencyModDraft.size}
            launchArgs={profileDraft.launchArgs}
            loading={loading}
            writeActionsDisabled={writeActionsDisabled}
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
            autoCheckAppUpdatesOnStartup={autoCheckAppUpdatesOnStartup}
            autoCheckModUpdatesOnStartup={autoCheckModUpdatesOnStartup}
            autoRefreshModCatalogCacheOnStartup={autoRefreshModCatalogCacheOnStartup}
            appUpdateState={appUpdateState}
            catalogCacheRefreshing={catalogCacheRefreshing}
            loading={loading}
            modCatalogSourceEnabledCount={modCatalogSourceEnabledCount}
            modCatalogSourceOrder={modCatalogSourceOrder}
            saveFiles={scan.availableSaveFiles}
            selectedSaveFiles={scan.selectedSaveFiles}
            showWarningColumn={uiLayout.showWarningColumn}
            strawberryDenominator={uiLayout.strawberryDenominator}
            onAppUpdateCheck={checkForAppUpdate}
            onAppUpdateDownloadAndInstall={downloadAndInstallAppUpdate}
            onAppUpdateRelaunch={relaunchApp}
            onAutoCheckAppUpdatesOnStartupChange={updateAutoCheckAppUpdatesOnStartup}
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
            writeActionsDisabled={writeActionsDisabled}
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
            writeActionsDisabled={writeActionsDisabled}
            onInstall={installCatalogEntry}
            onRetryFailed={retryFailedDownloadTask}
          />
        ) : workspaceView.activeView === "everest" ? (
          <EverestManager
            loading={loading}
            mods={scan.otherMods}
            notifier={notifier}
            writeActionsDisabled={writeActionsDisabled}
            onInstall={installEverestRelease}
          />
        ) : workspaceView.mainMode === "detail" && workspaceView.activeView === "maps" ? (
          <MapDetail
            activeTab={uiLayout.mapDetailTab}
            allRecords={allRecords}
            map={workspaceView.selectedMap}
            optionalReferences={dependencyReferences.optionalReferencesByModId.get(workspaceView.selectedMap?.id ?? "") ?? []}
            requiredReferences={dependencyReferences.requiredReferencesByModId.get(workspaceView.selectedMap?.id ?? "") ?? []}
            mapDetailControls={mapDetailControls}
            strawberryDenominator={uiLayout.strawberryDenominator}
            draftEnabled={
              workspaceView.selectedMap
                ? isDraftEnabled(workspaceView.selectedMap, profileDraft.enabledMapDraft, profileDraft.enabledModDraft)
                : false
            }
            scrollMemory={scrollMemory}
            onBack={workspaceView.showList}
            onLocationOpen={openRecordLocation}
            onTabChange={uiLayout.setMapDetailTab}
          />
        ) : workspaceView.mainMode === "detail" && workspaceView.activeView === "mods" ? (
          <ModDetail
            activeTab={uiLayout.modDetailTab}
            allRecords={allRecords}
            modItem={workspaceView.selectedMod}
            optionalReferences={dependencyReferences.optionalReferencesByModId.get(workspaceView.selectedMod?.id ?? "") ?? []}
            requiredReferences={dependencyReferences.requiredReferencesByModId.get(workspaceView.selectedMod?.id ?? "") ?? []}
            draftEnabled={
              workspaceView.selectedMod
                ? workspaceView.selectedMod.readOnly || profileDraft.enabledModDraft.has(workspaceView.selectedMod.id)
                : false
            }
            scrollMemory={scrollMemory}
            onBack={workspaceView.showList}
            onLocationOpen={openRecordLocation}
            onTabChange={uiLayout.setModDetailTab}
          />
        ) : (
          <RecordList
            activeView={workspaceView.activeView}
            enabledFilter={showingModRecords ? filters.modEnabledFilter : filters.mapEnabledFilter}
            filteredMaps={filters.filteredMaps}
            filteredMods={filters.filteredMods}
            helperMapCount={filters.helperMapMods.length}
            progressFilter={showingModRecords ? filters.modProgressFilter : filters.mapProgressFilter}
            query={filters.query}
            referenceFilter={filters.modReferenceFilter}
            selectedMap={workspaceView.selectedMap}
            selectedMod={workspaceView.selectedMod}
            showHelperMaps={filters.showHelperMaps}
            showWarningColumn={uiLayout.showWarningColumn}
            sortKey={filters.mapSortKey}
            strawberryDenominator={uiLayout.strawberryDenominator}
            visibleMapCount={filters.visibleMapRecords.length}
            modCount={scan.otherMods.length}
            scrollMemory={scrollMemory}
            loading={loading && !showWorkspaceLoading}
            loadingMessage={loadingMessage}
            modUpdateChecking={modUpdateChecking}
            modUpdateCount={activeDownloadableModUpdates.length}
            modUpdatesByRecordId={modUpdatesByRecordId}
            recordSearchMatches={filters.recordSearchMatches}
            requiredReferencesByModId={dependencyReferences.requiredReferencesByModId}
            writeActionsDisabled={writeActionsDisabled}
            onDisableAll={recordActions.disableAllInCurrentView}
            onEnableAll={recordActions.enableAllInCurrentView}
            onCheckModUpdates={checkUpdatesForMods}
            onEnabledFilterChange={showingModRecords ? filters.setModEnabledFilter : filters.setMapEnabledFilter}
            onMapSelect={workspaceView.selectMap}
            onMapToggle={recordActions.toggleMapLikeRecord}
            onModSelect={workspaceView.selectMod}
            onModToggle={recordActions.toggleModRecord}
            onModUpdate={updateSingleMod}
            onProgressFilterChange={showingModRecords ? filters.setModProgressFilter : filters.setMapProgressFilter}
            onQueryChange={filters.setQuery}
            onRecordViewChange={workspaceView.changeActiveView}
            onReferenceFilterChange={filters.setModReferenceFilter}
            onShowHelperMapsChange={filters.setShowHelperMaps}
            onSortKeyChange={filters.setMapSortKey}
            onUpdateAllMods={() => updateAllMods(activeDownloadableModUpdates)}
            onFavoriteToggle={recordActions.updateRecordFavorite}
            onProtectedToggle={recordActions.updateRecordProtected}
            isMapEnabled={recordActions.isMapEnabled}
            isModEnabled={recordActions.isModEnabled}
          />
        )}

        {showWorkspaceLoading && <WorkspaceLoadingOverlay message={loadingMessage} />}
      </section>

      <AppOverlays
        configWarnings={configWarnings}
        confirmPrompt={confirmPrompt}
        dependencyPrompt={dependencyPrompt}
        dependencyTreePrompt={dependencyTreePrompt}
        everestDependencyPrompt={everestDependencyPrompt}
        issuesOpen={issuesOpen}
        itemWarnings={itemWarnings}
        notice={notice}
        scanWarnings={scan.warnings}
        onConfirmPromptClose={closeConfirmPrompt}
        onDependencyPromptClose={closeDependencyPrompt}
        onDependencyTreePromptClose={closeDependencyTreePrompt}
        onEverestDependencyPromptClose={closeEverestDependencyPrompt}
        onIssuesClose={() => setIssuesOpen(false)}
        onNoticeClose={clearNotice}
      />
    </main>
  );
}

function isManagementView(view: ActiveView) {
  return (
    view === "profiles" || view === "settings" || view === "backups" || view === "downloads" || view === "everest" || view === "catalog"
  );
}

function isWorkspaceLoadingMessage(message: string) {
  return message.includes("扫描") || message.includes("缓存") || message.includes("存档统计");
}
