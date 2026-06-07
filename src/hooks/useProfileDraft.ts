import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { applyProfile, deleteProfile, launchGame, saveProfile } from "../api";
import type { AppNotifier, LaunchResult, Profile, ProfilesState, ScanResult } from "../types";
import { notifyError } from "../utils/notify";
import {
  inferDependencyMods,
  nextCopyName,
  nextNewProfileName,
  profileNameExists,
  resolveMapProfileContent,
  resolveModProfileContent,
  toggleSetValue
} from "../utils/profileDraftLogic";

type ProfileDraftOptions = {
  celestePath: string;
  notifier: AppNotifier;
  scan: ScanResult;
  setLoading: (loading: boolean) => void;
  setScan: React.Dispatch<React.SetStateAction<ScanResult>>;
};

export type ProfileOverwriteMode = "enabled" | "all";

type ProfileDraftContent = {
  enabledMapIds?: string[];
  enabledModIds: string[];
  launchArgs?: string;
};

type ProfileDraftController = {
  activeProfileId: (profiles: ProfilesState) => string;
  applyContent: (content: ProfileDraftContent) => void;
  autoSaveReadyRef: MutableRefObject<boolean>;
  copyMessage: string;
  createMessage: string;
  defaultId: string;
  dirty: boolean;
  draftName: string;
  duplicateNameMessage: string;
  emptyNameBase: string;
  emptyContent: () => ProfileDraftContent;
  currentContent: () => ProfileDraftContent;
  currentGameContent: () => ProfileDraftContent;
  overwriteCurrentMessage: string;
  overwriteProfileMessage: (mode: ProfileOverwriteMode) => string;
  profileType: Profile["profileType"];
  profiles: Profile[];
  renameMessage: string;
  resolveContent: (profile?: Profile) => ProfileDraftContent;
  savePayload: (options: {
    content: ProfileDraftContent;
    createdAt?: string;
    id?: string;
    name: string;
  }) => Parameters<typeof saveProfile>[0];
  selectedId: string;
  selectedProfile: Profile | undefined;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setDraftName: Dispatch<SetStateAction<string>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
};

export function useProfileDraft({ celestePath, notifier, scan, setLoading, setScan }: ProfileDraftOptions) {
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
  const enabledMapDraftRef = useRef(enabledMapDraft);
  const enabledMapModDraftRef = useRef(enabledMapModDraft);
  const enabledExplicitModDraftRef = useRef(enabledExplicitModDraft);
  const launchArgsRef = useRef(launchArgs);
  const profileSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  enabledMapDraftRef.current = enabledMapDraft;
  enabledMapModDraftRef.current = enabledMapModDraft;
  enabledExplicitModDraftRef.current = enabledExplicitModDraft;
  launchArgsRef.current = launchArgs;

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

  const mapDraftController = useMemo<ProfileDraftController>(
    () => ({
      activeProfileId: (profiles) => profiles.activeMapProfileId,
      applyContent: (content) => {
        setEnabledMapDraft(new Set(content.enabledMapIds ?? []));
        setEnabledMapModDraft(new Set(content.enabledModIds));
        setLaunchArgs(content.launchArgs ?? "");
      },
      autoSaveReadyRef: mapAutoSaveReadyRef,
      copyMessage: "地图 Profile 已克隆。",
      createMessage: "已新建空地图 Profile。",
      currentContent: () => ({
        enabledMapIds: [...enabledMapDraftRef.current],
        enabledModIds: [...enabledMapModDraftRef.current],
        launchArgs: launchArgsRef.current
      }),
      currentGameContent: () => ({
        enabledMapIds: scan.maps
          .filter((map) => map.readOnly || (map.protected ? enabledMapDraftRef.current.has(map.id) : map.enabled))
          .map((map) => map.id),
        enabledModIds: scan.otherMods
          .filter(
            (modItem) => modItem.subMaps.length > 0 && (modItem.protected ? enabledMapModDraftRef.current.has(modItem.id) : modItem.enabled)
          )
          .map((modItem) => modItem.id),
        launchArgs: launchArgsRef.current
      }),
      defaultId: "default-maps",
      dirty: mapDirty,
      draftName: mapProfileName,
      duplicateNameMessage: "同名地图 Profile 已存在。",
      emptyContent: () => ({
        enabledMapIds: scan.maps.filter((map) => map.readOnly).map((map) => map.id),
        enabledModIds: [],
        launchArgs: ""
      }),
      emptyNameBase: "New Map Profile",
      overwriteCurrentMessage: "已用当前游戏启用情况覆盖地图 Profile，始终启用条目已保留原 Profile 选择。",
      overwriteProfileMessage: (mode) =>
        mode === "all" ? "已用来源 Profile 覆盖地图 Profile 全部内容。" : "已用来源 Profile 覆盖地图 Profile 启用情况。",
      profiles: mapProfiles,
      profileType: "maps",
      renameMessage: "地图 Profile 已重命名。",
      resolveContent: (profile) => {
        if (profile) return { ...resolveMapProfileContent(profile, scan), launchArgs: profile.launchArgs };
        const readOnlyMapIds = scan.maps.filter((map) => map.readOnly).map((map) => map.id);
        const enabledMapIds = [...new Set([...scan.maps.filter((map) => map.enabled).map((map) => map.id), ...readOnlyMapIds])];
        const enabledModIds = scan.otherMods
          .filter((modItem) => modItem.subMaps.length > 0 && modItem.enabled)
          .map((modItem) => modItem.id);
        return { enabledMapIds, enabledModIds, launchArgs: "" };
      },
      savePayload: ({ content, createdAt, id, name }) => ({
        ...(id ? { id } : {}),
        name,
        profileType: "maps",
        enabledMapIds: content.enabledMapIds ?? [],
        enabledModIds: content.enabledModIds,
        launchArgs: content.launchArgs ?? "",
        ...(createdAt ? { createdAt } : {})
      }),
      selectedId: selectedMapProfileId,
      selectedProfile: selectedMapProfile,
      setDirty: setMapDirty,
      setDraftName: setMapProfileName,
      setSelectedId: setSelectedMapProfileId
    }),
    [mapDirty, mapProfileName, mapProfiles, scan, selectedMapProfile, selectedMapProfileId]
  );

  const modDraftController = useMemo<ProfileDraftController>(
    () => ({
      activeProfileId: (profiles) => profiles.activeModProfileId,
      applyContent: (content) => setEnabledExplicitModDraft(new Set(content.enabledModIds)),
      autoSaveReadyRef: modAutoSaveReadyRef,
      copyMessage: "Mod Profile 已克隆。",
      createMessage: "已新建空 Mod Profile。",
      currentContent: () => ({ enabledModIds: [...enabledExplicitModDraftRef.current] }),
      currentGameContent: () => ({
        enabledModIds: scan.otherMods
          .filter((modItem) => (modItem.protected ? enabledExplicitModDraftRef.current.has(modItem.id) : modItem.enabled))
          .map((modItem) => modItem.id)
      }),
      defaultId: "default-mods",
      dirty: modDirty,
      draftName: modProfileName,
      duplicateNameMessage: "同名 Mod Profile 已存在。",
      emptyContent: () => ({ enabledModIds: [] }),
      emptyNameBase: "New Mod Profile",
      overwriteCurrentMessage: "已用当前游戏启用情况覆盖 Mod Profile，始终启用条目已保留原 Profile 选择。",
      overwriteProfileMessage: (mode) =>
        mode === "all" ? "已用来源 Profile 覆盖 Mod Profile 全部内容。" : "已用来源 Profile 覆盖 Mod Profile 启用情况。",
      profiles: modProfiles,
      profileType: "mods",
      renameMessage: "Mod Profile 已重命名。",
      resolveContent: (profile) =>
        profile
          ? resolveModProfileContent(profile, scan)
          : { enabledModIds: scan.otherMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id) },
      savePayload: ({ content, createdAt, id, name }) => ({
        ...(id ? { id } : {}),
        name,
        profileType: "mods",
        enabledModIds: content.enabledModIds,
        ...(createdAt ? { createdAt } : {})
      }),
      selectedId: selectedModProfileId,
      selectedProfile: selectedModProfile,
      setDirty: setModDirty,
      setDraftName: setModProfileName,
      setSelectedId: setSelectedModProfileId
    }),
    [modDirty, modProfileName, modProfiles, scan, selectedModProfile, selectedModProfileId]
  );

  const hydrateProfileDraft = useCallback(
    (controller: ProfileDraftController, profile: Profile | undefined) => {
      controller.autoSaveReadyRef.current = false;
      controller.setSelectedId(profile?.id ?? controller.defaultId);
      const content = controller.resolveContent(profile);
      controller.applyContent(content);
      controller.setDirty(false);
      if (profile && shouldNormalizeProfileContent(controller, profile)) {
        void enqueueProfileSave(() =>
          saveProfile(
            controller.savePayload({
              content,
              createdAt: profile.createdAt,
              id: profile.id,
              name: profile.name || "Main Profile"
            })
          )
        )
          .then((profiles) => setScan((value) => ({ ...value, profiles })))
          .catch((error) => notifyError(notifier, error));
      }
    },
    [enqueueProfileSave, notifier, setScan]
  );

  useEffect(() => {
    const activeMap = mapProfiles.find((profile) => profile.id === scan.profiles.activeMapProfileId) ?? mapProfiles[0];
    const activeMod = modProfiles.find((profile) => profile.id === scan.profiles.activeModProfileId) ?? modProfiles[0];
    if (!initializedRef.current || !mapDirty) {
      hydrateProfileDraft(mapDraftController, activeMap);
    }
    if (!initializedRef.current || !modDirty) {
      hydrateProfileDraft(modDraftController, activeMod);
    }
    initializedRef.current = true;
  }, [
    hydrateProfileDraft,
    mapDraftController,
    mapDirty,
    mapProfiles,
    modDraftController,
    modDirty,
    modProfiles,
    scan.profiles.activeMapProfileId,
    scan.profiles.activeModProfileId
  ]);

  const persistProfile = useCallback(
    async (controller: ProfileDraftController) => {
      const current = controller.selectedProfile;
      if (!current) return controller.selectedId;
      const profiles = await enqueueProfileSave(() =>
        saveProfile(
          controller.savePayload({
            content: controller.currentContent(),
            createdAt: current.createdAt,
            id: current.id,
            name: current.name || "Main Profile"
          })
        )
      );
      const nextId = current.id || controller.activeProfileId(profiles);
      controller.setDirty(false);
      controller.setSelectedId(nextId);
      setScan((value) => ({ ...value, profiles }));
      return nextId;
    },
    [enqueueProfileSave, setScan]
  );

  useEffect(() => {
    if (!initializedRef.current || !selectedMapProfile) return;
    if (!mapDirty) {
      mapAutoSaveReadyRef.current = true;
      return;
    }
    if (!mapAutoSaveReadyRef.current) return;
    const timer = window.setTimeout(() => {
      if (!mapAutoSaveReadyRef.current) return;
      void persistProfile(mapDraftController).catch((error) => notifyError(notifier, error));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [enabledMapDraft, enabledMapModDraft, launchArgs, mapDirty, mapDraftController, notifier, persistProfile, selectedMapProfile]);

  useEffect(() => {
    if (!initializedRef.current || !selectedModProfile) return;
    if (!modDirty) {
      modAutoSaveReadyRef.current = true;
      return;
    }
    if (!modAutoSaveReadyRef.current) return;
    const timer = window.setTimeout(() => {
      if (!modAutoSaveReadyRef.current) return;
      void persistProfile(modDraftController).catch((error) => notifyError(notifier, error));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [enabledExplicitModDraft, modDirty, modDraftController, notifier, persistProfile, selectedModProfile]);

  function setMapProfileDraft(profile: Profile | undefined) {
    if (!profile) return;
    hydrateProfileDraft(mapDraftController, profile);
  }

  function setModProfileDraft(profile: Profile | undefined) {
    if (!profile) return;
    hydrateProfileDraft(modDraftController, profile);
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

  async function copyProfile(controller: ProfileDraftController, sourceProfile = controller.selectedProfile) {
    await runProfileTask(async () => {
      controller.autoSaveReadyRef.current = false;
      const source = sourceProfile;
      if (!source) return;
      if (controller.dirty) await persistProfile(controller);
      const content = source.id === controller.selectedId ? controller.currentContent() : controller.resolveContent(source);
      const sourceName = source.name || "Main Profile";
      const profiles = await enqueueProfileSave(() =>
        saveProfile(controller.savePayload({ content, name: nextCopyName(sourceName, controller.profiles) }))
      );
      controller.setDirty(false);
      controller.autoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      controller.setSelectedId(controller.activeProfileId(profiles));
      controller.applyContent(content);
      notifier.showSuccess(controller.copyMessage);
    });
  }

  async function copyMapProfile(sourceProfile = selectedMapProfile) {
    await copyProfile(mapDraftController, sourceProfile);
  }

  async function copyModProfile(sourceProfile = selectedModProfile) {
    await copyProfile(modDraftController, sourceProfile);
  }

  async function createEmptyProfile(controller: ProfileDraftController) {
    await runProfileTask(async () => {
      controller.autoSaveReadyRef.current = false;
      const content = controller.emptyContent();
      const nextName = controller.draftName.trim() || nextNewProfileName(controller.emptyNameBase, controller.profiles);
      const profiles = await enqueueProfileSave(() => saveProfile(controller.savePayload({ content, name: nextName })));
      controller.setDirty(false);
      controller.autoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      controller.setSelectedId(controller.activeProfileId(profiles));
      controller.setDraftName("");
      controller.applyContent(content);
      notifier.showSuccess(controller.createMessage);
    });
  }

  async function createEmptyMapProfile() {
    await createEmptyProfile(mapDraftController);
  }

  async function createEmptyModProfile() {
    await createEmptyProfile(modDraftController);
  }

  async function renameProfile(controller: ProfileDraftController, profile: Profile, name: string) {
    await runProfileTask(async () => {
      const nextName = name.trim();
      if (!nextName) {
        notifier.showWarning("Profile 名称不能为空。");
        return;
      }
      if (profileNameExists(controller.profiles, nextName, profile.id)) {
        notifier.showWarning(controller.duplicateNameMessage);
        return;
      }

      controller.autoSaveReadyRef.current = false;
      const isSelectedProfile = profile.id === controller.selectedId;
      const content = isSelectedProfile ? controller.currentContent() : controller.resolveContent(profile);
      const profiles = await enqueueProfileSave(() =>
        saveProfile(controller.savePayload({ content, createdAt: profile.createdAt, id: profile.id, name: nextName }))
      );

      if (isSelectedProfile) {
        controller.setDirty(false);
        controller.setSelectedId(profile.id);
        controller.applyContent(content);
      }
      controller.autoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      notifier.showSuccess(controller.renameMessage);
    });
  }

  async function renameMapProfile(profile: Profile, name: string) {
    await renameProfile(mapDraftController, profile, name);
  }

  async function renameModProfile(profile: Profile, name: string) {
    await renameProfile(modDraftController, profile, name);
  }

  async function removeProfile(controller: ProfileDraftController, profile: Profile) {
    await runProfileTask(async () => {
      const profiles = await enqueueProfileSave(() => deleteProfile(profile.id));
      controller.setDirty(false);
      setScan((value) => ({ ...value, profiles }));
      controller.setSelectedId(controller.activeProfileId(profiles));
      notifier.showSuccess(`${controller.profileType === "maps" ? "地图" : "Mod"} Profile 已删除。`);
    });
  }

  async function deleteMapProfile(profile: Profile) {
    await removeProfile(mapDraftController, profile);
  }

  async function deleteModProfile(profile: Profile) {
    await removeProfile(modDraftController, profile);
  }

  async function applySelectedProfiles() {
    await runProfileTask(async () => {
      const mapId = mapDirty ? await persistProfile(mapDraftController) : selectedMapProfileId;
      const modId = modDirty ? await persistProfile(modDraftController) : selectedModProfileId;
      await applyProfiles(mapId, modId, "已应用地图和 Mod Profile。");
    });
  }

  async function launchSelectedProfiles() {
    return await runProfileTask<LaunchResult>(async () => {
      const mapId = mapDirty ? await persistProfile(mapDraftController) : selectedMapProfileId;
      const modId = modDirty ? await persistProfile(modDraftController) : selectedModProfileId;
      const applied = await enqueueProfileSave(() => applyProfile(celestePath, mapId, modId));
      setScan(applied);
      const result = await launchGame(celestePath, launchArgs);
      notifier.showSuccess(`已启动：${result.executable}`);
      return result;
    });
  }

  async function launchCurrentGame() {
    return await runProfileTask<LaunchResult>(async () => {
      const result = await launchGame(celestePath, launchArgs);
      notifier.showSuccess(`已启动：${result.executable}`);
      return result;
    });
  }

  async function overwriteProfileFromCurrent(controller: ProfileDraftController) {
    await runProfileTask(async () => {
      controller.autoSaveReadyRef.current = false;
      const content = controller.currentGameContent();
      controller.applyContent(content);
      controller.setDirty(true);
      const current = controller.selectedProfile;
      if (!current) return;
      const profiles = await enqueueProfileSave(() =>
        saveProfile(
          controller.savePayload({
            content,
            createdAt: current.createdAt,
            id: current.id,
            name: current.name || "Main Profile"
          })
        )
      );
      controller.setDirty(false);
      controller.autoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      notifier.showSuccess(controller.overwriteCurrentMessage);
    });
  }

  async function overwriteMapProfileFromCurrent() {
    await overwriteProfileFromCurrent(mapDraftController);
  }

  async function overwriteModProfileFromCurrent() {
    await overwriteProfileFromCurrent(modDraftController);
  }

  async function overwriteProfileFromProfile(controller: ProfileDraftController, sourceProfileId: string, mode: ProfileOverwriteMode) {
    await runProfileTask(async () => {
      controller.autoSaveReadyRef.current = false;
      const current = controller.selectedProfile;
      const source = controller.profiles.find((profile) => profile.id === sourceProfileId);
      if (!current || !source || current.id === source.id) return;
      const sourceContent = controller.resolveContent(source);
      const content = mode === "all" ? sourceContent : { ...sourceContent, launchArgs: controller.currentContent().launchArgs };
      const nextName = mode === "all" ? source.name : current.name || "Main Profile";
      const profiles = await enqueueProfileSave(() =>
        saveProfile(
          controller.savePayload({
            content,
            createdAt: current.createdAt,
            id: current.id,
            name: nextName
          })
        )
      );
      controller.applyContent(content);
      controller.setDirty(false);
      controller.autoSaveReadyRef.current = true;
      setScan((value) => ({ ...value, profiles }));
      notifier.showSuccess(controller.overwriteProfileMessage(mode));
    });
  }

  async function overwriteMapProfileFromProfile(sourceProfileId: string, mode: ProfileOverwriteMode) {
    await overwriteProfileFromProfile(mapDraftController, sourceProfileId, mode);
  }

  async function overwriteModProfileFromProfile(sourceProfileId: string, mode: ProfileOverwriteMode) {
    await overwriteProfileFromProfile(modDraftController, sourceProfileId, mode);
  }

  async function applyProfiles(mapProfileId: string, modProfileId: string, successMessage: string) {
    const result = await enqueueProfileSave(() => applyProfile(celestePath, mapProfileId, modProfileId));
    setMapDirty(false);
    setModDirty(false);
    setScan(result);
    notifier.showSuccess(successMessage);
  }

  async function runProfileTask<T>(task: () => Promise<T>): Promise<T | null> {
    setLoading(true);
    notifier.clearNotice();
    try {
      return await task();
    } catch (error) {
      notifyError(notifier, error);
      return null;
    } finally {
      setLoading(false);
    }
  }

  function shouldNormalizeProfileContent(controller: ProfileDraftController, profile: Profile) {
    return controller.profileType === "maps" ? !profile.enabledMapIds || !profile.enabledModIds : !profile.enabledModIds;
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
    renameMapProfile,
    renameModProfile,
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
