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
  totalStrawberries: number;
  staleStrawberries: number;
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
  difficulty: string;
  strawberryCount: number;
  strawberryTotalCount: number;
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
  strawberryTotalCount: number;
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

export type AppNoticeTone = "success" | "info" | "warning" | "error";

export type AppNotice = {
  id: number;
  tone: AppNoticeTone;
  text: string;
};

export type AppNotifier = {
  clearNotice: () => void;
  showError: (text: string) => void;
  showInfo: (text: string) => void;
  showSuccess: (text: string) => void;
  showWarning: (text: string) => void;
};

export type AppUpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

export type AppUpdateState = {
  status: AppUpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  notes: string | null;
  date: string | null;
  downloaded: number;
  total: number | null;
  error: string | null;
};

export type ConfigResponse = {
  celestePath: string;
  autoBackupEnabled: boolean;
  autoBackupCleanupEnabled: boolean;
  autoBackupRetentionCount: number;
  modCatalogSourceOrder: ModCatalogSourceKind[];
  modCatalogSourceEnabledCount: number;
  autoCheckModUpdatesOnStartup: boolean;
  autoCheckAppUpdatesOnStartup: boolean;
  autoRefreshModCatalogCacheOnStartup: boolean;
  selectedSaveFiles: string[];
  profiles: ProfilesState;
  warnings: string[];
};

export type BackupFileEntry = {
  category: "state" | "game";
  label: string;
  targetPath: string;
  backupPath: string;
  existed: boolean;
};

export type BackupModEntry = {
  name: string;
  metadataName: string;
  fileName: string;
  relativePath: string;
  version: string;
  enabled: boolean;
  isArchive: boolean;
};

export type BackupInfo = {
  id: string;
  createdAt: string;
  kind: "manual" | "auto";
  celestePath: string;
  backupPath: string;
  files: BackupFileEntry[];
  mods: BackupModEntry[];
};

export type RestoreScope = "game";

export type ModCatalogSourceKind = "everest" | "everestMirror" | "wegfan";

export type ModCatalogEntry = {
  source: ModCatalogSourceKind;
  id: string;
  name: string;
  version: string;
  downloadUrl: string;
  pageUrl: string;
  gameBananaType: string;
  categoryName: string;
  subCategoryName: string;
  gameBananaId: number | null;
  gameBananaFileId: number | null;
  size: number | null;
  lastUpdate: number | null;
  xxHash: string[];
};

export type ModCatalogSearchResult = {
  sources: ModCatalogSourceKind[];
  entries: ModCatalogEntry[];
  warnings: string[];
};

export type InstalledModMatch = {
  recordId: string;
  name: string;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  version: string;
  hash: string;
};

export type ModUpdateCandidate = {
  entry: ModCatalogEntry;
  installed: InstalledModMatch;
  updateAvailable: boolean;
  reason: string;
};

export type ModUpdateCheckResult = {
  sources: ModCatalogSourceKind[];
  updates: ModUpdateCandidate[];
  matched: ModUpdateCandidate[];
  warnings: string[];
};

export type ModInstallResult = {
  entry: ModCatalogEntry;
  destinationPath: string;
  replacedPath: string | null;
  hash: string;
  scan: ScanResult;
};

export type StagedDownload = {
  stagedId: string;
  name: string;
  kind: "mod" | "everest";
  size: number | null;
  hash: string | null;
};

export type ModPreviewStaging = {
  staged: StagedDownload;
  metadata: ModMetadata;
};

export type ModDownloadProgress = {
  operationId: string;
  modName: string;
  phase: "downloading" | "verifying" | "installing" | "done" | "error";
  downloaded: number;
  total: number | null;
  speedBytesPerSec: number;
  taskIndex: number;
  taskTotal: number;
  url: string;
};

export type EverestRelease = {
  branch: string;
  version: number;
  date: string;
  commit: string;
  mainFileSize: number | null;
  mainDownload: string;
  mirrorDownload: string;
  isNative: boolean;
};

export type EverestReleaseList = {
  releases: EverestRelease[];
  warnings: string[];
};

export type EverestInstallResult = {
  release: EverestRelease;
  scan: ScanResult;
};

export type ScanTiming = {
  stage: string;
  ms: number;
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
  availableSaveFiles: SaveFileInfo[];
  selectedSaveFiles: string[];
  warnings: string[];
  timings: ScanTiming[];
};
