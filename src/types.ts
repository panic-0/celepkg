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
  strawberriesKnown: boolean;
  timePlayed: number;
  completed: boolean;
  completionKnown: boolean;
  cassettes: number;
  hearts: number;
  saveFiles: string[];
};

export type SaveFileInfo = {
  name: string;
  playerName: string;
  currentMap: string;
  lastModified: string;
};

export type CompletionStatus = "completed" | "unfinished" | "unknown" | "notApplicable";

export type SubMapInfo = {
  id: string;
  sid: string;
  modeIndex: number | null;
  displayName: string;
  chapter: string;
  filePath: string;
  strawberryCount: number;
  completionStatus: CompletionStatus;
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
  readOnly: boolean;
  metadata: ModMetadata;
  mapIds: string[];
  subMaps: SubMapInfo[];
  mapCount: number;
  strawberryCount: number;
  completionStatus: CompletionStatus;
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

export type ConfigResponse = {
  celestePath: string;
  autoBackupEnabled: boolean;
  selectedSaveFiles: string[];
  profiles: ProfilesState;
};

export type BackupFileEntry = {
  category: "state" | "game";
  label: string;
  targetPath: string;
  backupPath: string;
  existed: boolean;
};

export type BackupInfo = {
  id: string;
  createdAt: string;
  kind: "manual" | "auto";
  celestePath: string;
  backupPath: string;
  files: BackupFileEntry[];
};

export type RestoreScope = "game";

export type ScanResult = {
  celestePath: string;
  modsPath: string;
  blacklistPath: string;
  blacklistEntries: string[];
  gameExecutable: string;
  maps: ModRecord[];
  otherMods: ModRecord[];
  profiles: ProfilesState;
  availableSaveFiles: SaveFileInfo[];
  selectedSaveFiles: string[];
  warnings: string[];
};
