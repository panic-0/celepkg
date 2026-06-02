import { useMemo, useState } from "react";
import type { ModRecord, Profile } from "../types";
import type { ActiveView } from "../viewTypes";

type WorkspaceViewOptions = {
  enabledMapDraft: Set<string>;
  enabledModDraft: Set<string>;
  mapProfiles: Profile[];
  maps: ModRecord[];
  modProfiles: Profile[];
  otherMods: ModRecord[];
  selectedMapProfileId: string;
  selectedModProfileId: string;
  visibleMapRecords: ModRecord[];
  onBackupsOpen: () => void;
};

export function useWorkspaceView({
  enabledMapDraft,
  enabledModDraft,
  mapProfiles,
  maps,
  modProfiles,
  otherMods,
  selectedMapProfileId,
  selectedModProfileId,
  visibleMapRecords,
  onBackupsOpen
}: WorkspaceViewOptions) {
  const [activeView, setActiveView] = useState<ActiveView>("maps");
  const [mainMode, setMainMode] = useState<"list" | "detail">("list");
  const [selectedMapId, setSelectedMapId] = useState("");
  const [selectedModId, setSelectedModId] = useState("");

  const selectedMap = useMemo(
    () => visibleMapRecords.find((map) => map.id === selectedMapId) ?? visibleMapRecords[0],
    [visibleMapRecords, selectedMapId]
  );
  const selectedMod = useMemo(
    () => otherMods.find((modItem) => modItem.id === selectedModId) ?? otherMods[0],
    [otherMods, selectedModId]
  );
  const enabledMapCount = useMemo(
    () => maps.filter((map) => enabledMapDraft.has(map.id)).length,
    [enabledMapDraft, maps]
  );
  const enabledModCount = useMemo(
    () => otherMods.filter((modItem) => enabledModDraft.has(modItem.id)).length,
    [enabledModDraft, otherMods]
  );
  const mapProfileName = mapProfiles.find((profile) => profile.id === selectedMapProfileId)?.name ?? "";
  const modProfileName = modProfiles.find((profile) => profile.id === selectedModProfileId)?.name ?? "";

  function changeActiveView(view: ActiveView) {
    setActiveView(view);
    setMainMode("list");
    if (view === "backups") onBackupsOpen();
  }

  function selectMap(id: string) {
    setSelectedMapId(id);
    setMainMode("detail");
  }

  function selectMod(id: string) {
    setSelectedModId(id);
    setMainMode("detail");
  }

  function showList() {
    setMainMode("list");
  }

  return {
    activeView,
    changeActiveView,
    enabledMapCount,
    enabledModCount,
    mainMode,
    mapProfileName,
    modProfileName,
    selectedMap,
    selectedMod,
    selectMap,
    selectMod,
    showList
  };
}
