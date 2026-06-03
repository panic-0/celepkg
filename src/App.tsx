import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkModUpdates, updateMod } from "./api";
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
import type { ModCatalogSourceKind, ModUpdateCandidate, ModUpdateCheckResult } from "./types";
import { isDraftEnabled, readError } from "./utils/format";

const defaultModUpdateSources: ModCatalogSourceKind[] = ["everestMirror", "wegfan"];

export function App() {
  const {
    autoBackupCleanupEnabled,
    autoBackupEnabled,
    autoBackupRetentionCount,
    celestePath,
    clearNotice,
    configWarnings,
    loading,
    loadingMessage,
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
    updateSelectedSaveFiles
  } = useCelePkgData();
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [modUpdateResult, setModUpdateResult] = useState<ModUpdateCheckResult>({ sources: [], updates: [], matched: [], warnings: [] });
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

  useEffect(() => {
    if (configWarnings.length && !celestePath.trim()) setIssuesOpen(true);
  }, [celestePath, configWarnings.length]);

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

  async function checkUpdatesForMods() {
    try {
      setLoading(true, "正在检查 Mod 更新...");
      const result = await checkModUpdates(celestePath, defaultModUpdateSources);
      setModUpdateResult(result);
      if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
      else notifier.showSuccess(result.updates.length ? `发现 ${result.updates.length} 个可更新 Mod` : "本地 Mod 已是最新");
    } catch (error) {
      const message = readError(error);
      notifier.showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function updateSingleMod(candidate: ModUpdateCandidate) {
    if (!window.confirm(`更新 ${candidate.installed.name} 到 ${candidate.entry.version || "目录最新版本"}？`)) return;
    await updateModCandidate(candidate);
  }

  async function updateAllMods() {
    const candidates = [...modUpdateResult.updates];
    if (!candidates.length) return;
    if (!window.confirm(`更新全部 ${candidates.length} 个 Mod？`)) return;
    try {
      for (const [index, candidate] of candidates.entries()) {
        setLoading(true, `正在更新 ${candidate.installed.name} (${index + 1}/${candidates.length})...`);
        const result = await updateMod(celestePath, candidate.entry, candidate.installed.absolutePath);
        setScan(result.scan);
        removeUpdatedCandidate(candidate);
      }
      notifier.showSuccess(`已更新 ${candidates.length} 个 Mod`);
    } catch (error) {
      const message = readError(error);
      notifier.showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function updateModCandidate(candidate: ModUpdateCandidate) {
    try {
      setLoading(true, `正在更新 ${candidate.installed.name}...`);
      const result = await updateMod(celestePath, candidate.entry, candidate.installed.absolutePath);
      setScan(result.scan);
      removeUpdatedCandidate(candidate);
      notifier.showSuccess(`已更新 ${candidate.installed.name}`);
    } catch (error) {
      const message = readError(error);
      notifier.showError(message);
    } finally {
      setLoading(false);
    }
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
            loading={loading}
            saveFiles={scan.availableSaveFiles}
            selectedSaveFiles={scan.selectedSaveFiles}
            showWarningColumn={uiLayout.showWarningColumn}
            strawberryDenominator={uiLayout.strawberryDenominator}
            onSelectedSaveFilesChange={updateSelectedSaveFiles}
            onShowWarningColumnChange={uiLayout.setShowWarningColumn}
            onStrawberryDenominatorChange={uiLayout.setStrawberryDenominator}
          />
        ) : workspaceView.activeView === "backups" ? (
          <BackupManager
            autoBackupCleanupEnabled={autoBackupCleanupEnabled}
            autoBackupEnabled={autoBackupEnabled}
            autoBackupRetentionCount={autoBackupRetentionCount}
            backups={backups.backups}
            celestePath={celestePath}
            loading={loading}
            onAutoBackupCleanupEnabledChange={updateAutoBackupCleanupEnabled}
            onAutoBackupEnabledChange={updateAutoBackupEnabled}
            onAutoBackupRetentionCountChange={updateAutoBackupRetentionCount}
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
            modUpdateCount={modUpdateResult.updates.length}
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
