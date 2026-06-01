import { AlertTriangle } from "lucide-react";
import { useRef } from "react";
import { BackupManager } from "./components/BackupManager";
import { MapDetail, type MapDetailMemoryState } from "./components/MapDetail";
import { ModDetail } from "./components/ModDetail";
import { ProfileManager } from "./components/ProfileManager";
import { RecordList } from "./components/RecordList";
import { AppToolbar } from "./components/AppToolbar";
import { WorkspaceNav } from "./components/WorkspaceNav";
import { useBackups } from "./hooks/useBackups";
import { useCelePkgData } from "./hooks/useCelePkgData";
import { useModFilters } from "./hooks/useModFilters";
import { useProfileDraft } from "./hooks/useProfileDraft";
import { useRecordActions } from "./hooks/useRecordActions";
import type { ScrollPosition } from "./hooks/useScrollMemory";
import { useUiLayout } from "./hooks/useUiLayout";
import { useWorkspaceView } from "./hooks/useWorkspaceView";
import { isDraftEnabled } from "./utils/format";

export function App() {
  const {
    autoBackupEnabled,
    celestePath,
    loading,
    message,
    refresh,
    savePathAndRefresh,
    scan,
    setLoading,
    setMessage,
    setPathInput,
    setScan,
    updateAutoBackupEnabled,
    updateSelectedSaveFiles
  } = useCelePkgData();
  const mapDetailMemory = useRef<Record<string, MapDetailMemoryState>>({});
  const scrollMemory = useRef<Record<string, ScrollPosition>>({});
  const uiLayout = useUiLayout();
  const backups = useBackups({
    celestePath,
    refresh,
    setLoading,
    setMessage
  });

  const profileDraft = useProfileDraft({
    celestePath,
    scan,
    setLoading,
    setMessage,
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
  const recordActions = useRecordActions({
    activeView: workspaceView.activeView,
    celestePath,
    dependencyModDraft: profileDraft.dependencyModDraft,
    enabledMapDraft: profileDraft.enabledMapDraft,
    enabledModDraft: profileDraft.enabledModDraft,
    filteredMaps: filters.filteredMaps,
    filteredMods: filters.filteredMods,
    scan,
    setEnabledExplicitModDraft: profileDraft.setEnabledExplicitModDraft,
    setEnabledMapDraft: profileDraft.setEnabledMapDraft,
    setEnabledMapModDraft: profileDraft.setEnabledMapModDraft,
    setLoading,
    setMessage,
    setScan,
    toggleMap: profileDraft.toggleMap,
    toggleMapMod: profileDraft.toggleMapMod,
    toggleMod: profileDraft.toggleMod
  });

  return (
    <main className="app-shell">
      <AppToolbar
        celestePath={celestePath}
        loading={loading}
        canLaunch={Boolean(scan.gameExecutable)}
        enabledMapCount={workspaceView.enabledMapCount}
        enabledModCount={workspaceView.enabledModCount}
        scan={scan}
        onLaunch={profileDraft.launchSelectedProfiles}
        onPathChange={setPathInput}
        onRefresh={savePathAndRefresh}
      />

      <section className={`workspace ${workspaceView.activeView === "profiles" || workspaceView.activeView === "backups" ? "management-view" : ""}`}>
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
          referencedModCount={filters.referencedModIds.size}
          saveFiles={scan.availableSaveFiles}
          selectedSaveFiles={scan.selectedSaveFiles}
          showHelperMaps={filters.showHelperMaps}
          showOnlyUnreferencedMods={filters.showOnlyUnreferencedMods}
          showWarningColumn={uiLayout.showWarningColumn}
          sortKey={filters.sortKey}
          totalMapCount={scan.maps.length}
          totalModCount={scan.otherMods.length}
          onActiveViewChange={workspaceView.changeActiveView}
          onEnabledFilterChange={filters.setEnabledFilter}
          onProgressFilterChange={filters.setProgressFilter}
          onQueryChange={filters.setQuery}
          onSelectedSaveFilesChange={updateSelectedSaveFiles}
          onShowHelperMapsChange={filters.setShowHelperMaps}
          onShowOnlyUnreferencedModsChange={filters.setShowOnlyUnreferencedMods}
          onShowWarningColumnChange={uiLayout.setShowWarningColumn}
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
            onLaunch={profileDraft.launchSelectedProfiles}
            onLaunchArgsChange={profileDraft.setLaunchArgs}
            onMapProfileDelete={profileDraft.deleteMapProfile}
            onMapProfileNameChange={profileDraft.setMapProfileName}
            onMapProfileSelect={profileDraft.setMapProfileDraft}
            onModProfileDelete={profileDraft.deleteModProfile}
            onModProfileNameChange={profileDraft.setModProfileName}
            onModProfileSelect={profileDraft.setModProfileDraft}
            onSaveAsMapProfile={profileDraft.saveAsMapProfile}
            onSaveAsModProfile={profileDraft.saveAsModProfile}
            onSaveMapProfile={profileDraft.saveMapProfile}
            onSaveModProfile={profileDraft.saveModProfile}
          />
        ) : workspaceView.activeView === "backups" ? (
          <BackupManager
            autoBackupEnabled={autoBackupEnabled}
            backups={backups.backups}
            celestePath={celestePath}
            loading={loading}
            onAutoBackupEnabledChange={updateAutoBackupEnabled}
            onBackupCreate={backups.createManualBackup}
            onBackupFolderOpen={backups.openCurrentBackupFolder}
            onBackupLocationOpen={backups.openSelectedBackupLocation}
            onBackupRestore={backups.restoreSelectedBackup}
            onBackupsRefresh={backups.refreshBackups}
          />
        ) : workspaceView.mainMode === "detail" && workspaceView.activeView === "maps" ? (
          <MapDetail
            activeTab={uiLayout.mapDetailTab}
            map={workspaceView.selectedMap}
            mapDetailMemory={mapDetailMemory}
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
            visibleMapCount={filters.visibleMapRecords.length}
            modCount={scan.otherMods.length}
            scrollMemory={scrollMemory}
            onDisableAll={recordActions.disableAllInCurrentView}
            onEnableAll={recordActions.enableAllInCurrentView}
            onMapSelect={workspaceView.selectMap}
            onMapToggle={recordActions.toggleMapLikeRecord}
            onModSelect={workspaceView.selectMod}
            onModToggle={recordActions.toggleModRecord}
            onFavoriteToggle={recordActions.updateRecordFavorite}
            onProtectedToggle={recordActions.updateRecordProtected}
            isMapEnabled={recordActions.isMapEnabled}
            isModEnabled={recordActions.isModEnabled}
          />
        )}
      </section>

      {(message || scan.warnings.length > 0) && (
        <footer className="message-bar">
          <AlertTriangle size={16} />
          <span>{[message, ...scan.warnings].filter(Boolean).join("；")}</span>
        </footer>
      )}
    </main>
  );
}
