import { AlertTriangle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { BackupManager } from "./components/BackupManager";
import { MapDetail, type MapDetailMemoryState } from "./components/MapDetail";
import { ModDetail } from "./components/ModDetail";
import { ProfileManager } from "./components/ProfileManager";
import { RecordList } from "./components/RecordList";
import { AppToolbar } from "./components/AppToolbar";
import { WorkspaceNav } from "./components/WorkspaceNav";
import { setRecordFavorite, setRecordProtected } from "./api";
import { useBackups } from "./hooks/useBackups";
import { useCelePkgData } from "./hooks/useCelePkgData";
import { useModFilters } from "./hooks/useModFilters";
import { useProfileDraft } from "./hooks/useProfileDraft";
import type { ScrollPosition } from "./hooks/useScrollMemory";
import { useUiLayout } from "./hooks/useUiLayout";
import type { ModRecord } from "./types";
import { normalizeDependencyName } from "./utils/dependencies";
import { isDraftEnabled, readError } from "./utils/format";
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
  const protectedVisibleMaps = filters.filteredMaps.filter((record) => record.protected);
  const protectedVisibleMods = filters.filteredMods.filter((record) => record.protected);

  function toggleMapLikeRecord(record: ModRecord) {
    if (!canToggleProfileRecord(record)) return;
    if (record.kind === "mod") profileDraft.toggleMapMod(record.id);
    else profileDraft.toggleMap(record.id);
  }

  function toggleModRecord(record: ModRecord) {
    if (!canToggleProfileRecord(record)) return;
    profileDraft.toggleMod(record.id);
  }

  function canToggleProfileRecord(record: ModRecord) {
    const enabled = isDraftEnabled(record, profileDraft.enabledMapDraft, profileDraft.enabledModDraft);
    if (record.protected) {
      setMessage(`${record.name} 已设为 Protected，不能通过 Profile 启用或禁用。`);
      return false;
    }
    if (record.kind === "mod" && enabled && profileDraft.dependencyModDraft.has(record.id)) {
      setMessage(`${record.name} 被以下已启用项目依赖，不能直接禁用：${dependentSummary(record)}。`);
      return false;
    }
    return true;
  }

  function dependentSummary(record: ModRecord) {
    const names = findEnabledDependents(record).map((item) => item.name);
    if (!names.length) return "未知项目";
    const visible = names.slice(0, 6).join("、");
    return names.length > 6 ? `${visible} 等 ${names.length} 个项目` : visible;
  }

  function findEnabledDependents(target: ModRecord) {
    const targetAliases = new Set(
      [target.id, target.name, target.metadata.name, target.fileName, target.fileName.replace(/\.zip$/i, ""), target.relativePath]
        .map(normalizeDependencyName)
        .filter(Boolean)
    );
    const enabledMaps = scan.maps.filter((map) => profileDraft.enabledMapDraft.has(map.id));
    const enabledMods = scan.otherMods.filter((modItem) => modItem.id !== target.id && profileDraft.enabledModDraft.has(modItem.id));
    return [...enabledMaps, ...enabledMods].filter((item) =>
      item.dependencies.some((dependency) => targetAliases.has(normalizeDependencyName(dependency.name)))
    );
  }

  function enableVisibleMaps() {
    const skipped = protectedVisibleMaps.length;
    const mapIds = filters.filteredMaps.filter((record) => record.kind === "map" && !record.protected).map((record) => record.id);
    const modIds = filters.filteredMaps.filter((record) => record.kind === "mod" && !record.protected).map((record) => record.id);
    profileDraft.setEnabledMapDraft((current) => new Set([...current, ...mapIds]));
    profileDraft.setEnabledMapModDraft((current) => new Set([...current, ...modIds]));
    showProtectedSkip(skipped);
  }

  function disableVisibleMaps() {
    const skipped = protectedVisibleMaps.length;
    const mapIds = new Set(filters.filteredMaps.filter((record) => record.kind === "map" && !record.protected).map((record) => record.id));
    const modIds = new Set(filters.filteredMaps.filter((record) => record.kind === "mod" && !record.protected).map((record) => record.id));
    profileDraft.setEnabledMapDraft((current) => new Set([...current].filter((id) => !mapIds.has(id))));
    profileDraft.setEnabledMapModDraft((current) => new Set([...current].filter((id) => !modIds.has(id))));
    showProtectedSkip(skipped);
  }

  function enableAllInCurrentView() {
    if (activeView === "maps") {
      enableVisibleMaps();
    } else if (activeView === "mods") {
      const skipped = protectedVisibleMods.length;
      const modIds = filters.filteredMods.filter((modItem) => !modItem.protected).map((modItem) => modItem.id);
      profileDraft.setEnabledExplicitModDraft((current) => new Set([...current, ...modIds]));
      showProtectedSkip(skipped);
    }
  }

  function disableAllInCurrentView() {
    if (activeView === "maps") {
      disableVisibleMaps();
    } else if (activeView === "mods") {
      const skipped = protectedVisibleMods.length;
      const modIds = new Set(filters.filteredMods.filter((modItem) => !modItem.protected).map((modItem) => modItem.id));
      profileDraft.setEnabledExplicitModDraft((current) => new Set([...current].filter((id) => !modIds.has(id))));
      showProtectedSkip(skipped);
    }
  }

  function showProtectedSkip(skipped: number) {
    if (skipped > 0) setMessage(`已跳过 ${skipped} 个受保护项目。`);
  }

  async function updateRecordFavorite(record: ModRecord) {
    const favorite = !record.favorite;
    setLoading(true);
    setMessage("");
    setRecordFavoriteInScan(record.id, favorite);
    try {
      const result = await setRecordFavorite(celestePath, record.id, favorite);
      setScan(result);
      setMessage(favorite ? "已加入收藏。" : "已取消收藏。");
    } catch (error) {
      setRecordFavoriteInScan(record.id, record.favorite);
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  function setRecordFavoriteInScan(recordId: string, favorite: boolean) {
    setScan((current) => ({
      ...current,
      maps: current.maps.map((map) => (map.id === recordId ? { ...map, favorite } : map)),
      otherMods: current.otherMods.map((modItem) => (modItem.id === recordId ? { ...modItem, favorite } : modItem))
    }));
  }

  async function updateRecordProtected(record: ModRecord) {
    setLoading(true);
    setMessage("");
    try {
      const result = await setRecordProtected(celestePath, record.id, !record.protected);
      setScan(result);
      setMessage(record.protected ? "已取消保护。" : "已设为保护。");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

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
            onDisableAll={disableAllInCurrentView}
            onEnableAll={enableAllInCurrentView}
            onMapSelect={selectMap}
            onMapToggle={toggleMapLikeRecord}
            onModSelect={selectMod}
            onModToggle={toggleModRecord}
            onFavoriteToggle={updateRecordFavorite}
            onProtectedToggle={updateRecordProtected}
            isMapEnabled={(record) => isDraftEnabled(record, profileDraft.enabledMapDraft, profileDraft.enabledModDraft)}
            isModEnabled={(id) => profileDraft.enabledModDraft.has(id)}
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
