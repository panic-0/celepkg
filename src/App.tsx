import { AlertTriangle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
import { isDraftEnabled } from "./utils/format";
import type { ActiveView } from "./viewTypes";

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
  const [activeView, setActiveView] = useState<ActiveView>("maps");
  const [mainMode, setMainMode] = useState<"list" | "detail">("list");
  const [selectedMapId, setSelectedMapId] = useState("");
  const [selectedModId, setSelectedModId] = useState("");
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

  const selectedMap = useMemo(
    () => filters.visibleMapRecords.find((map) => map.id === selectedMapId) ?? filters.visibleMapRecords[0],
    [filters.visibleMapRecords, selectedMapId]
  );
  const selectedMod = useMemo(
    () => scan.otherMods.find((modItem) => modItem.id === selectedModId) ?? scan.otherMods[0],
    [scan.otherMods, selectedModId]
  );
  const enabledCount = scan.maps.filter((map) => profileDraft.enabledMapDraft.has(map.id)).length;
  const enabledModCount = scan.otherMods.filter((modItem) => profileDraft.enabledModDraft.has(modItem.id)).length;
  const recordActions = useRecordActions({
    activeView,
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

  function changeActiveView(view: ActiveView) {
    setActiveView(view);
    setMainMode("list");
    if (view === "backups") void backups.refreshBackups();
  }

  function selectMap(id: string) {
    setSelectedMapId(id);
    setMainMode("detail");
  }

  function selectMod(id: string) {
    setSelectedModId(id);
    setMainMode("detail");
  }

  return (
    <main className="app-shell">
      <AppToolbar
        celestePath={celestePath}
        loading={loading}
        canLaunch={Boolean(scan.gameExecutable)}
        enabledMapCount={enabledCount}
        enabledModCount={enabledModCount}
        scan={scan}
        onLaunch={profileDraft.launchSelectedProfiles}
        onPathChange={setPathInput}
        onRefresh={savePathAndRefresh}
      />

      <section className={`workspace ${activeView === "profiles" || activeView === "backups" ? "management-view" : ""}`}>
        <WorkspaceNav
          activeView={activeView}
          dependencyModCount={profileDraft.dependencyModDraft.size}
          enabledFilter={filters.enabledFilter}
          enabledMapCount={enabledCount}
          enabledModCount={enabledModCount}
          helperMapCount={filters.helperMapMods.length}
          mapProfileName={profileDraft.mapProfiles.find((profile) => profile.id === profileDraft.selectedMapProfileId)?.name ?? ""}
          modProfileName={profileDraft.modProfiles.find((profile) => profile.id === profileDraft.selectedModProfileId)?.name ?? ""}
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
          onActiveViewChange={changeActiveView}
          onEnabledFilterChange={filters.setEnabledFilter}
          onProgressFilterChange={filters.setProgressFilter}
          onQueryChange={filters.setQuery}
          onSelectedSaveFilesChange={updateSelectedSaveFiles}
          onShowHelperMapsChange={filters.setShowHelperMaps}
          onShowOnlyUnreferencedModsChange={filters.setShowOnlyUnreferencedMods}
          onShowWarningColumnChange={uiLayout.setShowWarningColumn}
          onSortKeyChange={filters.setSortKey}
        />

        {activeView === "profiles" ? (
          <ProfileManager
            enabledMapCount={enabledCount}
            enabledModCount={enabledModCount}
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
            onMapProfileNameChange={profileDraft.setMapProfileName}
            onMapProfileSelect={profileDraft.setMapProfileDraft}
            onModProfileNameChange={profileDraft.setModProfileName}
            onModProfileSelect={profileDraft.setModProfileDraft}
            onSaveAsMapProfile={profileDraft.saveAsMapProfile}
            onSaveAsModProfile={profileDraft.saveAsModProfile}
            onSaveMapProfile={profileDraft.saveMapProfile}
            onSaveModProfile={profileDraft.saveModProfile}
          />
        ) : activeView === "backups" ? (
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
        ) : mainMode === "detail" && activeView === "maps" ? (
          <MapDetail
            activeTab={uiLayout.mapDetailTab}
            map={selectedMap}
            mapDetailMemory={mapDetailMemory}
            draftEnabled={selectedMap ? isDraftEnabled(selectedMap, profileDraft.enabledMapDraft, profileDraft.enabledModDraft) : false}
            scrollMemory={scrollMemory}
            onBack={() => setMainMode("list")}
            onTabChange={uiLayout.setMapDetailTab}
          />
        ) : mainMode === "detail" && activeView === "mods" ? (
          <ModDetail
            activeTab={uiLayout.modDetailTab}
            modItem={selectedMod}
            draftEnabled={selectedMod ? profileDraft.enabledModDraft.has(selectedMod.id) : false}
            scrollMemory={scrollMemory}
            onBack={() => setMainMode("list")}
            onTabChange={uiLayout.setModDetailTab}
          />
        ) : (
          <RecordList
            activeView={activeView}
            filteredMaps={filters.filteredMaps}
            filteredMods={filters.filteredMods}
            selectedMap={selectedMap}
            selectedMod={selectedMod}
            showWarningColumn={uiLayout.showWarningColumn}
            visibleMapCount={filters.visibleMapRecords.length}
            modCount={scan.otherMods.length}
            scrollMemory={scrollMemory}
            onDisableAll={recordActions.disableAllInCurrentView}
            onEnableAll={recordActions.enableAllInCurrentView}
            onMapSelect={selectMap}
            onMapToggle={recordActions.toggleMapLikeRecord}
            onModSelect={selectMod}
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
