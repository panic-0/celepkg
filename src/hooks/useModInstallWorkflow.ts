import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  checkModUpdates,
  createOperationId,
  deleteStagedDownload,
  downloadEverestToStaging,
  downloadModToStaging,
  installStagedEverest,
  installStagedMod,
  listEverestReleases,
  previewModUpdateMetadata,
  readStagedModMetadata,
  resolveModCatalogDependencies,
  stageModPreview
} from "../api";
import { useAppPrompts } from "./useAppPrompts";
import type {
  AppNotifier,
  Dependency,
  EverestRelease,
  ModCatalogEntry,
  ModCatalogSourceKind,
  ModMetadata,
  ModPreviewStaging,
  StagedDownload,
  ModUpdateCandidate,
  ModUpdateCheckResult,
  ScanResult
} from "../types";
import {
  buildInstalledDependencyIndex,
  dependencyEntrySatisfies,
  dependencyIssueForInstalledDependency,
  formatDependencyIssue,
  isBuiltinDependencyName,
  updateCandidateFromRecord,
  type DependencyActionLabel,
  type DependencyIssue,
  type DependencyUpdateAction,
  type DependencyUpdatePlan
} from "../utils/appDependencyResolution";
import { dedupeDependencyActions, dedupeDependencyIssues, dependencyActionKey } from "../utils/dependencyUpdateDedupe";
import type { DependencyTreeNode, DependencyTreeNodeKind } from "../utils/dependencyTree";
import { defaultDownloadConcurrencyLimit, type DownloadTask } from "../utils/downloadTask";
import type { ExecutableDownloadTaskItem } from "../utils/downloadTaskRunner";
import { normalizeDependencyName } from "../utils/dependencies";
import { createEverestInstallTaskDescriptor } from "../utils/everestTask";
import {
  formatEverestBuildVersion,
  installedEverestBuild,
  isEverestDependencyName,
  requiredEverestBuild,
  selectEverestReleaseForBuild
} from "../utils/everestDependency";
import { readError } from "../utils/format";
import {
  createCatalogInstallTaskDescriptor,
  createModUpdateTaskDescriptors,
  createModUpdateTaskId,
  createSingleModUpdateTaskDescriptor,
  formatModUpdateVersionChange
} from "../utils/modUpdateTask";
import { notifyWarning } from "../utils/notify";

type ModInstallWorkflowOptions = {
  autoCheckModUpdatesOnStartup: boolean;
  celestePath: string;
  modCatalogSources: ModCatalogSourceKind[];
  notifier: AppNotifier;
  runExecutableDownloadTask: (
    taskId: string,
    items: ExecutableDownloadTaskItem[],
    message: string,
    successMessage: string
  ) => Promise<boolean>;
  scan: ScanResult;
  setLoading: (loading: boolean, message?: string) => void;
  setScan: Dispatch<SetStateAction<ScanResult>>;
  startupAutoCheckModUpdatesOnStartup: boolean;
  startDownloadTask: (taskId: string, items: ExecutableDownloadTaskItem[], operationIdPrefix?: string) => Promise<DownloadTask>;
};

type PreviewDependencyAction = DependencyUpdateAction & {
  dependsOn: string[];
  optionalAncestorIds: string[];
  staged?: StagedDownload;
};

type PreviewDependencyResolution = {
  actionIds: string[];
  actions: PreviewDependencyAction[];
  staged: StagedDownload[];
  unavailableCount: number;
};

type DependencyResolutionContext = {
  catalogEntriesByDependencyKey: Map<string, ModCatalogEntry | null>;
  catalogEntryPromisesByDependencyKey: Map<string, Promise<ModCatalogEntry | null>>;
  plannedKeys: Set<string>;
};

type DependencyPreviewPlan = PreviewDependencyResolution & {
  tree: DependencyTreeNode;
};

export function useModInstallWorkflow({
  autoCheckModUpdatesOnStartup,
  celestePath,
  modCatalogSources,
  notifier,
  runExecutableDownloadTask,
  scan,
  setLoading,
  setScan,
  startupAutoCheckModUpdatesOnStartup,
  startDownloadTask
}: ModInstallWorkflowOptions) {
  const [modUpdateResult, setModUpdateResult] = useState<ModUpdateCheckResult>({ sources: [], updates: [], matched: [], warnings: [] });
  const [modUpdateChecking, setModUpdateChecking] = useState(false);
  const {
    closeConfirmPrompt,
    closeDependencyPrompt,
    closeDependencyTreePrompt,
    closeEverestDependencyPrompt,
    confirmPrompt,
    dependencyPrompt,
    dependencyTreePrompt,
    everestDependencyPrompt,
    requestAppConfirm,
    requestDependencyChoice,
    requestDependencyTreeChoice,
    requestEverestDependencyChoice
  } = useAppPrompts();
  const completedModUpdatePaths = useRef<Set<string>>(new Set());
  const modUpdateCheckRequest = useRef(0);
  const manualModUpdateCheckRequest = useRef(0);
  const startupModUpdateCheckDone = useRef(false);

  const modUpdatesByRecordId = useMemo(() => {
    const byRecordId = new Map<string, ModUpdateCandidate>();
    for (const candidate of modUpdateResult.updates) {
      byRecordId.set(candidate.installed.recordId, candidate);
    }
    return byRecordId;
  }, [modUpdateResult.updates]);
  const downloadableModUpdates = useMemo(
    () => modUpdateResult.updates.filter((candidate) => candidate.entry.downloadUrl.trim().length > 0),
    [modUpdateResult.updates]
  );
  const allRecords = useMemo(() => [...scan.maps, ...scan.otherMods], [scan.maps, scan.otherMods]);
  const installedIndex = useMemo(() => buildInstalledDependencyIndex(allRecords), [allRecords]);
  const downloadableModUpdatesByRecordId = useMemo(() => {
    const byRecordId = new Map<string, ModUpdateCandidate>();
    for (const candidate of downloadableModUpdates) byRecordId.set(candidate.installed.recordId, candidate);
    return byRecordId;
  }, [downloadableModUpdates]);

  const checkUpdatesForMods = useCallback(
    async (mode: "manual" | "startup" = "manual") => {
      if (!celestePath.trim()) return;
      const startupMode = mode === "startup";
      const sources = modCatalogSources;
      const requestId = modUpdateCheckRequest.current + 1;
      modUpdateCheckRequest.current = requestId;
      const manualRequestId = startupMode ? 0 : manualModUpdateCheckRequest.current + 1;
      if (!startupMode) {
        manualModUpdateCheckRequest.current = manualRequestId;
        setModUpdateChecking(true);
      }
      try {
        const result = await checkModUpdates(celestePath, sources);
        const latestResultRequest = modUpdateCheckRequest.current === requestId;
        if (latestResultRequest) setModUpdateResult(result);
        if (!startupMode) {
          if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
          else if (result.updates.length) {
            const downloadableCount = result.updates.filter((candidate) => candidate.entry.downloadUrl.trim().length > 0).length;
            notifier.showSuccess(
              downloadableCount === result.updates.length
                ? `发现 ${result.updates.length} 个可更新 Mod`
                : `发现 ${result.updates.length} 个可更新 Mod，其中 ${downloadableCount} 个可下载`
            );
          } else notifier.showSuccess("本地 Mod 已是最新");
        }
      } catch (error) {
        const message = readError(error);
        if (!startupMode) notifier.showError(message);
      } finally {
        if (!startupMode && manualModUpdateCheckRequest.current === manualRequestId) setModUpdateChecking(false);
      }
    },
    [celestePath, modCatalogSources, notifier]
  );

  useEffect(() => {
    if (
      startupModUpdateCheckDone.current ||
      !startupAutoCheckModUpdatesOnStartup ||
      !autoCheckModUpdatesOnStartup ||
      !celestePath.trim() ||
      !scan.modsPath
    ) {
      return;
    }
    startupModUpdateCheckDone.current = true;
    void checkUpdatesForMods("startup");
  }, [autoCheckModUpdatesOnStartup, celestePath, checkUpdatesForMods, scan.modsPath, startupAutoCheckModUpdatesOnStartup]);

  async function updateSingleMod(candidate: ModUpdateCandidate) {
    await updateModCandidate(candidate);
  }

  async function installEverestRelease(release: EverestRelease) {
    const version = `1.${release.version}.0`;
    const confirmed = await requestAppConfirm({
      title: "安装 Everest",
      description: "安装器会覆盖游戏目录中的 Everest 相关文件。请确认目标版本无误。",
      confirmLabel: "安装 Everest",
      facts: [
        { label: "目标版本", value: version },
        { label: "游戏目录", value: celestePath }
      ],
      variant: "danger"
    });
    if (!confirmed) return;
    await performEverestInstall(release, `正在安装 Everest ${version}...`, `已安装 Everest ${version}`);
  }

  async function performEverestInstall(release: EverestRelease, message: string, successMessage: string) {
    const descriptor = createEverestInstallTaskDescriptor(release);
    return await runExecutableDownloadTask(
      createOperationId("everest-task"),
      [
        {
          ...descriptor,
          download: (operationId) => downloadEverestToStaging(celestePath, release, operationId),
          cleanupStaged: cleanupStagedDownload,
          install: async (staged) => {
            const result = await installStagedEverest(celestePath, staged.stagedId, release);
            setScan(result.scan);
          }
        }
      ],
      message,
      successMessage
    );
  }

  async function updateAllMods() {
    const recordsBeforeUpdate = [...scan.maps, ...scan.otherMods];
    const descriptors = createModUpdateTaskDescriptors(downloadableModUpdates, recordsBeforeUpdate);
    if (!descriptors.length) return;
    const confirmed = await requestAppConfirm({
      title: "批量更新 Mod",
      description: "确认后会按依赖顺序下载并覆盖这些本地 Mod 文件。",
      confirmLabel: "更新全部",
      facts: [
        { label: "更新数量", value: `${descriptors.length} 个` },
        { label: "可下载更新", value: `${downloadableModUpdates.length} 个` }
      ],
      details: descriptors.map(
        (descriptor) => `${descriptor.candidate.installed.name}: ${formatModUpdateVersionChange(descriptor.candidate)}`
      ),
      variant: "danger"
    });
    if (!confirmed) return;
    completedModUpdatePaths.current.clear();
    const items = descriptors.map((descriptor) => createModUpdateExecutableItem(descriptor.candidate, descriptor.dependsOn));
    try {
      setLoading(true, `正在更新 ${items.length} 个 Mod...`);
      const result = await startDownloadTask(createOperationId("mod-update-task"), items, "mod-update");
      const installedCount = result.items.filter((item) => item.status === "installed").length;
      const failedCount = result.items.filter(
        (item) => item.status === "downloadFailed" || item.status === "installFailed" || item.status === "skipped"
      ).length;
      if (result.status === "cancelled") notifier.showInfo("已取消更新任务");
      else if (failedCount) notifier.showWarning(`更新完成，成功 ${installedCount} 个，失败 ${failedCount} 个`);
      else notifier.showSuccess(`已更新 ${installedCount} 个 Mod`);
    } catch (error) {
      const message = readError(error);
      notifier.showError(message);
    } finally {
      setLoading(false);
    }
  }

  async function updateModCandidate(candidate: ModUpdateCandidate, batchLabel = "") {
    return await performModUpdate(
      candidate,
      batchLabel,
      batchLabel ? `正在更新 Mod (${batchLabel})...` : `正在更新 ${candidate.installed.name}...`
    );
  }

  async function installCatalogEntry(entry: ModCatalogEntry) {
    return await performCatalogInstall(entry, `正在安装 ${entry.name}...`, `已安装 ${entry.name}`);
  }

  async function performModUpdate(candidate: ModUpdateCandidate, batchLabel = "", message = `正在更新 ${candidate.installed.name}...`) {
    void batchLabel;
    const preview = await prepareTargetDependencyPreview(candidate.entry, candidate.installed.name, "更新");
    if (!preview) return false;
    return await runExecutableDownloadTask(
      createOperationId("mod-update-task"),
      [
        createModUpdateExecutableItem(candidate, [], {
          dependencies: preview.dependencyItems,
          staged: preview.targetStaged
        })
      ],
      message,
      `已更新 ${candidate.installed.name}`
    );
  }

  function createModUpdateExecutableItem(
    candidate: ModUpdateCandidate,
    dependsOn: string[] = [],
    prepared?: { dependencies: ExecutableDownloadTaskItem[]; staged: StagedDownload }
  ): ExecutableDownloadTaskItem {
    const descriptor = createSingleModUpdateTaskDescriptor(candidate);
    return {
      ...descriptor,
      dependsOn,
      download: prepared
        ? async () => prepared.staged
        : (operationId, taskIndex, taskTotal) => downloadModToStaging(celestePath, candidate.entry, operationId, taskIndex, taskTotal),
      cleanupStaged: cleanupStagedDownload,
      prepareInstall: prepared
        ? async () => prepared.dependencies
        : async (staged) => await prepareDependencyItems(candidate.entry, candidate.installed.name, "更新", staged),
      install: async (staged) => {
        const result = await installStagedMod(celestePath, staged.stagedId, candidate.entry, candidate.installed.absolutePath);
        setScan(result.scan);
        removeUpdatedCandidate(candidate);
      }
    };
  }

  function createCatalogInstallExecutableItem(
    entry: ModCatalogEntry,
    dependsOn: string[] = [],
    prepared?: { dependencies: ExecutableDownloadTaskItem[]; staged: StagedDownload }
  ): ExecutableDownloadTaskItem {
    const descriptor = createCatalogInstallTaskDescriptor(entry);
    return {
      ...descriptor,
      dependsOn,
      download: prepared
        ? async () => prepared.staged
        : (operationId, taskIndex, taskTotal) => downloadModToStaging(celestePath, entry, operationId, taskIndex, taskTotal),
      cleanupStaged: cleanupStagedDownload,
      prepareInstall: prepared
        ? async () => prepared.dependencies
        : async (staged) => await prepareDependencyItems(entry, entry.name, "安装", staged),
      install: async (staged) => {
        const result = await installStagedMod(celestePath, staged.stagedId, entry);
        setScan(result.scan);
      }
    };
  }

  function createEverestExecutableItem(release: EverestRelease): ExecutableDownloadTaskItem {
    const descriptor = createEverestInstallTaskDescriptor(release);
    return {
      ...descriptor,
      download: (operationId) => downloadEverestToStaging(celestePath, release, operationId),
      cleanupStaged: cleanupStagedDownload,
      install: async (staged) => {
        const result = await installStagedEverest(celestePath, staged.stagedId, release);
        setScan(result.scan);
      }
    };
  }

  async function prepareTargetDependencyPreview(
    entry: ModCatalogEntry,
    targetName: string,
    actionLabel: DependencyActionLabel
  ): Promise<{ dependencyItems: ExecutableDownloadTaskItem[]; targetStaged: StagedDownload } | null> {
    const stagedToCleanup: StagedDownload[] = [];
    let targetPreview: ModPreviewStaging;
    let plan: DependencyPreviewPlan;
    try {
      setLoading(true, `正在下载并预览 ${targetName} 的依赖...`);
      targetPreview = await stageModPreview(celestePath, entry, createOperationId("mod-preview"));
      stagedToCleanup.push(targetPreview.staged);
      plan = await buildDependencyPreviewPlan(targetName, targetPreview.metadata);
      stagedToCleanup.push(...plan.staged);
    } catch (error) {
      const message = readError(error);
      notifier.showError(message);
      await cleanupStagedDownloads(stagedToCleanup);
      return null;
    } finally {
      setLoading(false);
    }

    const choice = await requestDependencyTreeChoice({
      actionLabel,
      plannedCount: plan.actions.length,
      stagedCount: stagedToCleanup.length,
      targetName,
      tree: plan.tree,
      unavailableCount: plan.unavailableCount
    });
    if (!choice) {
      await cleanupStagedDownloads(stagedToCleanup);
      return null;
    }

    const selectedActions = filterSelectedPreviewActions(plan.actions, choice.selectedOptionalIds);
    const selectedActionIds = new Set(selectedActions.map(previewActionId));
    const unusedStaged = plan.actions
      .filter((action) => !selectedActionIds.has(previewActionId(action)))
      .map((action) => action.staged)
      .filter((staged): staged is StagedDownload => Boolean(staged));
    await cleanupStagedDownloads(unusedStaged);

    return {
      dependencyItems: createPreviewDependencyExecutableItems(selectedActions),
      targetStaged: targetPreview.staged
    };
  }

  async function buildDependencyPreviewPlan(targetName: string, metadata: ModMetadata): Promise<DependencyPreviewPlan> {
    const context: DependencyResolutionContext = {
      catalogEntriesByDependencyKey: new Map(),
      catalogEntryPromisesByDependencyKey: new Map(),
      plannedKeys: new Set<string>()
    };
    const root: DependencyTreeNode = {
      id: `target:${normalizeDependencyName(targetName)}`,
      name: targetName,
      kind: "target",
      status: "target",
      detail: metadata.version || "预览版本",
      selected: true,
      selectable: false,
      children: []
    };
    const resolution = await resolvePreviewDependencies(
      metadata.dependencies,
      "required",
      [],
      new Set([normalizeDependencyName(targetName)]),
      context
    );
    const optionalResolution = await resolvePreviewDependencies(
      metadata.optionalDependencies,
      "optional",
      [],
      new Set([normalizeDependencyName(targetName)]),
      context
    );
    root.children = [...resolution.nodes, ...optionalResolution.nodes];
    return {
      tree: root,
      actionIds: [...resolution.actionIds, ...optionalResolution.actionIds],
      actions: [...resolution.actions, ...optionalResolution.actions],
      staged: [...resolution.staged, ...optionalResolution.staged],
      unavailableCount: resolution.unavailableCount + optionalResolution.unavailableCount
    };
  }

  async function resolvePreviewDependencies(
    dependencies: Dependency[],
    kind: Exclude<DependencyTreeNodeKind, "target">,
    optionalAncestorIds: string[],
    path: Set<string>,
    context: DependencyResolutionContext
  ): Promise<PreviewDependencyResolution & { nodes: DependencyTreeNode[] }> {
    const nodes: DependencyTreeNode[] = [];
    const actionIds: string[] = [];
    const actions: PreviewDependencyAction[] = [];
    const staged: StagedDownload[] = [];
    let unavailableCount = 0;

    const resolvedDependencies = await mapWithConcurrency(dependencies, defaultDownloadConcurrencyLimit, (dependency) =>
      resolvePreviewDependency(dependency, kind, optionalAncestorIds, path, context)
    );
    for (const resolved of resolvedDependencies) {
      nodes.push(resolved.node);
      actionIds.push(...resolved.actionIds);
      actions.push(...resolved.actions);
      staged.push(...resolved.staged);
      unavailableCount += resolved.unavailableCount;
    }

    return { actionIds, actions, nodes, staged, unavailableCount };
  }

  async function resolvePreviewDependency(
    dependency: Dependency,
    kind: Exclude<DependencyTreeNodeKind, "target">,
    optionalAncestorIds: string[],
    path: Set<string>,
    context: DependencyResolutionContext
  ): Promise<PreviewDependencyResolution & { node: DependencyTreeNode }> {
    const normalized = normalizeDependencyName(dependency.name);
    const nodeId = `${kind}:${normalized}:${dependency.version}:${path.size}`;
    const nextOptionalAncestorIds = kind === "optional" ? [...optionalAncestorIds, nodeId] : optionalAncestorIds;

    if (isEverestDependencyName(dependency.name)) {
      return await resolveEverestPreviewDependency(dependency, kind, nodeId, nextOptionalAncestorIds);
    }
    if (isBuiltinDependencyName(dependency.name)) {
      return emptyPreviewNode(basePreviewNode(dependency, kind, nodeId, "builtin", "内置依赖"));
    }
    if (path.has(normalized)) {
      return emptyPreviewNode(basePreviewNode(dependency, kind, nodeId, "cycle", "循环依赖"));
    }

    const installed = installedIndex.get(normalized);
    const issue = dependencyIssueForInstalledDependency(dependency, installedIndex, kind === "optional");
    if (installed && !issue) {
      const nextPath = new Set(path);
      nextPath.add(normalized);
      const required = await resolvePreviewDependencies(installed.dependencies, "required", nextOptionalAncestorIds, nextPath, context);
      const optional = await resolvePreviewDependencies(
        installed.optionalDependencies,
        "optional",
        nextOptionalAncestorIds,
        nextPath,
        context
      );
      return {
        node: {
          ...basePreviewNode(dependency, kind, nodeId, "installed", installed.metadata.version || installed.fileName),
          name: installed.name || dependency.name,
          children: [...required.nodes, ...optional.nodes]
        },
        actionIds: [...required.actionIds, ...optional.actionIds],
        actions: [...required.actions, ...optional.actions],
        staged: [...required.staged, ...optional.staged],
        unavailableCount: required.unavailableCount + optional.unavailableCount
      };
    }

    if (!issue) return emptyPreviewNode(basePreviewNode(dependency, kind, nodeId, "unavailable", "依赖状态未知"));
    const action = await resolveDependencyAction(issue, context);
    if (!action) {
      return {
        ...emptyPreviewNode(basePreviewNode(dependency, kind, nodeId, "unavailable", formatDependencyIssue(issue))),
        unavailableCount: 1
      };
    }

    const actionKey = dependencyActionKey(action);
    if (context.plannedKeys.has(actionKey)) {
      return emptyPreviewNode(basePreviewNode(dependency, kind, nodeId, "duplicate", "已在预览中处理"));
    }
    context.plannedKeys.add(actionKey);

    const entry = action.kind === "install" ? action.entry : action.kind === "update" ? action.candidate.entry : null;
    if (!entry) return emptyPreviewNode(basePreviewNode(dependency, kind, nodeId, "duplicate", "已在预览中处理"));

    let preview: ModPreviewStaging;
    try {
      preview = await stageModPreview(celestePath, entry, createOperationId("mod-preview"));
    } catch (error) {
      notifyWarning(notifier, error);
      return {
        ...emptyPreviewNode(basePreviewNode(dependency, kind, nodeId, "unavailable", formatDependencyIssue(issue))),
        unavailableCount: 1
      };
    }

    const nextPath = new Set(path);
    nextPath.add(normalized);
    const required = await resolvePreviewDependencies(
      preview.metadata.dependencies,
      "required",
      nextOptionalAncestorIds,
      nextPath,
      context
    );
    const optional = await resolvePreviewDependencies(
      preview.metadata.optionalDependencies,
      "optional",
      nextOptionalAncestorIds,
      nextPath,
      context
    );
    const previewAction: PreviewDependencyAction = {
      ...action,
      dependsOn: [...required.actionIds, ...optional.actionIds],
      optionalAncestorIds: nextOptionalAncestorIds,
      staged: preview.staged
    };
    const currentActionId = previewActionId(previewAction);

    return {
      node: {
        ...basePreviewNode(
          dependency,
          kind,
          nodeId,
          action.kind === "install" ? "plannedInstall" : "plannedUpdate",
          action.kind === "install" ? `将安装 ${entry.version || "目录版本"}` : `将更新到 ${entry.version || "目录版本"}`
        ),
        children: [...required.nodes, ...optional.nodes]
      },
      actionIds: [currentActionId],
      actions: [...required.actions, ...optional.actions, previewAction],
      staged: [...required.staged, ...optional.staged, preview.staged],
      unavailableCount: required.unavailableCount + optional.unavailableCount
    };
  }

  async function resolveEverestPreviewDependency(
    dependency: Dependency,
    kind: Exclude<DependencyTreeNodeKind, "target">,
    nodeId: string,
    optionalAncestorIds: string[]
  ): Promise<PreviewDependencyResolution & { node: DependencyTreeNode }> {
    const requiredBuild = requiredEverestBuild([dependency]);
    if (requiredBuild === null) {
      return emptyPreviewNode(basePreviewNode(dependency, kind, nodeId, "everest", "Everest 运行环境依赖"));
    }
    const installedBuild = installedEverestBuild(scan.otherMods);
    if (installedBuild !== null && installedBuild >= requiredBuild) {
      return emptyPreviewNode(basePreviewNode(dependency, kind, nodeId, "installed", `当前 ${formatEverestBuildVersion(installedBuild)}`));
    }
    try {
      const result = await listEverestReleases();
      if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
      const release = selectEverestReleaseForBuild(result.releases, requiredBuild);
      if (!release) {
        return {
          ...emptyPreviewNode(
            basePreviewNode(dependency, kind, nodeId, "unavailable", `需要 ${formatEverestBuildVersion(requiredBuild)} 或更高版本`)
          ),
          unavailableCount: 1
        };
      }
      const action: PreviewDependencyAction = {
        kind: "everest",
        name: "Everest",
        release,
        dependsOn: [],
        optionalAncestorIds
      };
      return {
        node: basePreviewNode(dependency, kind, nodeId, "plannedUpdate", `将更新到 ${formatEverestBuildVersion(release.version)}`),
        actionIds: [previewActionId(action)],
        actions: [action],
        staged: [],
        unavailableCount: 0
      };
    } catch (error) {
      notifyWarning(notifier, error);
      return {
        ...emptyPreviewNode(
          basePreviewNode(dependency, kind, nodeId, "unavailable", `需要 ${formatEverestBuildVersion(requiredBuild)} 或更高版本`)
        ),
        unavailableCount: 1
      };
    }
  }

  function createPreviewDependencyExecutableItems(actions: PreviewDependencyAction[]): ExecutableDownloadTaskItem[] {
    const byKey = new Map<string, PreviewDependencyAction>();
    for (const action of actions) {
      if (!byKey.has(dependencyActionKey(action))) byKey.set(dependencyActionKey(action), action);
    }
    const selectedIds = new Set([...byKey.values()].map(previewActionId));
    return [...byKey.values()].map((action) => {
      const dependsOn = action.dependsOn.filter((id) => selectedIds.has(id));
      if (action.kind === "everest") return { ...createEverestExecutableItem(action.release), dependsOn };
      if (action.kind === "update") {
        return createModUpdateExecutableItem(
          action.candidate,
          dependsOn,
          action.staged ? { dependencies: [], staged: action.staged } : undefined
        );
      }
      return createCatalogInstallExecutableItem(
        action.entry,
        dependsOn,
        action.staged ? { dependencies: [], staged: action.staged } : undefined
      );
    });
  }

  function filterSelectedPreviewActions(actions: PreviewDependencyAction[], selectedOptionalIds: Set<string>) {
    return actions.filter((action) => action.optionalAncestorIds.every((optionalId) => selectedOptionalIds.has(optionalId)));
  }

  function previewActionId(action: DependencyUpdateAction) {
    if (action.kind === "everest") return createEverestInstallTaskDescriptor(action.release).id;
    if (action.kind === "update") return createModUpdateTaskId(action.candidate);
    return createCatalogInstallTaskDescriptor(action.entry).id;
  }

  function basePreviewNode(
    dependency: Dependency,
    kind: Exclude<DependencyTreeNodeKind, "target">,
    id: string,
    status: DependencyTreeNode["status"],
    detail: string
  ): DependencyTreeNode {
    return {
      id,
      name: dependency.name,
      kind,
      status,
      detail,
      selected: kind === "required",
      selectable: kind === "optional",
      children: []
    };
  }

  function emptyPreviewNode(node: DependencyTreeNode): PreviewDependencyResolution & { node: DependencyTreeNode } {
    return {
      node,
      actionIds: [],
      actions: [],
      staged: [],
      unavailableCount: 0
    };
  }

  async function cleanupStagedDownloads(staged: StagedDownload[]) {
    await Promise.allSettled(staged.map((item) => deleteStagedDownload(celestePath, item.stagedId)));
  }

  async function cleanupStagedDownload(staged: StagedDownload) {
    await deleteStagedDownload(celestePath, staged.stagedId);
  }

  async function prepareDependencyItems(
    entry: ModCatalogEntry,
    targetName: string,
    actionLabel: DependencyActionLabel,
    staged?: StagedDownload
  ) {
    const actions = await prepareDependencyActions(entry, targetName, actionLabel, staged);
    if (!actions) throw new Error("已取消依赖检查");
    return createDependencyExecutableItems(actions);
  }

  function createDependencyExecutableItems(actions: DependencyUpdateAction[]): ExecutableDownloadTaskItem[] {
    const dedupedActions = dedupeDependencyActions(actions);
    const updateActions = dedupedActions.filter(
      (action): action is Extract<DependencyUpdateAction, { kind: "update" }> => action.kind === "update"
    );
    const updateDescriptors = createModUpdateTaskDescriptors(
      updateActions.map((action) => action.candidate),
      allRecords
    );
    const updateItems = updateDescriptors.map((descriptor) => createModUpdateExecutableItem(descriptor.candidate, descriptor.dependsOn));
    const nonUpdateItems = dedupedActions
      .filter((action): action is Exclude<DependencyUpdateAction, { kind: "update" }> => action.kind !== "update")
      .map(dependencyActionToExecutableItem);
    return [...nonUpdateItems, ...updateItems];
  }

  function dependencyActionToExecutableItem(action: Exclude<DependencyUpdateAction, { kind: "update" }>): ExecutableDownloadTaskItem {
    if (action.kind === "everest") return createEverestExecutableItem(action.release);
    return createCatalogInstallExecutableItem(action.entry);
  }

  async function prepareDependencyActions(
    entry: ModCatalogEntry,
    targetName: string,
    actionLabel: DependencyActionLabel,
    staged?: StagedDownload
  ): Promise<DependencyUpdateAction[] | null> {
    let metadata;
    try {
      setLoading(true, `正在检查 ${targetName} 的依赖...`);
      metadata = staged ? await readStagedModMetadata(celestePath, staged.stagedId) : await previewModUpdateMetadata(celestePath, entry);
    } catch (error) {
      const message = readError(error);
      notifier.showWarning(message);
      const confirmed = await requestAppConfirm({
        title: "无法预览依赖",
        description: `无法预览 ${targetName} ${actionLabel}后的依赖。继续后可能遗漏必需依赖。`,
        confirmLabel: `继续${actionLabel}`,
        facts: [
          { label: "目标", value: targetName },
          { label: "操作", value: actionLabel },
          { label: "错误", value: message }
        ],
        variant: "danger"
      });
      if (!confirmed) return null;
      return [];
    } finally {
      setLoading(false);
    }

    const everestAction = await resolveEverestDependencyAction(
      metadata.dependencies.concat(metadata.optionalDependencies),
      targetName,
      actionLabel
    );
    if (everestAction === false) return null;

    const issues = dependencyIssuesForMetadata(metadata.dependencies, false)
      .concat(dependencyIssuesForMetadata(metadata.optionalDependencies, true))
      .filter((issue) => !isEverestDependencyName(issue.dependency.name));
    if (!issues.length) return everestAction ? [everestAction] : [];

    const choice = await requestDependencyChoice(targetName, actionLabel, issues);
    if (!choice) return null;
    const actions = await resolveDependencyActions({ actionLabel, choice, issues, targetName });
    if (!actions) return null;
    return everestAction ? [everestAction, ...actions] : actions;
  }

  async function resolveEverestDependencyAction(
    dependencies: Dependency[],
    targetName: string,
    actionLabel: DependencyActionLabel
  ): Promise<Extract<DependencyUpdateAction, { kind: "everest" }> | null | false> {
    const requiredBuild = requiredEverestBuild(dependencies);
    if (requiredBuild === null) return null;
    const installedBuild = installedEverestBuild(scan.otherMods);
    if (installedBuild !== null && installedBuild >= requiredBuild) return null;
    let release: EverestRelease | null = null;
    try {
      setLoading(true, "正在检查 Everest 版本...");
      const result = await listEverestReleases();
      release = selectEverestReleaseForBuild(result.releases, requiredBuild);
      if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
    } catch (error) {
      notifyWarning(notifier, error);
    } finally {
      setLoading(false);
    }
    if (!release) {
      const requiredVersion = formatEverestBuildVersion(requiredBuild);
      const installedVersion = installedBuild === null ? "未识别" : formatEverestBuildVersion(installedBuild);
      return (await requestAppConfirm({
        title: "Everest 无法自动更新",
        description: `未找到可自动更新的 Everest 版本。继续${actionLabel}后，目标 Mod 可能无法正常运行。`,
        confirmLabel: `继续${actionLabel}`,
        facts: [
          { label: "目标", value: targetName },
          { label: "需要 Everest", value: `${requiredVersion} 或更高版本` },
          { label: "当前 Everest", value: installedVersion }
        ],
        variant: "danger"
      }))
        ? null
        : false;
    }
    const choice = await requestEverestDependencyChoice({
      installedBuild,
      release,
      requiredBuild,
      targetName
    });
    if (!choice) return false;
    if (choice === "ignore") return null;
    return { kind: "everest", name: "Everest", release };
  }

  async function resolveDependencyActions(plan: DependencyUpdatePlan): Promise<DependencyUpdateAction[] | null> {
    if (plan.choice === "none") return [];
    const selectedIssues = dedupeDependencyIssues(plan.issues.filter((issue) => !issue.optional || plan.choice === "all"));
    const { actions, unavailable } = await resolveDependencyActionsForIssues(selectedIssues);
    if (unavailable.length) {
      const actionText = plan.actionLabel === "安装" ? "安装" : "覆盖";
      const confirmed = await requestAppConfirm({
        title: "依赖无法自动处理",
        description: `以下依赖无法自动更新或安装。继续后，目标 Mod 可能缺少依赖或版本不足。`,
        confirmLabel: `继续${actionText}`,
        facts: [
          { label: "目标", value: plan.targetName },
          { label: "操作", value: plan.actionLabel },
          { label: "无法处理", value: `${unavailable.length} 个` }
        ],
        details: unavailable.map(formatDependencyIssue),
        variant: "danger"
      });
      if (!confirmed) return null;
    }
    return dedupeDependencyActions(actions);
  }

  function dependencyIssuesForMetadata(dependencies: Dependency[], optional: boolean): DependencyIssue[] {
    const issues: DependencyIssue[] = [];
    for (const dependency of dependencies) {
      const issue = dependencyIssueForInstalledDependency(dependency, installedIndex, optional);
      if (issue) issues.push(issue);
    }
    return issues;
  }

  async function resolveDependencyActionsForIssues(issues: DependencyIssue[]) {
    const actions: DependencyUpdateAction[] = [];
    const unresolved: DependencyIssue[] = [];
    for (const issue of issues) {
      const action = resolveInstalledDependencyAction(issue);
      if (action) actions.push(action);
      else unresolved.push(issue);
    }

    const catalogIssues = unresolved.filter((issue) => !isBuiltinDependencyName(issue.dependency.name));
    const entriesByKey = await findCatalogEntriesForDependencies(catalogIssues.map((issue) => issue.dependency));
    const unavailable = unresolved.filter((issue) => isBuiltinDependencyName(issue.dependency.name));
    for (const issue of catalogIssues) {
      const entry = entriesByKey.get(dependencyResolutionKey(issue.dependency));
      if (!entry) {
        unavailable.push(issue);
        continue;
      }
      if (issue.installed) {
        actions.push({ kind: "update", name: issue.dependency.name, candidate: updateCandidateFromRecord(entry, issue.installed) });
      } else {
        actions.push({
          kind: "install",
          name: issue.dependency.name,
          entry
        });
      }
    }
    return { actions, unavailable };
  }

  function resolveInstalledDependencyAction(issue: DependencyIssue): DependencyUpdateAction | null {
    if (isBuiltinDependencyName(issue.dependency.name)) return null;
    if (issue.installed) {
      const candidate = downloadableModUpdatesByRecordId.get(issue.installed.id);
      if (candidate && dependencyEntrySatisfies(candidate.entry, issue.dependency)) {
        return { kind: "update", name: issue.dependency.name, candidate };
      }
    }
    return null;
  }

  async function resolveDependencyAction(
    issue: DependencyIssue,
    context?: DependencyResolutionContext
  ): Promise<DependencyUpdateAction | null> {
    const installedAction = resolveInstalledDependencyAction(issue);
    if (installedAction) return installedAction;
    if (isBuiltinDependencyName(issue.dependency.name)) return null;
    const entry = await findCatalogEntryForDependency(issue.dependency, context);
    if (!entry) return null;
    if (issue.installed) {
      return {
        kind: "update",
        name: issue.dependency.name,
        candidate: updateCandidateFromRecord(entry, issue.installed)
      };
    }
    return { kind: "install", name: issue.dependency.name, entry };
  }

  async function findCatalogEntryForDependency(
    dependency: Dependency,
    context?: DependencyResolutionContext
  ): Promise<ModCatalogEntry | null> {
    const key = dependencyResolutionKey(dependency);
    if (context?.catalogEntriesByDependencyKey.has(key)) return context.catalogEntriesByDependencyKey.get(key) ?? null;
    const pendingEntry = context?.catalogEntryPromisesByDependencyKey.get(key);
    if (pendingEntry) return await pendingEntry;
    try {
      const entryPromise = findCatalogEntriesForDependencies([dependency]).then((entries) => entries.get(key) ?? null);
      context?.catalogEntryPromisesByDependencyKey.set(key, entryPromise);
      const entry = await entryPromise;
      context?.catalogEntriesByDependencyKey.set(key, entry);
      context?.catalogEntryPromisesByDependencyKey.delete(key);
      return entry;
    } catch (error) {
      context?.catalogEntryPromisesByDependencyKey.delete(key);
      notifyWarning(notifier, error);
      return null;
    }
  }

  async function findCatalogEntriesForDependencies(dependencies: Dependency[]) {
    const deduped = [...new Map(dependencies.map((dependency) => [dependencyResolutionKey(dependency), dependency])).values()];
    if (!deduped.length) return new Map<string, ModCatalogEntry | null>();
    try {
      const result = await resolveModCatalogDependencies(deduped, modCatalogSources);
      if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
      return new Map(result.resolutions.map((resolution) => [dependencyResolutionKey(resolution.dependency), resolution.entry] as const));
    } catch (error) {
      notifyWarning(notifier, error);
      return new Map(deduped.map((dependency) => [dependencyResolutionKey(dependency), null] as const));
    }
  }

  function dependencyResolutionKey(dependency: Dependency) {
    return `${normalizeDependencyName(dependency.name)}:${dependency.version}`;
  }

  async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, limit), items.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        for (;;) {
          const index = nextIndex;
          nextIndex += 1;
          if (index >= items.length) return;
          results[index] = await task(items[index]);
        }
      })
    );
    return results;
  }

  async function performCatalogInstall(entry: ModCatalogEntry, message: string, successMessage: string) {
    const preview = await prepareTargetDependencyPreview(entry, entry.name, "安装");
    if (!preview) return false;
    return await runExecutableDownloadTask(
      createOperationId("mod-install-task"),
      [
        createCatalogInstallExecutableItem(entry, [], {
          dependencies: preview.dependencyItems,
          staged: preview.targetStaged
        })
      ],
      message,
      successMessage
    );
  }

  function removeUpdatedCandidate(candidate: ModUpdateCandidate) {
    completedModUpdatePaths.current.add(candidate.installed.absolutePath);
    setModUpdateResult((current) => ({
      ...current,
      updates: current.updates.filter((item) => item.installed.absolutePath !== candidate.installed.absolutePath),
      matched: current.matched.map((item) =>
        item.installed.absolutePath === candidate.installed.absolutePath ? { ...item, updateAvailable: false, reason: "刚刚已更新" } : item
      )
    }));
  }

  return {
    checkUpdatesForMods,
    closeConfirmPrompt,
    closeDependencyPrompt,
    closeDependencyTreePrompt,
    closeEverestDependencyPrompt,
    confirmPrompt,
    dependencyPrompt,
    dependencyTreePrompt,
    downloadableModUpdates,
    everestDependencyPrompt,
    installCatalogEntry,
    installEverestRelease,
    modUpdateChecking,
    modUpdateResult,
    modUpdatesByRecordId,
    updateAllMods,
    updateSingleMod
  };
}
