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
import { useBackups } from "./hooks/useBackups";
import { useCelePkgData } from "./hooks/useCelePkgData";
import { useDownloadTaskControls } from "./hooks/useDownloadTaskControls";
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
import { isDraftEnabled } from "./utils/format";
import type { ActiveView } from "./viewTypes";

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
    closeEverestDependencyPrompt,
    confirmPrompt,
    dependencyPrompt,
    downloadableModUpdates,
    everestDependencyPrompt,
    installCatalogEntry,
    installEverestRelease,
    modUpdateChecking,
    modUpdatesByRecordId,
    updateAllMods,
    updateSingleMod
  } = modInstallWorkflow;
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
  const filters = useModFilters({
    enabledMapDraft: profileDraft.enabledMapDraft,
    enabledModDraft: profileDraft.enabledModDraft,
    scan
  });
  const dependencyReferences = useMemo(
    () => findDependencyReferencesByModId([...scan.maps, ...scan.otherMods], scan.otherMods),
    [scan.maps, scan.otherMods]
  );
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

      <section className={`workspace ${isManagementView(workspaceView.activeView) ? "management-view" : ""}`}>
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
            onTabChange={uiLayout.setMapDetailTab}
          />
        ) : workspaceView.mainMode === "detail" && workspaceView.activeView === "mods" ? (
          <ModDetail
            activeTab={uiLayout.modDetailTab}
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
            requiredReferencesByModId={dependencyReferences.requiredReferencesByModId}
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

        {showWorkspaceLoading && <WorkspaceLoadingOverlay message={loadingMessage} />}
      </section>

      <AppOverlays
        configWarnings={configWarnings}
        confirmPrompt={confirmPrompt}
        dependencyPrompt={dependencyPrompt}
        everestDependencyPrompt={everestDependencyPrompt}
        issuesOpen={issuesOpen}
        itemWarnings={itemWarnings}
        notice={notice}
        scanWarnings={scan.warnings}
        onConfirmPromptClose={closeConfirmPrompt}
        onDependencyPromptClose={closeDependencyPrompt}
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
