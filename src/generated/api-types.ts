/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "BackupFileCategory".
 */
export type BackupFileCategory = "state" | "game";
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "BackupKind".
 */
export type BackupKind = "manual" | "auto";
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "BackupInfoList".
 */
export type BackupInfoList = BackupInfo[];
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "BooleanResponse".
 */
export type BooleanResponse = boolean;
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModCatalogSourceKind".
 */
export type ModCatalogSourceKind = "everest" | "everestMirror" | "wegfan";
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "CompletionStatus".
 */
export type CompletionStatus = "completed" | "unfinished" | "unknown" | "notApplicable";
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ProfileType".
 */
export type ProfileType = "maps" | "mods";
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModKind".
 */
export type ModKind = "map" | "mod";
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModDownloadPhase".
 */
export type ModDownloadPhase = "downloading" | "verifying" | "installing" | "done" | "error";
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "StagedDownloadKind".
 */
export type StagedDownloadKind = "mod" | "everest";
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "NullableString".
 */
export type NullableString = string | null;
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "RestoreScope".
 */
export type RestoreScope = "game";
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "VoidResponse".
 */
export type VoidResponse = null;

export interface ApiTypes {
  AppConfig: AppConfig;
  ApplyProfilePayload: ApplyProfilePayload;
  BackupFileCategory: BackupFileCategory;
  BackupFileEntry: BackupFileEntry;
  BackupIdPayload: BackupIdPayload;
  BackupInfo: BackupInfo;
  BackupInfoList: BackupInfoList;
  BackupKind: BackupKind;
  BackupModEntry: BackupModEntry;
  BooleanResponse: BooleanResponse;
  CancelModDownloadPayload: CancelModDownloadPayload;
  CelestePathPayload: CelestePathPayload;
  CheckModUpdatesPayload: CheckModUpdatesPayload;
  CompletionStatus: CompletionStatus;
  ConfigResponse: ConfigResponse;
  CreateBackupPayload: CreateBackupPayload;
  DeleteProfilePayload: DeleteProfilePayload;
  DeleteStagedDownloadPayload: DeleteStagedDownloadPayload;
  Dependency: Dependency;
  DownloadEverestToStagingPayload: DownloadEverestToStagingPayload;
  DownloadModToStagingPayload: DownloadModToStagingPayload;
  EverestInstallResult: EverestInstallResult;
  EverestRelease: EverestRelease;
  EverestReleaseList: EverestReleaseList;
  InstallStagedEverestPayload: InstallStagedEverestPayload;
  InstallStagedModPayload: InstallStagedModPayload;
  InstalledModMatch: InstalledModMatch;
  LaunchGamePayload: LaunchGamePayload;
  LaunchProfilePayload: LaunchProfilePayload;
  LaunchResult: LaunchResult;
  MapStats: MapStats;
  ModCatalogDependencyResolution: ModCatalogDependencyResolution;
  ModCatalogDependencyResolutionResult: ModCatalogDependencyResolutionResult;
  ModCatalogEntry: ModCatalogEntry;
  ModCatalogSearchResult: ModCatalogSearchResult;
  ModCatalogSourceKind: ModCatalogSourceKind;
  ModDownloadPhase: ModDownloadPhase;
  ModDownloadProgress: ModDownloadProgress;
  ModInstallResult: ModInstallResult;
  ModKind: ModKind;
  ModMetadata: ModMetadata;
  ModPreviewStaging: ModPreviewStaging;
  ModRecord: ModRecord;
  ModUpdateCandidate: ModUpdateCandidate;
  ModUpdateCheckResult: ModUpdateCheckResult;
  NullableString: NullableString;
  OpenBackupFolderPayload: OpenBackupFolderPayload;
  OpenBackupLocationPayload: OpenBackupLocationPayload;
  OpenModLocationPayload: OpenModLocationPayload;
  PreviewModUpdateMetadataPayload: PreviewModUpdateMetadataPayload;
  Profile: Profile;
  ProfileInput: ProfileInput;
  ProfileType: ProfileType;
  ProfilesState: ProfilesState;
  ReadStagedModMetadataPayload: ReadStagedModMetadataPayload;
  RefreshModCatalogCachePayload: RefreshModCatalogCachePayload;
  ResolveModCatalogDependenciesPayload: ResolveModCatalogDependenciesPayload;
  RestoreBackupPayload: RestoreBackupPayload;
  RestoreScope: RestoreScope;
  SaveFileInfo: SaveFileInfo;
  SaveProfilePayload: SaveProfilePayload;
  ScanResult: ScanResult;
  ScanTiming: ScanTiming;
  SearchModCatalogPayload: SearchModCatalogPayload;
  SetAutoBackupCleanupEnabledPayload: SetAutoBackupCleanupEnabledPayload;
  SetAutoBackupEnabledPayload: SetAutoBackupEnabledPayload;
  SetAutoBackupRetentionCountPayload: SetAutoBackupRetentionCountPayload;
  SetAutoCheckAppUpdatesOnStartupPayload: SetAutoCheckAppUpdatesOnStartupPayload;
  SetAutoCheckModUpdatesOnStartupPayload: SetAutoCheckModUpdatesOnStartupPayload;
  SetAutoRefreshModCatalogCacheOnStartupPayload: SetAutoRefreshModCatalogCacheOnStartupPayload;
  SetCelestePathPayload: SetCelestePathPayload;
  SetModCatalogSourcesPayload: SetModCatalogSourcesPayload;
  SetRecordFavoritePayload: SetRecordFavoritePayload;
  SetRecordProtectedPayload: SetRecordProtectedPayload;
  SetSelectedSaveFilesPayload: SetSelectedSaveFilesPayload;
  StageModPreviewPayload: StageModPreviewPayload;
  StagedDownload: StagedDownload;
  StagedDownloadKind: StagedDownloadKind;
  SubMapInfo: SubMapInfo;
  VoidResponse: VoidResponse;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "AppConfig".
 */
export interface AppConfig {
  celestePath: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ApplyProfilePayload".
 */
export interface ApplyProfilePayload {
  celestePath: string;
  mapProfileId: string;
  modProfileId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "BackupFileEntry".
 */
export interface BackupFileEntry {
  backupPath: string;
  category: BackupFileCategory;
  existed: boolean;
  label: string;
  targetPath: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "BackupIdPayload".
 */
export interface BackupIdPayload {
  backupId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "BackupInfo".
 */
export interface BackupInfo {
  backupPath: string;
  celestePath: string;
  createdAt: string;
  files: BackupFileEntry[];
  id: string;
  kind: BackupKind;
  mods: BackupModEntry[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "BackupModEntry".
 */
export interface BackupModEntry {
  enabled: boolean;
  fileName: string;
  isArchive: boolean;
  metadataName: string;
  name: string;
  relativePath: string;
  version: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "CancelModDownloadPayload".
 */
export interface CancelModDownloadPayload {
  operationId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "CelestePathPayload".
 */
export interface CelestePathPayload {
  celestePath: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "CheckModUpdatesPayload".
 */
export interface CheckModUpdatesPayload {
  celestePath: string;
  sources: ModCatalogSourceKind[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ConfigResponse".
 */
export interface ConfigResponse {
  autoBackupCleanupEnabled: boolean;
  autoBackupEnabled: boolean;
  autoBackupRetentionCount: number;
  autoCheckAppUpdatesOnStartup: boolean;
  autoCheckModUpdatesOnStartup: boolean;
  autoRefreshModCatalogCacheOnStartup: boolean;
  celestePath: string;
  modCatalogSourceEnabledCount: number;
  modCatalogSourceOrder: ModCatalogSourceKind[];
  profiles: ProfilesState;
  selectedSaveFiles: string[];
  warnings: string[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ProfilesState".
 */
export interface ProfilesState {
  activeMapProfileId: string;
  activeModProfileId: string;
  profiles: Profile[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "Profile".
 */
export interface Profile {
  createdAt: string;
  enabledMapIds: string[] | null;
  enabledModIds: string[] | null;
  id: string;
  launchArgs: string;
  name: string;
  profileType: ProfileType;
  updatedAt: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "CreateBackupPayload".
 */
export interface CreateBackupPayload {
  celestePath: string;
  kind: BackupKind;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "DeleteProfilePayload".
 */
export interface DeleteProfilePayload {
  profileId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "DeleteStagedDownloadPayload".
 */
export interface DeleteStagedDownloadPayload {
  celestePath: string;
  stagedId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "Dependency".
 */
export interface Dependency {
  name: string;
  version: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "DownloadEverestToStagingPayload".
 */
export interface DownloadEverestToStagingPayload {
  celestePath: string;
  operationId: string;
  release: EverestRelease;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "EverestRelease".
 */
export interface EverestRelease {
  branch: string;
  commit: string;
  date: string;
  isNative: boolean;
  mainDownload: string;
  mainFileSize: number | null;
  mirrorDownload: string;
  version: number;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "DownloadModToStagingPayload".
 */
export interface DownloadModToStagingPayload {
  celestePath: string;
  entry: ModCatalogEntry;
  operationId: string;
  taskIndex: number;
  taskTotal: number;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModCatalogEntry".
 */
export interface ModCatalogEntry {
  categoryName: string;
  downloadUrl: string;
  gameBananaFileId: number | null;
  gameBananaId: number | null;
  gameBananaType: string;
  id: string;
  lastUpdate: number | null;
  name: string;
  pageUrl: string;
  size: number | null;
  source: ModCatalogSourceKind;
  subCategoryName: string;
  version: string;
  xxHash: string[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "EverestInstallResult".
 */
export interface EverestInstallResult {
  release: EverestRelease;
  scan: ScanResult;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ScanResult".
 */
export interface ScanResult {
  availableSaveFiles: SaveFileInfo[];
  blacklistEntries: string[];
  blacklistPath: string;
  celestePath: string;
  gameExecutable: string;
  maps: ModRecord[];
  modsPath: string;
  otherMods: ModRecord[];
  profiles: ProfilesState;
  selectedSaveFiles: string[];
  timings: ScanTiming[];
  warnings: string[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SaveFileInfo".
 */
export interface SaveFileInfo {
  currentMap: string;
  lastModified: string;
  name: string;
  playerName: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModRecord".
 */
export interface ModRecord {
  absolutePath: string;
  completionStatus: CompletionStatus;
  dependencies: Dependency[];
  enabled: boolean;
  favorite: boolean;
  fileName: string;
  id: string;
  isArchive: boolean;
  kind: ModKind;
  mapCount: number;
  mapIds: string[];
  metadata: ModMetadata;
  name: string;
  optionalDependencies: Dependency[];
  protected: boolean;
  readOnly: boolean;
  relativePath: string;
  stats: MapStats | null;
  strawberryCount: number;
  strawberryTotalCount: number;
  subMaps: SubMapInfo[];
  warnings: string[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModMetadata".
 */
export interface ModMetadata {
  author: string;
  dependencies: Dependency[];
  description: string;
  name: string;
  optionalDependencies: Dependency[];
  version: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "MapStats".
 */
export interface MapStats {
  cassettes: number;
  completed: boolean;
  completionKnown: boolean;
  deaths: number;
  hearts: number;
  saveFiles: string[];
  staleStrawberries: number;
  strawberries: number;
  strawberriesKnown: boolean;
  timePlayed: number;
  totalStrawberries: number;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SubMapInfo".
 */
export interface SubMapInfo {
  chapter: string;
  completionStatus: CompletionStatus;
  difficulty: string;
  displayName: string;
  filePath: string;
  id: string;
  modeIndex: number | null;
  sid: string;
  stats: MapStats | null;
  strawberryCount: number;
  strawberryTotalCount: number;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ScanTiming".
 */
export interface ScanTiming {
  ms: number;
  stage: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "EverestReleaseList".
 */
export interface EverestReleaseList {
  releases: EverestRelease[];
  warnings: string[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "InstallStagedEverestPayload".
 */
export interface InstallStagedEverestPayload {
  celestePath: string;
  release: EverestRelease;
  stagedId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "InstallStagedModPayload".
 */
export interface InstallStagedModPayload {
  celestePath: string;
  entry: ModCatalogEntry;
  installedPath?: string | null;
  stagedId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "InstalledModMatch".
 */
export interface InstalledModMatch {
  absolutePath: string;
  fileName: string;
  hash: string;
  name: string;
  recordId: string;
  relativePath: string;
  version: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "LaunchGamePayload".
 */
export interface LaunchGamePayload {
  celestePath: string;
  launchArgs: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "LaunchProfilePayload".
 */
export interface LaunchProfilePayload {
  celestePath: string;
  mapProfileId: string;
  modProfileId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "LaunchResult".
 */
export interface LaunchResult {
  executable: string;
  launched: boolean;
  mapProfileId: string;
  modProfileId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModCatalogDependencyResolution".
 */
export interface ModCatalogDependencyResolution {
  dependency: Dependency;
  entry: ModCatalogEntry | null;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModCatalogDependencyResolutionResult".
 */
export interface ModCatalogDependencyResolutionResult {
  resolutions: ModCatalogDependencyResolution[];
  sources: ModCatalogSourceKind[];
  warnings: string[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModCatalogSearchResult".
 */
export interface ModCatalogSearchResult {
  entries: ModCatalogEntry[];
  sources: ModCatalogSourceKind[];
  warnings: string[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModDownloadProgress".
 */
export interface ModDownloadProgress {
  downloaded: number;
  modName: string;
  operationId: string;
  phase: ModDownloadPhase;
  speedBytesPerSec: number;
  taskIndex: number;
  taskTotal: number;
  total: number | null;
  url: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModInstallResult".
 */
export interface ModInstallResult {
  destinationPath: string;
  entry: ModCatalogEntry;
  hash: string;
  replacedPath: string | null;
  scan: ScanResult;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModPreviewStaging".
 */
export interface ModPreviewStaging {
  metadata: ModMetadata;
  staged: StagedDownload;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "StagedDownload".
 */
export interface StagedDownload {
  hash: string | null;
  kind: StagedDownloadKind;
  name: string;
  size: number | null;
  stagedId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModUpdateCandidate".
 */
export interface ModUpdateCandidate {
  entry: ModCatalogEntry;
  installed: InstalledModMatch;
  reason: string;
  updateAvailable: boolean;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ModUpdateCheckResult".
 */
export interface ModUpdateCheckResult {
  matched: ModUpdateCandidate[];
  sources: ModCatalogSourceKind[];
  updates: ModUpdateCandidate[];
  warnings: string[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "OpenBackupFolderPayload".
 */
export interface OpenBackupFolderPayload {
  celestePath: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "OpenBackupLocationPayload".
 */
export interface OpenBackupLocationPayload {
  backupPath: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "OpenModLocationPayload".
 */
export interface OpenModLocationPayload {
  absolutePath: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "PreviewModUpdateMetadataPayload".
 */
export interface PreviewModUpdateMetadataPayload {
  celestePath: string;
  entry: ModCatalogEntry;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ProfileInput".
 */
export interface ProfileInput {
  createdAt?: string | null;
  enabledMapIds?: string[] | null;
  enabledModIds?: string[] | null;
  id?: string | null;
  launchArgs?: string | null;
  name: string;
  profileType: ProfileType;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ReadStagedModMetadataPayload".
 */
export interface ReadStagedModMetadataPayload {
  celestePath: string;
  stagedId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "RefreshModCatalogCachePayload".
 */
export interface RefreshModCatalogCachePayload {
  sources: ModCatalogSourceKind[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "ResolveModCatalogDependenciesPayload".
 */
export interface ResolveModCatalogDependenciesPayload {
  dependencies: Dependency[];
  sources: ModCatalogSourceKind[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "RestoreBackupPayload".
 */
export interface RestoreBackupPayload {
  backupId: string;
  scope: RestoreScope;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SaveProfilePayload".
 */
export interface SaveProfilePayload {
  profile: ProfileInput;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SearchModCatalogPayload".
 */
export interface SearchModCatalogPayload {
  query: string;
  sources: ModCatalogSourceKind[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetAutoBackupCleanupEnabledPayload".
 */
export interface SetAutoBackupCleanupEnabledPayload {
  autoBackupCleanupEnabled: boolean;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetAutoBackupEnabledPayload".
 */
export interface SetAutoBackupEnabledPayload {
  autoBackupEnabled: boolean;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetAutoBackupRetentionCountPayload".
 */
export interface SetAutoBackupRetentionCountPayload {
  autoBackupRetentionCount: number;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetAutoCheckAppUpdatesOnStartupPayload".
 */
export interface SetAutoCheckAppUpdatesOnStartupPayload {
  autoCheckAppUpdatesOnStartup: boolean;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetAutoCheckModUpdatesOnStartupPayload".
 */
export interface SetAutoCheckModUpdatesOnStartupPayload {
  autoCheckModUpdatesOnStartup: boolean;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetAutoRefreshModCatalogCacheOnStartupPayload".
 */
export interface SetAutoRefreshModCatalogCacheOnStartupPayload {
  autoRefreshModCatalogCacheOnStartup: boolean;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetCelestePathPayload".
 */
export interface SetCelestePathPayload {
  celestePath: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetModCatalogSourcesPayload".
 */
export interface SetModCatalogSourcesPayload {
  modCatalogSourceEnabledCount: number;
  modCatalogSourceOrder: ModCatalogSourceKind[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetRecordFavoritePayload".
 */
export interface SetRecordFavoritePayload {
  celestePath: string;
  favorite: boolean;
  recordId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetRecordProtectedPayload".
 */
export interface SetRecordProtectedPayload {
  celestePath: string;
  protected: boolean;
  recordId: string;
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "SetSelectedSaveFilesPayload".
 */
export interface SetSelectedSaveFilesPayload {
  saveFiles: string[];
}
/**
 * This interface was referenced by `ApiTypes`'s JSON-Schema
 * via the `definition` "StageModPreviewPayload".
 */
export interface StageModPreviewPayload {
  celestePath: string;
  entry: ModCatalogEntry;
  operationId: string;
}

export type ApiCommandName =
  | "apply_profile"
  | "cancel_mod_download"
  | "check_mod_updates"
  | "cleanup_auto_backups"
  | "create_backup"
  | "delete_backup"
  | "delete_profile"
  | "delete_staged_download"
  | "download_everest_to_staging"
  | "download_mod_to_staging"
  | "get_config"
  | "install_staged_everest"
  | "install_staged_mod"
  | "launch_game"
  | "launch_profile"
  | "list_backups"
  | "list_everest_releases"
  | "open_backup_folder"
  | "open_backup_location"
  | "open_mod_location"
  | "preview_mod_update_metadata"
  | "read_staged_mod_metadata"
  | "refresh_mod_catalog_cache"
  | "rescan_celeste"
  | "resolve_mod_catalog_dependencies"
  | "restore_backup"
  | "save_profile"
  | "scan_celeste"
  | "search_mod_catalog"
  | "select_celeste_directory"
  | "set_auto_backup_cleanup_enabled"
  | "set_auto_backup_enabled"
  | "set_auto_backup_retention_count"
  | "set_auto_check_app_updates_on_startup"
  | "set_auto_check_mod_updates_on_startup"
  | "set_auto_refresh_mod_catalog_cache_on_startup"
  | "set_celeste_path"
  | "set_mod_catalog_sources"
  | "set_record_favorite"
  | "set_record_protected"
  | "set_selected_save_files"
  | "stage_mod_preview";
export type ApiEventName = "mod-download-progress";

export interface ApiCommandPayloads {
  apply_profile: ApplyProfilePayload;
  cancel_mod_download: CancelModDownloadPayload;
  check_mod_updates: CheckModUpdatesPayload;
  cleanup_auto_backups: undefined;
  create_backup: CreateBackupPayload;
  delete_backup: BackupIdPayload;
  delete_profile: DeleteProfilePayload;
  delete_staged_download: DeleteStagedDownloadPayload;
  download_everest_to_staging: DownloadEverestToStagingPayload;
  download_mod_to_staging: DownloadModToStagingPayload;
  get_config: undefined;
  install_staged_everest: InstallStagedEverestPayload;
  install_staged_mod: InstallStagedModPayload;
  launch_game: LaunchGamePayload;
  launch_profile: LaunchProfilePayload;
  list_backups: undefined;
  list_everest_releases: undefined;
  open_backup_folder: OpenBackupFolderPayload;
  open_backup_location: OpenBackupLocationPayload;
  open_mod_location: OpenModLocationPayload;
  preview_mod_update_metadata: PreviewModUpdateMetadataPayload;
  read_staged_mod_metadata: ReadStagedModMetadataPayload;
  refresh_mod_catalog_cache: RefreshModCatalogCachePayload;
  rescan_celeste: CelestePathPayload;
  resolve_mod_catalog_dependencies: ResolveModCatalogDependenciesPayload;
  restore_backup: RestoreBackupPayload;
  save_profile: SaveProfilePayload;
  scan_celeste: CelestePathPayload;
  search_mod_catalog: SearchModCatalogPayload;
  select_celeste_directory: undefined;
  set_auto_backup_cleanup_enabled: SetAutoBackupCleanupEnabledPayload;
  set_auto_backup_enabled: SetAutoBackupEnabledPayload;
  set_auto_backup_retention_count: SetAutoBackupRetentionCountPayload;
  set_auto_check_app_updates_on_startup: SetAutoCheckAppUpdatesOnStartupPayload;
  set_auto_check_mod_updates_on_startup: SetAutoCheckModUpdatesOnStartupPayload;
  set_auto_refresh_mod_catalog_cache_on_startup: SetAutoRefreshModCatalogCacheOnStartupPayload;
  set_celeste_path: SetCelestePathPayload;
  set_mod_catalog_sources: SetModCatalogSourcesPayload;
  set_record_favorite: SetRecordFavoritePayload;
  set_record_protected: SetRecordProtectedPayload;
  set_selected_save_files: SetSelectedSaveFilesPayload;
  stage_mod_preview: StageModPreviewPayload;
}

export interface ApiCommandResponses {
  apply_profile: ScanResult;
  cancel_mod_download: BooleanResponse;
  check_mod_updates: ModUpdateCheckResult;
  cleanup_auto_backups: BackupInfoList;
  create_backup: BackupInfo;
  delete_backup: VoidResponse;
  delete_profile: ProfilesState;
  delete_staged_download: BooleanResponse;
  download_everest_to_staging: StagedDownload;
  download_mod_to_staging: StagedDownload;
  get_config: ConfigResponse;
  install_staged_everest: EverestInstallResult;
  install_staged_mod: ModInstallResult;
  launch_game: LaunchResult;
  launch_profile: LaunchResult;
  list_backups: BackupInfoList;
  list_everest_releases: EverestReleaseList;
  open_backup_folder: VoidResponse;
  open_backup_location: VoidResponse;
  open_mod_location: VoidResponse;
  preview_mod_update_metadata: ModMetadata;
  read_staged_mod_metadata: ModMetadata;
  refresh_mod_catalog_cache: ModCatalogSearchResult;
  rescan_celeste: ScanResult;
  resolve_mod_catalog_dependencies: ModCatalogDependencyResolutionResult;
  restore_backup: BackupInfo;
  save_profile: ProfilesState;
  scan_celeste: ScanResult;
  search_mod_catalog: ModCatalogSearchResult;
  select_celeste_directory: NullableString;
  set_auto_backup_cleanup_enabled: ConfigResponse;
  set_auto_backup_enabled: ConfigResponse;
  set_auto_backup_retention_count: ConfigResponse;
  set_auto_check_app_updates_on_startup: ConfigResponse;
  set_auto_check_mod_updates_on_startup: ConfigResponse;
  set_auto_refresh_mod_catalog_cache_on_startup: ConfigResponse;
  set_celeste_path: AppConfig;
  set_mod_catalog_sources: ConfigResponse;
  set_record_favorite: ScanResult;
  set_record_protected: ScanResult;
  set_selected_save_files: ConfigResponse;
  stage_mod_preview: ModPreviewStaging;
}

export interface ApiEventPayloads {
  "mod-download-progress": ModDownloadProgress;
}
