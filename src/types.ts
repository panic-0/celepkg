export type Dependency = {
  name: string;
  version: string;
};

export type ModMetadata = {
  name: string;
  version: string;
  author: string;
  description: string;
  dependencies: Dependency[];
  optionalDependencies: Dependency[];
};

export type MapStats = {
  deaths: number;
  strawberries: number;
  timePlayed: number;
  completed: boolean;
  cassettes: number;
  hearts: number;
  saveFiles: string[];
};

export type SubMapInfo = {
  id: string;
  sid: string;
  displayName: string;
  chapter: string;
  filePath: string;
  stats: MapStats | null;
};

export type ModRecord = {
  id: string;
  name: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  isArchive: boolean;
  kind: "map" | "mod";
  enabled: boolean;
  favorite: boolean;
  protected: boolean;
  metadata: ModMetadata;
  mapIds: string[];
  subMaps: SubMapInfo[];
  mapCount: number;
  dependencies: Dependency[];
  optionalDependencies: Dependency[];
  stats: MapStats | null;
  warnings: string[];
};

export type Profile = {
  id: string;
  name: string;
  profileType: "maps" | "mods";
  enabledMapIds: string[] | null;
  enabledModIds: string[] | null;
  launchArgs: string;
  createdAt: string;
  updatedAt: string;
};

export type ProfilesState = {
  activeMapProfileId: string;
  activeModProfileId: string;
  profiles: Profile[];
};

export type ScanResult = {
  celestePath: string;
  modsPath: string;
  blacklistPath: string;
  blacklistEntries: string[];
  gameExecutable: string;
  maps: ModRecord[];
  otherMods: ModRecord[];
  profiles: ProfilesState;
  warnings: string[];
};
