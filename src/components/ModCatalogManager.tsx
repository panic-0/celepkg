import { Download, ExternalLink, Info, PackageCheck, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { searchModCatalog } from "../api";
import type { AppNotifier, ModCatalogEntry, ModCatalogSearchResult, ModCatalogSourceKind, ScanResult } from "../types";
import type { DownloadTask } from "../utils/downloadTask";
import {
  buildCatalogEntryViews,
  clampCatalogPage,
  filterCatalogEntryViews,
  paginateCatalogEntryViews,
  normalizeCatalogType,
  sortCatalogEntryViews,
  type CatalogEntryView,
  type CatalogFilters,
  type CatalogPage,
  type CatalogSortKey
} from "../utils/catalogView";
import { DialogFacts, DialogShell, SearchBox, Select } from "./common";
import { Pagination } from "./Pagination";

type ModCatalogManagerProps = {
  downloadTask?: DownloadTask | null;
  loading: boolean;
  notifier: AppNotifier;
  scan: ScanResult;
  sources: ModCatalogSourceKind[];
  onInstall: (entry: ModCatalogEntry) => void;
  onRetryFailed?: () => void;
};

const defaultSources: ModCatalogSourceKind[] = ["wegfan", "everestMirror"];

const defaultFilters: CatalogFilters = {
  type: "all",
  source: "all",
  install: "all",
  downloadableOnly: false
};

export function ModCatalogManager({ downloadTask, loading, notifier, scan, sources, onInstall, onRetryFailed }: ModCatalogManagerProps) {
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ModCatalogSearchResult>({ sources: [], entries: [], warnings: [] });
  const [detailEntry, setDetailEntry] = useState<ModCatalogEntry | null>(null);
  const [filters, setFilters] = useState<CatalogFilters>(defaultFilters);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [sortKey, setSortKey] = useState<CatalogSortKey>("relevance");
  const [page, setPage] = useState(1);
  const searchRequestRef = useRef(0);

  const sourceList = useMemo(() => (sources.length ? sources : defaultSources), [sources]);
  const allViews = useMemo(
    () => buildCatalogEntryViews(searchResult.entries, [...scan.maps, ...scan.otherMods], downloadTask ?? null, query),
    [downloadTask, query, scan.maps, scan.otherMods, searchResult.entries]
  );
  const typeOptions = useMemo(() => catalogTypeOptions(allViews), [allViews]);
  const visibleViews = useMemo(
    () => sortCatalogEntryViews(filterCatalogEntryViews(allViews, filters), sortKey),
    [allViews, filters, sortKey]
  );
  const pagedViews = useMemo(() => paginateCatalogEntryViews(visibleViews, page), [page, visibleViews]);
  const detailView = detailEntry
    ? (allViews.find((view) => view.entry.source === detailEntry.source && view.entry.id === detailEntry.id) ?? null)
    : null;
  const activeSourceLabels = sourceList.map(sourceLabel).join("、");
  const resultText = formatCatalogResultText(pagedViews, visibleViews.length, searchResult.entries.length, activeSourceLabels);

  useEffect(() => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    let disposed = false;
    const timer = window.setTimeout(() => {
      setCatalogSearching(true);
      searchModCatalog(query, sourceList)
        .then((result) => {
          if (disposed || searchRequestRef.current !== requestId) return;
          setSearchResult(result);
          setDetailEntry((current) =>
            current && result.entries.some((entry) => entry.source === current.source && entry.id === current.id) ? current : null
          );
          if (result.warnings.length) notifier.showWarning(result.warnings.join("；"));
        })
        .catch((error) => {
          if (disposed || searchRequestRef.current !== requestId) return;
          notifier.showError(error instanceof Error ? error.message : "搜索 Mod 目录失败。");
        })
        .finally(() => {
          if (!disposed && searchRequestRef.current === requestId) setCatalogSearching(false);
        });
    }, 300);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [notifier, query, sourceList]);

  useEffect(() => {
    setPage(1);
  }, [filters, query, sortKey, sourceList]);

  useEffect(() => {
    setPage((current) => clampCatalogPage(current, visibleViews.length));
  }, [visibleViews.length]);

  function updateFilters(update: Partial<CatalogFilters>) {
    setFilters((current) => ({ ...current, ...update }));
  }

  return (
    <section className="mod-catalog-manager">
      <div className="list-header catalog-header">
        <div>
          <h2>Mod 获取中心</h2>
          <p>{resultText}</p>
        </div>
      </div>

      <div className="catalog-layout">
        <section className="catalog-column">
          <div className="catalog-column-heading">
            <PackageCheck size={17} />
            <h3>目录结果</h3>
            {catalogSearching && <small>搜索中...</small>}
          </div>
          <div className="catalog-actions">
            <SearchBox className="catalog-search" value={query} onChange={setQuery} placeholder="搜索 Mod、地图、Helper" />
          </div>
          <CatalogFilterBar
            filters={filters}
            sortKey={sortKey}
            typeOptions={typeOptions}
            onFiltersChange={updateFilters}
            onSortChange={setSortKey}
          />
          <div className="catalog-meta-stack">
            <WarningStrip warnings={searchResult.warnings} />
            <CatalogDownloadSummary task={downloadTask ?? null} />
          </div>
          <div className="catalog-list">
            {pagedViews.items.map((view) => (
              <CatalogEntryRow
                key={`${view.entry.source}:${view.entry.id}`}
                view={view}
                loading={loading}
                onInstall={() => onInstall(view.entry)}
                onOpenDetail={() => setDetailEntry(view.entry)}
                onRetryFailed={onRetryFailed}
              />
            ))}
            {!visibleViews.length && <EmptyCatalog text={searchResult.entries.length ? "没有符合筛选的目录结果。" : "暂无目录结果。"} />}
          </div>
          <CatalogPagination
            end={pagedViews.end}
            page={pagedViews.page}
            pageCount={pagedViews.pageCount}
            start={pagedViews.start}
            total={visibleViews.length}
            onPageChange={setPage}
          />
        </section>
      </div>
      {detailEntry && detailView && (
        <CatalogEntryDetailDialog
          view={detailView}
          loading={loading}
          onClose={() => setDetailEntry(null)}
          onInstall={() => onInstall(detailEntry)}
          onRetryFailed={onRetryFailed}
        />
      )}
    </section>
  );
}

function CatalogPagination(props: Omit<ComponentProps<typeof Pagination>, "ariaLabel">) {
  return (
    <div className="catalog-pagination">
      <Pagination {...props} ariaLabel="目录结果分页" />
    </div>
  );
}

function CatalogFilterBar({
  filters,
  sortKey,
  typeOptions,
  onFiltersChange,
  onSortChange
}: {
  filters: CatalogFilters;
  sortKey: CatalogSortKey;
  typeOptions: Array<{ label: string; value: string }>;
  onFiltersChange: (update: Partial<CatalogFilters>) => void;
  onSortChange: (sortKey: CatalogSortKey) => void;
}) {
  return (
    <div className="catalog-filter-bar">
      <Select label="类型" value={filters.type} onChange={(value) => onFiltersChange({ type: value as CatalogFilters["type"] })}>
        <option value="all">全部</option>
        {typeOptions.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Select label="来源" value={filters.source} onChange={(value) => onFiltersChange({ source: value as CatalogFilters["source"] })}>
        <option value="all">全部</option>
        <option value="wegfan">WEGFan</option>
        <option value="everestMirror">Everest 镜像</option>
        <option value="everest">Everest 官方</option>
      </Select>
      <Select label="状态" value={filters.install} onChange={(value) => onFiltersChange({ install: value as CatalogFilters["install"] })}>
        <option value="all">全部</option>
        <option value="installed">已安装</option>
        <option value="notInstalled">未安装</option>
      </Select>
      <Select label="排序" value={sortKey} onChange={(value) => onSortChange(value as CatalogSortKey)}>
        <option value="relevance">相关度</option>
        <option value="updatedDesc">更新时间</option>
        <option value="nameAsc">名称</option>
        <option value="sizeDesc">大小</option>
      </Select>
      <label className={`catalog-downloadable-toggle ${filters.downloadableOnly ? "active" : ""}`}>
        <input
          type="checkbox"
          checked={filters.downloadableOnly}
          onChange={(event) => onFiltersChange({ downloadableOnly: event.target.checked })}
        />
        <span>可下载</span>
      </label>
    </div>
  );
}

function CatalogEntryRow({
  view,
  loading,
  onInstall,
  onOpenDetail,
  onRetryFailed
}: {
  view: CatalogEntryView;
  loading: boolean;
  onInstall: () => void;
  onOpenDetail: () => void;
  onRetryFailed?: () => void;
}) {
  const entry = view.entry;
  const installDisabled = loading || view.installed || view.queued || !view.downloadable;
  return (
    <article
      className={`catalog-row catalog-row-clickable ${view.queued ? "queued-row" : ""} ${view.failed ? "failed-row" : ""}`}
      onClick={onOpenDetail}
    >
      <div className="catalog-row-main">
        <strong title={entry.name}>{entry.name}</strong>
        <span>{sourceLabel(entry.source)}</span>
        <span className={`catalog-state-chip ${view.state}`}>{catalogStateLabel(view)}</span>
      </div>
      <div className="catalog-row-meta">
        <small>{entry.version || "无版本号"}</small>
        <small>{catalogTypeLabel(view)}</small>
        <small>{formatSize(entry.size)}</small>
        <small>{formatCatalogTime(entry.lastUpdate)}</small>
        {view.taskItem?.progress && <small>{formatProgress(view.taskItem.progress.downloaded, view.taskItem.progress.total)}</small>}
      </div>
      <div className="catalog-row-actions">
        <button className="icon-button catalog-detail-button" onClick={stopAndRun(onOpenDetail)} title="查看详情">
          <Info size={15} />
        </button>
        {entry.pageUrl && (
          <a href={entry.pageUrl} target="_blank" rel="noreferrer" title="打开来源页面" onClick={(event) => event.stopPropagation()}>
            <ExternalLink size={15} />
          </a>
        )}
        {view.failed && onRetryFailed ? (
          <button onClick={stopAndRun(onRetryFailed)} disabled={loading}>
            <RotateCcw size={15} />
            重试
          </button>
        ) : (
          <button onClick={stopAndRun(onInstall)} disabled={installDisabled}>
            <Download size={15} />
            {catalogActionLabel(view)}
          </button>
        )}
      </div>
    </article>
  );
}

function CatalogEntryDetailDialog({
  view,
  loading,
  onClose,
  onInstall,
  onRetryFailed
}: {
  view: CatalogEntryView;
  loading: boolean;
  onClose: () => void;
  onInstall: () => void;
  onRetryFailed?: () => void;
}) {
  const entry = view.entry;
  const action = view.failed && onRetryFailed ? onRetryFailed : onInstall;
  const actionIcon = view.failed && onRetryFailed ? <RotateCcw size={15} /> : <Download size={15} />;
  return (
    <DialogShell
      actions={[
        {
          label: (
            <>
              {actionIcon}
              {view.failed && onRetryFailed ? "重试" : catalogActionLabel(view)}
            </>
          ),
          onClick: action,
          disabled: loading || view.installed || view.queued || (!view.failed && !entry.downloadUrl),
          variant: "primary"
        }
      ]}
      className="catalog-detail-dialog"
      closeDisabled={loading}
      closeOnBackdrop
      icon={<PackageCheck size={18} />}
      onClose={onClose}
      showCloseButton
      title={entry.name}
    >
      <DialogFacts
        facts={[
          { label: "版本", value: entry.version || "无版本号" },
          { label: "来源", value: sourceLabel(entry.source) },
          { label: "状态", value: catalogStateLabel(view) },
          { label: "类型", value: catalogTypeLabel(view) },
          { label: "大小", value: formatSize(entry.size) },
          { label: "更新", value: formatCatalogTime(entry.lastUpdate) },
          { label: "GameBanana", value: formatGameBananaInfo(entry) },
          { label: "任务", value: view.taskItem?.error ?? formatTaskDetail(view) },
          { label: "下载地址", value: entry.downloadUrl || "无下载地址" },
          { label: "来源页面", value: entry.pageUrl || "无来源页面" }
        ]}
      />
      {entry.pageUrl && (
        <a className="button-like catalog-detail-source-link" href={entry.pageUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={15} />
          来源页面
        </a>
      )}
    </DialogShell>
  );
}

function CatalogDownloadSummary({ task }: { task: DownloadTask | null }) {
  if (!task?.items.length) return null;
  const modItems = task.items.filter((item) => item.kind === "mod");
  if (!modItems.length) return null;
  const active = modItems.filter((item) =>
    ["queued", "downloading", "downloaded", "waitingInstall", "installing"].includes(item.status)
  ).length;
  const failed = modItems.filter((item) => ["downloadFailed", "installFailed", "cancelled", "skipped"].includes(item.status)).length;
  const done = modItems.filter((item) => item.status === "installed").length;
  return (
    <div className="catalog-download-summary" aria-live="polite">
      <span>队列 {active}</span>
      <span>完成 {done}</span>
      <span>失败 {failed}</span>
    </div>
  );
}

function stopAndRun(callback: () => void) {
  return (event: React.MouseEvent) => {
    event.stopPropagation();
    callback();
  };
}

function WarningStrip({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="catalog-warning-list">
      {warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </div>
  );
}

function EmptyCatalog({ text }: { text: string }) {
  return (
    <div className="empty-state compact catalog-empty">
      <p>{text}</p>
    </div>
  );
}

function catalogStateLabel(view: CatalogEntryView) {
  if (view.state === "installed") return "已安装";
  if (view.state === "queued") return "等待下载";
  if (view.state === "downloading") return "下载中";
  if (view.state === "waitingInstall") return "待安装";
  if (view.state === "installing") return "安装中";
  if (view.state === "failed") return "失败";
  if (!view.downloadable) return "不可下载";
  return "未安装";
}

function catalogActionLabel(view: CatalogEntryView) {
  if (view.installed) return "已安装";
  if (view.state === "queued") return "已入队";
  if (view.state === "downloading") return "下载中";
  if (view.state === "waitingInstall") return "待安装";
  if (view.state === "installing") return "安装中";
  if (!view.downloadable) return "无下载";
  return "安装";
}

function formatCatalogResultText(page: CatalogPage<CatalogEntryView>, visibleCount: number, matchedCount: number, sourceLabels: string) {
  const range = visibleCount ? `${page.start}-${page.end} / ${visibleCount}` : "0 / 0";
  const matched = visibleCount === matchedCount ? "" : ` · ${matchedCount} 个匹配`;
  return `${range} 个结果${matched} · ${sourceLabels}`;
}

function catalogTypeLabel(view: CatalogEntryView) {
  const category = formatCatalogTypeLabel(view.typeLabel);
  const subCategory = view.entry.subCategoryName.trim();
  return subCategory ? `${category} / ${subCategory}` : category;
}

function formatTaskDetail(view: CatalogEntryView) {
  if (!view.taskItem) return "未加入队列";
  return catalogStateLabel(view);
}

function sourceLabel(source: ModCatalogSourceKind) {
  if (source === "everest") return "Everest 官方";
  if (source === "everestMirror") return "Everest 镜像";
  return "WEGFan";
}

function formatSize(size: number | null) {
  if (!size) return "未知大小";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KiB`;
  return `${(size / 1024 / 1024).toFixed(1)} MiB`;
}

function formatCatalogTime(value: number | null) {
  if (!value) return "未知";
  return new Date(value * 1000).toLocaleString();
}

function formatProgress(downloaded: number, total: number | null) {
  if (!total || total <= 0) return formatSize(downloaded);
  return `${Math.round((downloaded / total) * 100)}%`;
}

function catalogTypeOptions(views: CatalogEntryView[]) {
  const options = new Map<string, string>();
  for (const view of views) {
    const value = normalizeCatalogType(view.typeLabel);
    if (!options.has(value)) options.set(value, formatCatalogTypeLabel(view.typeLabel));
  }
  return [...options.entries()]
    .map(([value, label]) => ({ label, value }))
    .sort((left, right) => typeSortRank(left.value) - typeSortRank(right.value) || left.label.localeCompare(right.label, "zh-Hans-CN"));
}

function typeSortRank(value: string) {
  if (value === "map" || value === "maps") return 0;
  if (value === "mod") return 1;
  return 2;
}

function formatCatalogTypeLabel(value: string) {
  const normalized = normalizeCatalogType(value);
  if (normalized === "map" || normalized === "maps") return "地图";
  if (normalized === "mod") return "Mod";
  return value.trim() || "Mod";
}

function formatGameBananaInfo(entry: ModCatalogEntry) {
  const parts = [
    entry.gameBananaId === null ? "" : `Mod ${entry.gameBananaId}`,
    entry.gameBananaFileId === null ? "" : `File ${entry.gameBananaFileId}`
  ].filter(Boolean);
  return parts.length ? parts.join("，") : "无";
}
