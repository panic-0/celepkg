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
  const [enabledModDraft, setEnabledModDraft] = useState<Set<string>>(new Set());
  const [selectedProfileId, setSelectedProfileId] = useState("default");
  const [profileName, setProfileName] = useState("新地图组");
  const [launchArgs, setLaunchArgs] = useState("");
  const [draftDirty, setDraftDirty] = useState(false);
  const initializedRef = useRef(false);
  const lastHydratedProfileIdRef = useRef("");

  const selectedProfile = useMemo(
    () => scan.profiles.profiles.find((profile) => profile.id === selectedProfileId),
    [scan.profiles.profiles, selectedProfileId]
  );

  useEffect(() => {
    const activeId = scan.profiles.activeProfileId;
    const active = scan.profiles.profiles.find((profile) => profile.id === activeId);
    if (!initializedRef.current || !draftDirty) {
      hydrateDraftFromProfile(active, activeId);
    }
  }, [draftDirty, scan.maps, scan.otherMods, scan.profiles]);

  function hydrateDraftFromProfile(profile: Profile | undefined, profileId = profile?.id ?? "default") {
    setSelectedProfileId(profileId);
    setLaunchArgs(profile?.launchArgs ?? "");
    applyDraftFromProfile(profile);
    initializedRef.current = true;
    lastHydratedProfileIdRef.current = profileId;
    setDraftDirty(false);
  }

  function applyDraftFromProfile(profile: Profile | undefined) {
    if (profile?.enabledMapIds) {
      setEnabledMapDraft(new Set(profile.enabledMapIds));
    } else {
      setEnabledMapDraft(new Set(scan.maps.filter((map) => map.enabled).map((map) => map.id)));
    }
    if (profile?.enabledModIds) {
      setEnabledModDraft(new Set(profile.enabledModIds));
    } else {
      setEnabledModDraft(new Set(scan.otherMods.filter((modItem) => modItem.enabled).map((modItem) => modItem.id)));
    }
  }

  function setProfileDraft(profile: Profile | undefined) {
    if (!profile) return;
    hydrateDraftFromProfile(profile, profile.id);
    setDraftDirty(true);
  }

  const updateEnabledMapDraft: Dispatch<SetStateAction<Set<string>>> = (action) => {
    setDraftDirty(true);
    setEnabledMapDraft(action);
  };

  const updateEnabledModDraft: Dispatch<SetStateAction<Set<string>>> = (action) => {
    setDraftDirty(true);
    setEnabledModDraft(action);
  };

  function updateLaunchArgs(value: string) {
    setDraftDirty(true);
    setLaunchArgs(value);
  }

  async function persistCurrentProfile() {
    const current = selectedProfile;
    const profiles = await saveProfile({
      id: current?.id,
      name: current?.name || profileName,
      enabledMapIds: [...enabledMapDraft],
      enabledModIds: [...enabledModDraft],
      launchArgs,
      createdAt: current?.createdAt
    });
    const nextId = current?.id || profiles.activeProfileId;
    setDraftDirty(false);
    setSelectedProfileId(nextId);
    lastHydratedProfileIdRef.current = nextId;
    setScan((value) => ({ ...value, profiles }));
    return nextId;
  }

  async function saveCurrentProfile(applyAfterSave: boolean) {
    setLoading(true);
    setMessage("");
    try {
      const nextId = await persistCurrentProfile();
      if (applyAfterSave) {
        const result = await applyProfile(celestePath, nextId);
        setDraftDirty(false);
        setScan(result);
        setMessage("Profile 已保存并应用到 blacklist.txt。");
      } else {
        setMessage("Profile 已保存。");
      }
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveAsProfile() {
    setLoading(true);
    setMessage("");
    try {
      const profiles = await saveProfile({
        name: profileName,
        enabledMapIds: [...enabledMapDraft],
        enabledModIds: [...enabledModDraft],
        launchArgs
      });
      setDraftDirty(false);
      setScan((value) => ({ ...value, profiles }));
      setSelectedProfileId(profiles.activeProfileId);
      lastHydratedProfileIdRef.current = profiles.activeProfileId;
      setMessage("新的地图 Profile 已保存。");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function applySelectedProfile() {
    setLoading(true);
    setMessage("");
    try {
      const result = await applyProfile(celestePath, selectedProfileId);
      setDraftDirty(false);
      setScan(result);
      setMessage("已应用 Profile。");
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function launchSelectedProfile() {
    setLoading(true);
    setMessage("");
    try {
      const nextId = await persistCurrentProfile();
      const applied = await applyProfile(celestePath, nextId);
      setDraftDirty(false);
      setScan(applied);
      const result = await launchProfile(celestePath, nextId);
      setMessage(`已启动：${result.executable}`);
    } catch (error) {
      setMessage(readError(error));
    } finally {
      setLoading(false);
    }
  }

  function toggleMap(id: string) {
    setDraftDirty(true);
    setEnabledMapDraft((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMod(id: string) {
    setDraftDirty(true);
    setEnabledModDraft((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return {
    applySelectedProfile,
    enabledMapDraft,
    enabledModDraft,
    launchArgs,
    launchSelectedProfile,
    profileName,
    saveAsProfile,
    saveCurrentProfile,
    selectedProfileId,
    setEnabledMapDraft: updateEnabledMapDraft,
    setEnabledModDraft: updateEnabledModDraft,
    setLaunchArgs: updateLaunchArgs,
    setProfileDraft,
    setProfileName,
    toggleMap,
    toggleMod
  };
}
