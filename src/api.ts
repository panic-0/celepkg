import { invoke } from "@tauri-apps/api/core";
import type { Profile, ProfilesState, ScanResult } from "./types";

export async function getConfig(): Promise<{ celestePath: string; profiles: ProfilesState }> {
  return invoke("get_config");
}

export async function setCelestePath(celestePath: string): Promise<{ celestePath: string }> {
  return invoke("set_celeste_path", { celestePath });
}

export async function scanCeleste(celestePath: string): Promise<ScanResult> {
  return invoke("scan_celeste", { celestePath });
}

export async function saveProfile(profile: Partial<Profile> & { name: string }): Promise<ProfilesState> {
  return invoke("save_profile", { profile });
}

export async function applyProfile(celestePath: string, mapProfileId: string, modProfileId: string): Promise<ScanResult> {
  return invoke("apply_profile", { celestePath, mapProfileId, modProfileId });
}

export async function launchProfile(
  celestePath: string,
  mapProfileId: string,
  modProfileId: string
): Promise<{ launched: boolean; executable: string; mapProfileId: string; modProfileId: string }> {
  return invoke("launch_profile", { celestePath, mapProfileId, modProfileId });
}

export async function setRecordFavorite(celestePath: string, recordId: string, favorite: boolean): Promise<ScanResult> {
  return invoke("set_record_favorite", { celestePath, recordId, favorite });
}

export async function setRecordProtected(celestePath: string, recordId: string, protectedValue: boolean): Promise<ScanResult> {
  return invoke("set_record_protected", { celestePath, recordId, protected: protectedValue });
}
