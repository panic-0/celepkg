import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { MapDetail } from "./components/MapDetail";
import { ModDetail } from "./components/ModDetail";
import { RecordList } from "./components/RecordList";
import { Sidebar } from "./components/Sidebar";
import { StatusStrip } from "./components/StatusStrip";
import { TopBar } from "./components/TopBar";
import { useCelePkgData } from "./hooks/useCelePkgData";
import { useModFilters } from "./hooks/useModFilters";
import { useProfileDraft } from "./hooks/useProfileDraft";
import type { ModRecord } from "./types";
import { isDraftEnabled } from "./utils/format";
import type { ActiveView } from "./viewTypes";

export function App() {
  const {
    celestePath,
    loading,
    message,
    savePathAndRefresh,
    scan,
    setLoading,
    setMessage,
    setPathInput,
    setScan
  } = useCelePkgData();
  const [activeView, setActiveView] = useState<ActiveView>("maps");
  const [selectedMapId, setSelectedMapId] = useState("");
  const [selectedModId, setSelectedModId] = useState("");

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

  function toggleMapLikeRecord(record: ModRecord) {
    if (record.kind === "mod") profileDraft.toggleMod(record.id);
    else profileDraft.toggleMap(record.id);
  }

  function enableVisibleMaps() {
    const mapIds = filters.filteredMaps.filter((record) => record.kind === "map").map((record) => record.id);
    const modIds = filters.filteredMaps.filter((record) => record.kind === "mod").map((record) => record.id);
    profileDraft.setEnabledMapDraft((current) => new Set([...current, ...mapIds]));
    profileDraft.setEnabledModDraft((current) => new Set([...current, ...modIds]));
  }

  function disableVisibleMaps() {
    const mapIds = new Set(filters.filteredMaps.filter((record) => record.kind === "map").map((record) => record.id));
    const modIds = new Set(filters.filteredMaps.filter((record) => record.kind === "mod").map((record) => record.id));
    profileDraft.setEnabledMapDraft((current) => new Set([...current].filter((id) => !mapIds.has(id))));
    profileDraft.setEnabledModDraft((current) => new Set([...current].filter((id) => !modIds.has(id))));
  }

  function enableAllInCurrentView() {
    if (activeView === "maps") {
      enableVisibleMaps();
    } else {
      const modIds = filters.filteredMods.map((modItem) => modItem.id);
      profileDraft.setEnabledModDraft((current) => new Set([...current, ...modIds]));
    }
  }

  function disableAllInCurrentView() {
    if (activeView === "maps") {
      disableVisibleMaps();
    } else {
      const modIds = new Set(filters.filteredMods.map((modItem) => modItem.id));
      profileDraft.setEnabledModDraft((current) => new Set([...current].filter((id) => !modIds.has(id))));
    }
  }

  return (
    <main className="app-shell">
      <TopBar
        celestePath={celestePath}
        loading={loading}
        canLaunch={Boolean(scan.gameExecutable)}
        onLaunch={profileDraft.launchSelectedProfile}
        onPathChange={setPathInput}
        onRefresh={savePathAndRefresh}
      />

      <StatusStrip enabledCount={enabledCount} enabledModCount={enabledModCount} scan={scan} />

      <section className="workspace">
        <Sidebar
          activeView={activeView}
          enabledFilter={filters.enabledFilter}
          helperMapCount={filters.helperMapMods.length}
          launchArgs={profileDraft.launchArgs}
          loading={loading}
          profileName={profileDraft.profileName}
          profiles={scan.profiles.profiles}
          progressFilter={filters.progressFilter}
          query={filters.query}
          selectedProfileId={profileDraft.selectedProfileId}
          showHelperMaps={filters.showHelperMaps}
          sortKey={filters.sortKey}
          onActiveViewChange={setActiveView}
          onApplyProfile={profileDraft.applySelectedProfile}
          onEnabledFilterChange={filters.setEnabledFilter}
          onLaunchArgsChange={profileDraft.setLaunchArgs}
          onProfileNameChange={profileDraft.setProfileName}
          onProfileSelect={profileDraft.setProfileDraft}
          onProgressFilterChange={filters.setProgressFilter}
          onQueryChange={filters.setQuery}
          onSaveAsProfile={profileDraft.saveAsProfile}
          onSaveProfile={profileDraft.saveCurrentProfile}
          onShowHelperMapsChange={filters.setShowHelperMaps}
          onSortKeyChange={filters.setSortKey}
        />

        <RecordList
          activeView={activeView}
          filteredMaps={filters.filteredMaps}
          filteredMods={filters.filteredMods}
          selectedMap={selectedMap}
          selectedMod={selectedMod}
          visibleMapCount={filters.visibleMapRecords.length}
          modCount={scan.otherMods.length}
          onDisableAll={disableAllInCurrentView}
          onEnableAll={enableAllInCurrentView}
          onMapSelect={setSelectedMapId}
          onMapToggle={toggleMapLikeRecord}
          onModSelect={setSelectedModId}
          onModToggle={profileDraft.toggleMod}
          isMapEnabled={(record) => isDraftEnabled(record, profileDraft.enabledMapDraft, profileDraft.enabledModDraft)}
          isModEnabled={(id) => profileDraft.enabledModDraft.has(id)}
        />

        {activeView === "maps" ? (
          <MapDetail
            map={selectedMap}
            draftEnabled={selectedMap ? isDraftEnabled(selectedMap, profileDraft.enabledMapDraft, profileDraft.enabledModDraft) : false}
          />
        ) : (
          <ModDetail modItem={selectedMod} draftEnabled={selectedMod ? profileDraft.enabledModDraft.has(selectedMod.id) : false} />
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
