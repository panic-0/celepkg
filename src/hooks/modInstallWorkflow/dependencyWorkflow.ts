import {
  createOperationId,
  deleteStagedDownload,
  listEverestReleases,
  previewModUpdateMetadata,
  readStagedModMetadata,
  resolveModCatalogDependencies,
  stageModPreview
} from "../../api";
import type {
  AppConfirmPromptState,
  DependencyPromptState,
  DependencyTreePromptState,
  EverestDependencyPromptState
} from "../../components/AppDialogs";
import type {
  AppNotifier,
  Dependency,
  EverestRelease,
  ModCatalogEntry,
  ModCatalogSourceKind,
  ModMetadata,
  ModPreviewStaging,
  ModRecord,
  ModUpdateCandidate,
  StagedDownload
} from "../../types";
import {
  dependencyEntrySatisfies,
  dependencyIssueForInstalledDependency,
  formatDependencyIssue,
  isBuiltinDependencyName,
  updateCandidateFromRecord,
  type DependencyActionLabel,
  type DependencyIssue,
  type DependencyUpdateAction,
  type DependencyUpdatePlan,
  type DependencyUpdateChoice,
  type EverestDependencyChoice
} from "../../utils/appDependencyResolution";
import { dedupeDependencyActions, dedupeDependencyIssues, dependencyActionKey } from "../../utils/dependencyUpdateDedupe";
import type { DependencyTreeNode, DependencyTreeNodeKind, DependencyTreePreviewChoice } from "../../utils/dependencyTree";
import { defaultDownloadConcurrencyLimit } from "../../utils/downloadTask";
import type { ExecutableDownloadTaskItem } from "../../utils/downloadTaskRunner";
import { normalizeDependencyName } from "../../utils/dependencies";
import { createEverestInstallTaskDescriptor } from "../../utils/everestTask";
import {
  formatEverestBuildVersion,
  installedEverestBuild,
  isEverestDependencyName,
  requiredEverestBuild,
  selectEverestReleaseForBuild
} from "../../utils/everestDependency";
import { readError } from "../../utils/format";
import { createCatalogInstallTaskDescriptor, createModUpdateTaskDescriptors, createModUpdateTaskId } from "../../utils/modUpdateTask";
import { notifyWarning } from "../../utils/notify";

type PreparedDependencyPreview = {
  dependencies: ExecutableDownloadTaskItem[];
  staged: StagedDownload;
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

type DependencyWorkflowOptions = {
  allRecords: ModRecord[];
  celestePath: string;
  createCatalogInstallExecutableItem: (
    entry: ModCatalogEntry,
    dependsOn: string[],
    preview?: PreparedDependencyPreview
  ) => ExecutableDownloadTaskItem;
  createEverestExecutableItem: (release: EverestRelease) => ExecutableDownloadTaskItem;
  createModUpdateExecutableItem: (
    candidate: ModUpdateCandidate,
    dependsOn: string[],
    preview?: PreparedDependencyPreview
  ) => ExecutableDownloadTaskItem;
  downloadableModUpdatesByRecordId: Map<string, ModUpdateCandidate>;
  installedIndex: Map<string, ModRecord>;
  modCatalogSources: ModCatalogSourceKind[];
  notifier: AppNotifier;
  requestAppConfirm: (prompt: Omit<AppConfirmPromptState, "resolve">) => Promise<boolean>;
  requestDependencyChoice: (
    targetName: string,
    actionLabel: DependencyPromptState["actionLabel"],
    issues: DependencyPromptState["issues"]
  ) => Promise<DependencyUpdateChoice | null>;
  requestDependencyTreeChoice: (prompt: Omit<DependencyTreePromptState, "resolve">) => Promise<DependencyTreePreviewChoice | null>;
  requestEverestDependencyChoice: (prompt: Omit<EverestDependencyPromptState, "resolve">) => Promise<EverestDependencyChoice | null>;
  scanOtherMods: ModRecord[];
  setLoading: (loading: boolean, message?: string) => void;
};

export function createDependencyWorkflow({
  allRecords,
  celestePath,
  createCatalogInstallExecutableItem,
  createEverestExecutableItem,
  createModUpdateExecutableItem,
  downloadableModUpdatesByRecordId,
  installedIndex,
  modCatalogSources,
  notifier,
  requestAppConfirm,
  requestDependencyChoice,
  requestDependencyTreeChoice,
  requestEverestDependencyChoice,
  scanOtherMods,
  setLoading
}: DependencyWorkflowOptions) {
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

  async function cleanupStagedDownloads(staged: StagedDownload[]) {
    await Promise.allSettled(staged.map((item) => deleteStagedDownload(celestePath, item.stagedId)));
  }

  async function cleanupStagedDownload(staged: StagedDownload) {
    await deleteStagedDownload(celestePath, staged.stagedId);
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
    const installedBuild = installedEverestBuild(scanOtherMods);
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

  function createDependencyExecutableItems(actions: DependencyUpdateAction[]): ExecutableDownloadTaskItem[] {
    const dedupedActions = dedupeDependencyActions(actions);
    const updateActions = dedupedActions.filter(
      (action): action is Extract<DependencyUpdateAction, { kind: "update" }> => action.kind === "update"
    );
    const updateDescriptors = createModUpdateTaskDescriptors(
      updateActions.map((action) => action.candidate),
      allRecords
    );
    const updateItems = updateDescriptors.map((descriptor) =>
      createModUpdateExecutableItem(descriptor.candidate, descriptor.dependsOn ?? [])
    );
    const nonUpdateItems = dedupedActions
      .filter((action): action is Exclude<DependencyUpdateAction, { kind: "update" }> => action.kind !== "update")
      .map(dependencyActionToExecutableItem);
    return [...nonUpdateItems, ...updateItems];
  }

  function dependencyActionToExecutableItem(action: Exclude<DependencyUpdateAction, { kind: "update" }>): ExecutableDownloadTaskItem {
    if (action.kind === "everest") return createEverestExecutableItem(action.release);
    return createCatalogInstallExecutableItem(action.entry, []);
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
    const installedBuild = installedEverestBuild(scanOtherMods);
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

  return {
    cleanupStagedDownload,
    cleanupStagedDownloads,
    prepareDependencyItems,
    prepareTargetDependencyPreview
  };
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
