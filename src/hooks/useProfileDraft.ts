import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { applyProfile, launchProfile, saveProfile } from "../api";
import type { Profile, ScanResult } from "../types";
import { readError } from "../utils/format";

type ProfileDraftOptions = {
  celestePath: string;
  scan: ScanResult;
  setLoading: (loading: boolean) => void;
  setMessage: (message: string) => void;
  setScan: React.Dispatch<React.SetStateAction<ScanResult>>;
};

export function useProfileDraft({ celestePath, scan, setLoading, setMessage, setScan }: ProfileDraftOptions) {
  const [enabledMapDraft, setEnabledMapDraft] = useState<Set<string>>(new Set());
  const [enabledMapModDraft, setEnabledMapModDraft] = useState<Set<string>>(new Set());
  const [enabledExplicitModDraft, setEnabledExplicitModDraft] = useState<Set<string>>(new Set());
  const [selectedMapProfileId, setSelectedMapProfileId] = useState("default-maps");
  const [selectedModProfileId, setSelectedModProfileId] = useState("default-mods");
  const [mapProfileName, setMapProfileName] = useState("新地图 Profile");
  const [modProfileName, setModProfileName] = useState("新 Mod Profile");
  const [launchArgs, setLaunchArgs] = useState("");
  const [mapDirty, setMapDirty] = useState(false);
  const [modDirty, setModDirty] = useState(false);
  const initializedRef = useRef(false);

  const mapProfiles = useMemo(() => scan.profiles.profiles.filter((profile) => profile.profileType === "maps"), [scan.profiles.profiles]);
  const modProfiles = useMemo(() => scan.profiles.profiles.filter((profile) => profile.profileType === "mods"), [scan.profiles.profiles]);
  const selectedMapProfile = useMemo(
    () => mapProfiles.find((profile) => profile.id === selectedMapProfileId),
    [mapProfiles, selectedMapProfileId]
  );
  const selectedModProfile = useMemo(
    () => modProfiles.find((profile) => profile.id === selectedModProfileId),
    [modProfiles, selectedModProfileId]
  );
  const inferredDependencyModDraft = useMemo(
    () => inferDependencyMods(scan, enabledMapDraft, new Set([...enabledMapModDraft, ...enabledExplicitModDraft])),
    [enabledExplicitModDraft, enabledMapDraft, enabledMapModDraft, scan]
  );
  const enabledModDraft = useMemo(
    () => new Set([...enabledMapModDraft, ...enabledExplicitModDraft, ...inferredDependencyModDraft]),
    [enabledExplicitModDraft, enabledMapModDraft, inferredDependencyModDraft]
  );

  useEffect(() => {
    const activeMap = mapProfiles.find((profile) => profile.id === scan.profiles.activeMapProfileId) ?? mapProfiles[0];
    const activeMod = modProfiles.find((profile) => profile.id === scan.profiles.activeModProfileId) ?? modProfiles[0];
    if (!initializedRef.current || !mapDirty) {
      hydrateMapDraft(activeMap);
    }
    if (!initializedRef.current || !modDirty) {
      hydrateModDraft(activeMod);
    }
    initializedRef.current = true;
  }, [
    mapDirty,
    mapProfiles,
    modDirty,
    modProfiles,
    scan.maps,
    scan.otherMods,
    scan.profiles.activeMapProfileId,
    scan.profiles.activeModProfileId
  ]);

  function hydrateMapDraft(profile: Profile | undefined) {
    setSelectedMapProfileId(profile?.id ?? "default-maps");
    setLaunchArgs(profile?.launchArgs ?? "");
    setEnabledMapDraft(new Set(profile?.enabledMapIds ?? scan.maps.filter((map) => map.enabled).map((map) => map.id)));
    const helperMapMods = scan.otherMods.filter((modItem) => modItem.subMaps.length > 0);
    setEnabledMapModDraft(
      new Set(profile?.enabledModIds ?? helperMapMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id))
    );
    setMapDirty(false);
  }

  function hydrateModDraft(profile: Profile | undefined) {
    setSelectedModProfileId(profile?.id ?? "default-mods");
    setEnabledExplicitModDraft(
      new Set(profile?.enabledModIds ?? scan.otherMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id))
    );
    setModDirty(false);
  }

  function setMapProfileDraft(profile: Profile | undefined) {
    if (!profile) return;
    hydrateMapDraft(profile);
  }

  function setModProfileDraft(profile: Profile | undefined) {
    if (!profile) return;
    hydrateModDraft(profile);
  }

  const updateEnabledMapDraft: Dispatch<SetStateAction<Set<string>>> = (action) => {
    setMapDirty(true);
    setEnabledMapDraft(action);
  };

  const updateEnabledMapModDraft: Dispatch<SetStateAction<Set<string>>> = (action) => {
    setMapDirty(true);
    setEnabledMapModDraft(action);
  };

  const updateEnabledExplicitModDraft: Dispatch<SetStateAction<Set<string>>> = (action) => {
    setModDirty(true);
    setEnabledExplicitModDraft(action);
  };

  function updateLaunchArgs(value: string) {
    setMapDirty(true);
    setLaunchArgs(value);
  }

  async function persistMapProfile() {
    const current = selectedMapProfile;
    const profiles = await saveProfile({
      id: current?.id,
      name: current?.name || mapProfileName,
      profileType: "maps",
      enabledMapIds: [...enabledMapDraft],
      enabledModIds: [...enabledMapModDraft],
      launchArgs,
      createdAt: current?.createdAt
    });
    const nextId = current?.id || profiles.activeMapProfileId;
    setMapDirty(false);
    setSelectedMapProfileId(nextId);
    setScan((value) => ({ ...value, profiles }));
    return nextId;
  }

  async function persistModProfile() {
    const current = selectedModProfile;
    const profiles = await saveProfile({
      id: current?.id,
      name: current?.name || modProfileName,
      profileType: "mods",
      enabledModIds: [...enabledExplicitModDraft],
      createdAt: current?.createdAt
    });
    const nextId = current?.id || profiles.activeModProfileId;
    setModDirty(false);
    setSelectedModProfileId(nextId);
    setScan((value) => ({ ...value, profiles }));
    return nextId;
  }

  async function saveMapProfile(applyAfterSave: boolean) {
    await runProfileTask(async () => {
      const mapId = await persistMapProfile();
      if (applyAfterSave) await applyProfiles(mapId, selectedModProfileId, "地图 Profile 已保存并应用。");
      else setMessage("地图 Profile 已保存。");
    });
  }

  async function saveModProfile(applyAfterSave: boolean) {
    await runProfileTask(async () => {
      const modId = await persistModProfile();
      if (applyAfterSave) await applyProfiles(selectedMapProfileId, modId, "Mod Profile 已保存并应用。");
      else setMessage("Mod Profile 已保存。");
    });
  }

  async function saveAsMapProfile() {
    await runProfileTask(async () => {
      const profiles = await saveProfile({
        name: mapProfileName,
        profileType: "maps",
        enabledMapIds: [...enabledMapDraft],
        enabledModIds: [...enabledMapModDraft],
        launchArgs
      });
      setMapDirty(false);
      setScan((value) => ({ ...value, profiles }));
      setSelectedMapProfileId(profiles.activeMapProfileId);
      setMessage("新的地图 Profile 已保存。");
    });
  }

  async function saveAsModProfile() {
    await runProfileTask(async () => {
      const profiles = await saveProfile({
        name: modProfileName,
        profileType: "mods",
        enabledModIds: [...enabledExplicitModDraft]
      });
      setModDirty(false);
      setScan((value) => ({ ...value, profiles }));
      setSelectedModProfileId(profiles.activeModProfileId);
      setMessage("新的 Mod Profile 已保存。");
    });
  }

  async function applySelectedProfiles() {
    await runProfileTask(async () => applyProfiles(selectedMapProfileId, selectedModProfileId, "已应用地图和 Mod Profile。"));
  }

  async function launchSelectedProfiles() {
    await runProfileTask(async () => {
      const mapId = mapDirty ? await persistMapProfile() : selectedMapProfileId;
      const modId = modDirty ? await persistModProfile() : selectedModProfileId;
      const applied = await applyProfile(celestePath, mapId, modId);
      setScan(applied);
      const result = await launchProfile(celestePath, mapId, modId);
      setMessage(`已启动：${result.executable}`);
    });
  }

  async function applyProfiles(mapProfileId: string, modProfileId: string, successMessage: string) {
    const result = await applyProfile(celestePath, mapProfileId, modProfileId);
    setMapDirty(false);
    setModDirty(false);
    setScan(result);
    setMessage(successMessage);
  }

  async function runProfileTask(task: () => Promise<void>) {
    setLoading(true);
    setMessage("");
    try {
      await task();
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  function toggleMap(id: string) {
    setMapDirty(true);
    setEnabledMapDraft((current) => toggleSetValue(current, id));
  }

  function toggleMapMod(id: string) {
    setMapDirty(true);
    setEnabledMapModDraft((current) => toggleSetValue(current, id));
  }

  function toggleMod(id: string) {
    setModDirty(true);
    setEnabledExplicitModDraft((current) => toggleSetValue(current, id));
  }

  return {
    applySelectedProfiles,
    dependencyModDraft: inferredDependencyModDraft,
    enabledExplicitModDraft,
    enabledMapDraft,
    enabledMapModDraft,
    enabledModDraft,
    launchArgs,
    launchSelectedProfiles,
    mapProfileName,
    mapProfiles,
    modProfileName,
    modProfiles,
    saveAsMapProfile,
    saveAsModProfile,
    saveMapProfile,
    saveModProfile,
    selectedMapProfileId,
    selectedModProfileId,
    setEnabledExplicitModDraft: updateEnabledExplicitModDraft,
    setEnabledMapDraft: updateEnabledMapDraft,
    setEnabledMapModDraft: updateEnabledMapModDraft,
    setLaunchArgs: updateLaunchArgs,
    setMapProfileDraft,
    setMapProfileName,
    setModProfileDraft,
    setModProfileName,
    toggleMap,
    toggleMapMod,
    toggleMod
  };
}

function toggleSetValue(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function inferDependencyMods(scan: ScanResult, enabledMapIds: Set<string>, baseModIds: Set<string>) {
  const aliasToModId = new Map<string, string>();
  for (const modItem of scan.otherMods) {
    for (const alias of [
      modItem.id,
      modItem.name,
      modItem.metadata.name,
      modItem.fileName,
      modItem.fileName.replace(/\.zip$/i, ""),
      modItem.relativePath
    ]) {
      const normalized = normalizeDependencyName(alias);
      if (normalized) aliasToModId.set(normalized, modItem.id);
    }
  }
  const modById = new Map(scan.otherMods.map((modItem) => [modItem.id, modItem]));
  const inferred = new Set<string>();
  const queue: string[] = [];
  const addDependency = (name: string) => {
    const id = aliasToModId.get(normalizeDependencyName(name));
    if (id && !baseModIds.has(id) && !inferred.has(id)) {
      inferred.add(id);
      queue.push(id);
    }
  };

  for (const map of scan.maps) {
    if (enabledMapIds.has(map.id)) map.dependencies.forEach((dependency) => addDependency(dependency.name));
  }
  for (const id of baseModIds) queue.push(id);
  while (queue.length) {
    const modItem = modById.get(queue.shift() ?? "");
    modItem?.dependencies.forEach((dependency) => addDependency(dependency.name));
  }
  return inferred;
}

function normalizeDependencyName(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/\.zip$/i, "")
    .replace(/[_-]/g, " ")
    .trim()
    .split(/\s+/)
    .join(" ")
    .toLowerCase();
}
