import { Download, ExternalLink, Info, PackageCheck, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { searchModCatalog } from "../api";
import { DownloadProgressStrip } from "./DownloadProgressStrip";
import type { AppNotifier, ModCatalogEntry, ModCatalogSearchResult, ModCatalogSourceKind, ModDownloadProgress, ScanResult } from "../types";

type ModCatalogManagerProps = {
  loading: boolean;
  notifier: AppNotifier;
  scan: ScanResult;
  sources: ModCatalogSourceKind[];
  setLoading: (loading: boolean, message?: string) => void;
  progress: ModDownloadProgress | null;
  onCancelDownload: () => void;
  onInstall: (entry: ModCatalogEntry) => void;
};

const defaultSources: ModCatalogSourceKind[] = ["wegfan", "everestMirror"];

export function ModCatalogManager({ loading, notifier, scan, sources, setLoading, progress, onCancelDownload, onInstall }: ModCatalogManagerProps) {
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ModCatalogSearchResult>({ sources: [], entries: [], warnings: [] });
  const [detailEntry, setDetailEntry] = useState<ModCatalogEntry | null>(null);
  const installedNames = useMemo(
    () => new Set([...scan.maps, ...scan.otherMods].map((item) => item.name.toLowerCase())),
    [scan.maps, scan.otherMods]
  );

  const sourceList = sources.length ? sources : defaultSources;

  async function runSearch() {
    try {
      setLoading(true, "搜索 Mod 目录...");
      const result = await searchModCatalog(query, sourceList);
      setSearchResult(result);
      notifier.showSuccess(`找到 ${result.entries.length} 个目录条目`);
    } catch (error) {
      notifier.showError(error instanceof Error ? error.message : "搜索 Mod 目录失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mod-catalog-manager">
      <div className="list-header catalog-header">
        <div>
          <h2>搜索与下载新 Mod</h2>
          <p>{`${searchResult.entries.length} 个搜索结果`}</p>
        </div>
        <div className="catalog-actions">
          <label className="search-box catalog-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch();
              }}
              placeholder="搜索 Mod、地图、Helper"
            />
          </label>
          <button onClick={runSearch} disabled={loading}>
            <Search size={16} />
            搜索
          </button>
        </div>
      </div>

      <div className="catalog-layout">
        <section className="catalog-column">
          <div className="catalog-column-heading">
            <PackageCheck size={17} />
            <h3>目录结果</h3>
          </div>
          <DownloadProgressStrip
            className="catalog-download-progress"
            doneLabel="已安装"
            errorLabel="安装失败"
            progress={progress}
            onCancel={onCancelDownload}
          />
          <WarningStrip warnings={searchResult.warnings} />
          <div className="catalog-list">
            {searchResult.entries.map((entry) => (
              <CatalogEntryRow
                entry={entry}
                installed={installedNames.has(entry.name.toLowerCase())}
                key={`${entry.source}:${entry.id}`}
                onInstall={() => onInstall(entry)}
                onOpenDetail={() => setDetailEntry(entry)}
              />
            ))}
            {!searchResult.entries.length && <EmptyCatalog text="输入关键字搜索可下载的新 Mod。" />}
          </div>
        </section>
      </div>
      {detailEntry && (
        <CatalogEntryDetailDialog
          entry={detailEntry}
          installed={installedNames.has(detailEntry.name.toLowerCase())}
          loading={loading}
          progress={progress}
          onClose={() => setDetailEntry(null)}
          onCancelDownload={onCancelDownload}
          onInstall={() => onInstall(detailEntry)}
        />
      )}
    </section>
  );
}

function CatalogEntryRow({
  entry,
  installed,
  onInstall,
  onOpenDetail
}: {
  entry: ModCatalogEntry;
  installed: boolean;
  onInstall: () => void;
  onOpenDetail: () => void;
}) {
  return (
    <article className="catalog-row catalog-row-clickable" onClick={onOpenDetail}>
      <div className="catalog-row-main">
        <strong title={entry.name}>{entry.name}</strong>
        <span>{sourceLabel(entry.source)}</span>
      </div>
      <div className="catalog-row-meta">
        <small>{entry.version || "无版本号"}</small>
        <small>{entry.gameBananaType || "Mod"}</small>
        <small>{formatSize(entry.size)}</small>
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
        <button onClick={stopAndRun(onInstall)} disabled={installed || !entry.downloadUrl}>
          <Download size={15} />
          {installed ? "已安装" : "安装"}
        </button>
      </div>
    </article>
  );
}

function CatalogEntryDetailDialog({
  entry,
  installed,
  loading,
  progress,
  onClose,
  onCancelDownload,
  onInstall
}: {
  entry: ModCatalogEntry;
  installed: boolean;
  loading: boolean;
  progress: ModDownloadProgress | null;
  onClose: () => void;
  onCancelDownload: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="confirm-dialog catalog-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog-heading">
          <PackageCheck size={18} />
          <h3 id="catalog-detail-title">{entry.name}</h3>
          <button className="icon-button catalog-detail-close-button" onClick={onClose} disabled={loading} title="关闭详情">
            <X size={16} />
          </button>
        </div>
        <dl className="confirm-dialog-facts catalog-detail-facts">
          <FactRow label="版本" value={entry.version || "无版本号"} />
          <FactRow label="来源" value={sourceLabel(entry.source)} />
          <FactRow label="类型" value={entry.gameBananaType || "Mod"} />
          <FactRow label="大小" value={formatSize(entry.size)} />
          <FactRow label="更新" value={formatCatalogTime(entry.lastUpdate)} />
          <FactRow label="GameBanana" value={formatGameBananaInfo(entry)} />
          <FactRow label="下载地址" value={entry.downloadUrl || "无下载地址"} />
          <FactRow label="来源页面" value={entry.pageUrl || "无来源页面"} />
        </dl>
        <DownloadProgressStrip
          className="catalog-detail-progress"
          doneLabel="已安装"
          errorLabel="安装失败"
          progress={progress}
          onCancel={onCancelDownload}
        />
        <div className="confirm-dialog-actions">
          {entry.pageUrl && (
            <a className="button-like" href={entry.pageUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              来源页面
            </a>
          )}
          <button className="confirm-primary-button" onClick={onInstall} disabled={loading || installed || !entry.downloadUrl}>
            <Download size={15} />
            {installed ? "已安装" : "安装"}
          </button>
        </div>
      </section>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
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

function formatGameBananaInfo(entry: ModCatalogEntry) {
  const parts = [
    entry.gameBananaId === null ? "" : `Mod ${entry.gameBananaId}`,
    entry.gameBananaFileId === null ? "" : `File ${entry.gameBananaFileId}`
  ].filter(Boolean);
  return parts.length ? parts.join("，") : "无";
}
