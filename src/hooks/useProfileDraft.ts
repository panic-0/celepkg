import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { applyProfile, deleteProfile, launchGame, saveProfile } from "../api";
import type { Profile, ScanResult } from "../types";
import { buildModAliasMap, normalizeDependencyName } from "../utils/dependencies";
import { readError } from "../utils/format";

type ProfileDraftOptions = {
  celestePath: string;
  scan: ScanResult;
  setLoading: (loading: boolean) => void;
  setMessage: (message: string) => void;
  setScan: React.Dispatch<React.SetStateAction<ScanResult>>;
};

export type ProfileOverwriteMode = "enabled" | "all";

export function useProfileDraft({ celestePath, scan, setLoading, setMessage, setScan }: ProfileDraftOptions) {
  const [enabledMapDraft, setEnabledMapDraft] = useState<Set<string>>(new Set());
  const [enabledMapModDraft, setEnabledMapModDraft] = useState<Set<string>>(new Set());
  const [enabledExplicitModDraft, setEnabledExplicitModDraft] = useState<Set<string>>(new Set());
  const [selectedMapProfileId, setSelectedMapProfileId] = useState("default-maps");
  const [selectedModProfileId, setSelectedModProfileId] = useState("default-mods");
  const [mapProfileName, setMapProfileName] = useState("");
  const [modProfileName, setModProfileName] = useState("");
  const [launchArgs, setLaunchArgs] = useState("");
  const [mapDirty, setMapDirty] = useState(false);
  const [modDirty, setModDirty] = useState(false);
  const initializedRef = useRef(false);
  const mapAutoSaveReadyRef = useRef(false);
  const modAutoSaveReadyRef = useRef(false);
  const profileSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueueProfileSave = useCallback(<T>(task: () => Promise<T>) => {
    const next = profileSaveQueueRef.current.then(task, task);
    profileSaveQueueRef.current = next.catch(() => undefined);
    return next;
  }, []);

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

  const hydrateMapDraft = useCallback(
    (profile: Profile | undefined) => {
      mapAutoSaveReadyRef.current = false;
      setSelectedMapProfileId(profile?.id ?? "default-maps");
      setLaunchArgs(profile?.launchArgs ?? "");
      const readOnlyMapIds = scan.maps.filter((map) => map.readOnly).map((map) => map.id);
      const mapIds = [
        ...new Set([...(profile?.enabledMapIds ?? scan.maps.filter((map) => map.enabled).map((map) => map.id)), ...readOnlyMapIds])
      ];
      const helperMapMods = scan.otherMods.filter((modItem) => modItem.subMaps.length > 0);
      const modIds = profile?.enabledModIds ?? helperMapMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id);
      setEnabledMapDraft(new Set(mapIds));
      setEnabledMapModDraft(new Set(modIds));
      setMapDirty(false);
      if (profile && (!profile.enabledMapIds || !profile.enabledModIds)) {
        void enqueueProfileSave(() =>
          saveProfile({
            id: profile.id,
            name: profile.name || "Main Profile",
            profileType: "maps",
            enabledMapIds: mapIds,
            enabledModIds: modIds,
            launchArgs: profile.launchArgs,
            createdAt: profile.createdAt
          })
        )
          .then((profiles) => setScan((value) => ({ ...value, profiles })))
          .catch((error) => setMessage(readError(error)));
      }
    },
    [enqueueProfileSave, scan.maps, scan.otherMods, setMessage, setScan]
  );

  const hydrateModDraft = useCallback(
    (profile: Profile | undefined) => {
      modAutoSaveReadyRef.current = false;
      setSelectedModProfileId(profile?.id ?? "default-mods");
      const modIds = profile?.enabledModIds ?? scan.otherMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id);
      setEnabledExplicitModDraft(new Set(modIds));
      setModDirty(false);
      if (profile && !profile.enabledModIds) {
        void enqueueProfileSave(() =>
          saveProfile({
            id: profile.id,
            name: profile.name || "Main Profile",
            profileType: "mods",
            enabledModIds: modIds,
            createdAt: profile.createdAt
          })
        )
          .then((profiles) => setScan((value) => ({ ...value, profiles })))
          .catch((error) => setMessage(readError(error)));
      }
    },
    [enqueueProfileSave, scan.otherMods, setMessage, setScan]
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
    hydrateMapDraft,
    hydrateModDraft,
    mapDirty,
    mapProfiles,
    modDirty,
    modProfiles,
    scan.profiles.activeMapProfileId,
    scan.profiles.activeModProfileId
  ]);

  const persistMapProfile = useCallback(async () => {
    const current = selectedMapProfile;
    if (!current) return selectedMapProfileId;
    const profiles = await enqueueProfileSave(() =>
      saveProfile({
        id: current.id,
        name: current.name || "Main Profile",
        profileType: "maps",
        enabledMapIds: [...enabledMapDraft],
        enabledModIds: [...enabledMapModDraft],
        launchArgs,
        createdAt: current.createdAt
      })
    );
    const nextId = current.id || profiles.activeMapProfileId;
    setMapDirty(false);
    setSelectedMapProfileId(nextId);
    setScan((value) => ({ ...value, profiles }));
    return nextId;
  }, [enabledMapDraft, enabledMapModDraft, enqueueProfileSave, launchArgs, selectedMapProfile, selectedMapProfileId, setScan]);

  const persistModProfile = useCallback(async () => {
    const current = selectedModProfile;
    if (!current) return selectedModProfileId;
    const profiles = await enqueueProfileSave(() =>
      saveProfile({
        id: current.id,
        name: current.name || "Main Profile",
        profileType: "mods",
        enabledModIds: [...enabledExplicitModDraft],
        createdAt: current.createdAt
      })
    );
    const nextId = current.id || profiles.activeModProfileId;
    setModDirty(false);
    setSelectedModProfileId(nextId);
    setScan((value) => ({ ...value, profiles }));
    return nextId;
  }, [enabledExplicitModDraft, enqueueProfileSave, selectedModProfile, selectedModProfileId, setScan]);

  useEffect(() => {
    if (!initializedRef.current || !selectedMapProfile) return;
    if (!mapDirty) {
      mapAutoSaveReadyRef.current = true;
      return;
    }
    if (!mapAutoSaveReadyRef.current) return;
    const timer = window.setTimeout(() => {
      if (!mapAutoSaveReadyRef.current) return;
      void persistMapProfile().catch((error) => setMessage(readError(error)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [enabledMapDraft, enabledMapModDraft, launchArgs, mapDirty, persistMapProfile, selectedMapProfile, setMessage]);

  useEffect(() => {
    if (!initializedRef.current || !selectedModProfile) return;
    if (!modDirty) {
      modAutoSaveReadyRef.current = true;
      return;
    }
    if (!modAutoSaveReadyRef.current) return;
    const timer = window.setTimeout(() => {
      if (!modAutoSaveReadyRef.current) return;
      void persistModProfile().catch((error) => setMessage(readError(error)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [enabledExplicitModDraft, modDirty, persistModProfile, selectedModProfile, setMessage]);

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

  function updateMapProfileName(value: string) {
    setMapProfileName(value);
  }

  function updateModProfileName(value: string) {
    setModProfileName(value);
  }

  async function copyMapProfile(sourceProfile = selectedMapProfile) {
    await runProfileTask(async () => {
      mapAutoSaveReadyRef.current = false;
      const source = sourceProfile;
      if (!source) return;
      if (mapDirty) await persistMapProfile();
      const isSelectedSource = source.id === selectedMapProfileId;
      const sourceName = source.name || "Main Profile";
      const sourceLaunchArgs = isSelectedSource ? launchArgs : source.launchArgs;
      const content = isSelectedSource
        ? {
            enabledMapIds: [...enabledMapDraft],
            enabledModIds: [...enabledMapModDraft]
          }
        : resolveMapProfileContent(source, scan);
      const profiles = await enqueueProfileSave(() =>
        saveProfile({
          name: nextCopyName(sourceName, mapProfiles),
          profileType: "maps",
          enabledMapIds: content.enabledMapIds,
          enabledModIds: content.enabledModIds,
          launchArgs: sourceLaunchArgs
        })
      );
      setMapDirty(false);
      mapAutoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      setSelectedMapProfileId(profiles.activeMapProfileId);
      setLaunchArgs(sourceLaunchArgs);
      setEnabledMapDraft(new Set(content.enabledMapIds));
      setEnabledMapModDraft(new Set(content.enabledModIds));
      setMessage("地图 Profile 已复制。");
    });
  }

  async function copyModProfile(sourceProfile = selectedModProfile) {
    await runProfileTask(async () => {
      modAutoSaveReadyRef.current = false;
      const source = sourceProfile;
      if (!source) return;
      if (modDirty) await persistModProfile();
      const isSelectedSource = source.id === selectedModProfileId;
      const sourceName = source.name || "Main Profile";
      const content = isSelectedSource
        ? {
            enabledModIds: [...enabledExplicitModDraft]
          }
        : resolveModProfileContent(source, scan);
      const profiles = await enqueueProfileSave(() =>
        saveProfile({
          name: nextCopyName(sourceName, modProfiles),
          profileType: "mods",
          enabledModIds: content.enabledModIds
        })
      );
      setModDirty(false);
      modAutoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      setSelectedModProfileId(profiles.activeModProfileId);
      setEnabledExplicitModDraft(new Set(content.enabledModIds));
      setMessage("Mod Profile 已复制。");
    });
  }

  async function createEmptyMapProfile() {
    await runProfileTask(async () => {
      mapAutoSaveReadyRef.current = false;
      const enabledMapIds = scan.maps.filter((map) => map.readOnly).map((map) => map.id);
      const nextName = mapProfileName.trim() || nextNewProfileName("New Map Profile", mapProfiles);
      const profiles = await enqueueProfileSave(() =>
        saveProfile({
          name: nextName,
          profileType: "maps",
          enabledMapIds,
          enabledModIds: [],
          launchArgs: ""
        })
      );
      setMapDirty(false);
      mapAutoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      setSelectedMapProfileId(profiles.activeMapProfileId);
      setMapProfileName("");
      setLaunchArgs("");
      setEnabledMapDraft(new Set(enabledMapIds));
      setEnabledMapModDraft(new Set());
      setMessage("已新建空地图 Profile。");
    });
  }

  async function createEmptyModProfile() {
    await runProfileTask(async () => {
      modAutoSaveReadyRef.current = false;
      const nextName = modProfileName.trim() || nextNewProfileName("New Mod Profile", modProfiles);
      const profiles = await enqueueProfileSave(() =>
        saveProfile({
          name: nextName,
          profileType: "mods",
          enabledModIds: []
        })
      );
      setModDirty(false);
      modAutoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      setSelectedModProfileId(profiles.activeModProfileId);
      setModProfileName("");
      setEnabledExplicitModDraft(new Set());
      setMessage("已新建空 Mod Profile。");
    });
  }

  async function deleteMapProfile(profile: Profile) {
    await runProfileTask(async () => {
      const profiles = await enqueueProfileSave(() => deleteProfile(profile.id));
      setMapDirty(false);
      setScan((value) => ({ ...value, profiles }));
      setSelectedMapProfileId(profiles.activeMapProfileId);
      setMessage("地图 Profile 已删除。");
    });
  }

  async function deleteModProfile(profile: Profile) {
    await runProfileTask(async () => {
      const profiles = await enqueueProfileSave(() => deleteProfile(profile.id));
      setModDirty(false);
      setScan((value) => ({ ...value, profiles }));
      setSelectedModProfileId(profiles.activeModProfileId);
      setMessage("Mod Profile 已删除。");
    });
  }

  async function applySelectedProfiles() {
    await runProfileTask(async () => {
      const mapId = mapDirty ? await persistMapProfile() : selectedMapProfileId;
      const modId = modDirty ? await persistModProfile() : selectedModProfileId;
      await applyProfiles(mapId, modId, "已应用地图和 Mod Profile。");
    });
  }

  async function launchSelectedProfiles() {
    await runProfileTask(async () => {
      const mapId = mapDirty ? await persistMapProfile() : selectedMapProfileId;
      const modId = modDirty ? await persistModProfile() : selectedModProfileId;
      const applied = await enqueueProfileSave(() => applyProfile(celestePath, mapId, modId));
      setScan(applied);
      const result = await launchGame(celestePath, launchArgs);
      setMessage(`已启动：${result.executable}`);
    });
  }

  async function launchCurrentGame() {
    await runProfileTask(async () => {
      const result = await launchGame(celestePath, launchArgs);
      setMessage(`已启动：${result.executable}`);
    });
  }

  async function overwriteMapProfileFromCurrent() {
    await runProfileTask(async () => {
      mapAutoSaveReadyRef.current = false;
      const mapIds = scan.maps.filter((map) => map.enabled || map.readOnly).map((map) => map.id);
      const modIds = scan.otherMods.filter((modItem) => modItem.subMaps.length > 0 && modItem.enabled).map((modItem) => modItem.id);
      setEnabledMapDraft(new Set(mapIds));
      setEnabledMapModDraft(new Set(modIds));
      setMapDirty(true);
      const current = selectedMapProfile;
      if (!current) return;
      const profiles = await enqueueProfileSave(() =>
        saveProfile({
          id: current.id,
          name: current.name || "Main Profile",
          profileType: "maps",
          enabledMapIds: mapIds,
          enabledModIds: modIds,
          launchArgs,
          createdAt: current.createdAt
        })
      );
      setMapDirty(false);
      mapAutoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      setMessage("已用当前游戏启用情况覆盖地图 Profile。");
    });
  }

  async function overwriteModProfileFromCurrent() {
    await runProfileTask(async () => {
      modAutoSaveReadyRef.current = false;
      const modIds = scan.otherMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id);
      setEnabledExplicitModDraft(new Set(modIds));
      setModDirty(true);
      const current = selectedModProfile;
      if (!current) return;
      const profiles = await enqueueProfileSave(() =>
        saveProfile({
          id: current.id,
          name: current.name || "Main Profile",
          profileType: "mods",
          enabledModIds: modIds,
          createdAt: current.createdAt
        })
      );
      setModDirty(false);
      modAutoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      setMessage("已用当前游戏启用情况覆盖 Mod Profile。");
    });
  }

  async function overwriteMapProfileFromProfile(sourceProfileId: string, mode: ProfileOverwriteMode) {
    await runProfileTask(async () => {
      mapAutoSaveReadyRef.current = false;
      const current = selectedMapProfile;
      const source = mapProfiles.find((profile) => profile.id === sourceProfileId);
      if (!current || !source || current.id === source.id) return;
      const content = resolveMapProfileContent(source, scan);
      const nextName = mode === "all" ? source.name : current.name || "Main Profile";
      const nextLaunchArgs = mode === "all" ? source.launchArgs : launchArgs;
      const profiles = await enqueueProfileSave(() =>
        saveProfile({
          id: current.id,
          name: nextName,
          profileType: "maps",
          enabledMapIds: content.enabledMapIds,
          enabledModIds: content.enabledModIds,
          launchArgs: nextLaunchArgs,
          createdAt: current.createdAt
        })
      );
      setLaunchArgs(nextLaunchArgs);
      setEnabledMapDraft(new Set(content.enabledMapIds));
      setEnabledMapModDraft(new Set(content.enabledModIds));
      setMapDirty(false);
      mapAutoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      setMessage(mode === "all" ? "已用来源 Profile 覆盖地图 Profile 全部内容。" : "已用来源 Profile 覆盖地图 Profile 启用情况。");
    });
  }

  async function overwriteModProfileFromProfile(sourceProfileId: string, mode: ProfileOverwriteMode) {
    await runProfileTask(async () => {
      modAutoSaveReadyRef.current = false;
      const current = selectedModProfile;
      const source = modProfiles.find((profile) => profile.id === sourceProfileId);
      if (!current || !source || current.id === source.id) return;
      const content = resolveModProfileContent(source, scan);
      const nextName = mode === "all" ? source.name : current.name || "Main Profile";
      const profiles = await enqueueProfileSave(() =>
        saveProfile({
          id: current.id,
          name: nextName,
          profileType: "mods",
          enabledModIds: content.enabledModIds,
          createdAt: current.createdAt
        })
      );
      setEnabledExplicitModDraft(new Set(content.enabledModIds));
      setModDirty(false);
      modAutoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      setMessage(mode === "all" ? "已用来源 Profile 覆盖 Mod Profile 全部内容。" : "已用来源 Profile 覆盖 Mod Profile 启用情况。");
    });
  }

  async function applyProfiles(mapProfileId: string, modProfileId: string, successMessage: string) {
    const result = await enqueueProfileSave(() => applyProfile(celestePath, mapProfileId, modProfileId));
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
    deleteMapProfile,
    deleteModProfile,
    dependencyModDraft: inferredDependencyModDraft,
    enabledExplicitModDraft,
    enabledMapDraft,
    enabledMapModDraft,
    enabledModDraft,
    launchArgs,
    launchCurrentGame,
    launchSelectedProfiles,
    mapProfileName,
    mapProfiles,
    modProfileName,
    modProfiles,
    overwriteMapProfileFromCurrent,
    overwriteMapProfileFromProfile,
    overwriteModProfileFromCurrent,
    overwriteModProfileFromProfile,
    copyMapProfile,
    copyModProfile,
    createEmptyMapProfile,
    createEmptyModProfile,
    selectedMapProfileId,
    selectedModProfileId,
    setEnabledExplicitModDraft: updateEnabledExplicitModDraft,
    setEnabledMapDraft: updateEnabledMapDraft,
    setEnabledMapModDraft: updateEnabledMapModDraft,
    setLaunchArgs: updateLaunchArgs,
    setMapProfileDraft,
    setMapProfileName: updateMapProfileName,
    setModProfileDraft,
    setModProfileName: updateModProfileName,
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

function resolveMapProfileContent(profile: Profile, scan: ScanResult) {
  const readOnlyMapIds = scan.maps.filter((map) => map.readOnly).map((map) => map.id);
  const enabledMapIds = [
    ...new Set([...(profile.enabledMapIds ?? scan.maps.filter((map) => map.enabled).map((map) => map.id)), ...readOnlyMapIds])
  ];
  const helperMapMods = scan.otherMods.filter((modItem) => modItem.subMaps.length > 0);
  const enabledModIds = profile.enabledModIds ?? helperMapMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id);
  return { enabledMapIds, enabledModIds };
}

function resolveModProfileContent(profile: Profile, scan: ScanResult) {
  const enabledModIds = profile.enabledModIds ?? scan.otherMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id);
  return { enabledModIds };
}

function nextCopyName(name: string, profiles: Profile[]) {
  const base = `${name || "Main Profile"} Copy`;
  const names = new Set(profiles.map((profile) => profile.name));
  if (!names.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!names.has(candidate)) return candidate;
  }
}

function nextNewProfileName(base: string, profiles: Profile[]) {
  const names = new Set(profiles.map((profile) => profile.name));
  if (!names.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!names.has(candidate)) return candidate;
  }
}

function inferDependencyMods(scan: ScanResult, enabledMapIds: Set<string>, baseModIds: Set<string>) {
  const aliasToModId = buildModAliasMap(scan.otherMods);
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
