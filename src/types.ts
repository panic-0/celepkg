export type {
  BackupFileEntry,
  BackupInfo,
  BackupModEntry,
  CompletionStatus,
  ConfigResponse,
  Dependency,
  EverestInstallResult,
  EverestRelease,
  EverestReleaseList,
  GameBananaCatalogStats,
  GameBananaCatalogStatsResult,
  GameStatus,
  GameStatusPhase,
  InstalledModMatch,
  LaunchMethod,
  LaunchResult,
  MapStats,
  ModCatalogDependencyResolution,
  ModCatalogDependencyResolutionResult,
  ModCatalogEntry,
  ModCatalogSearchResult,
  ModCatalogSourceKind,
  ModDownloadProgress,
  ModInstallResult,
  ModMetadata,
  ModPreviewStaging,
  ModRecord,
  ModUpdateCandidate,
  ModUpdateCheckResult,
  Profile,
  ProfilesState,
  RestoreScope,
  SaveFileInfo,
  ScanResult,
  ScanTiming,
  StagedDownload,
  SubMapInfo
} from "./generated/api-types";

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
