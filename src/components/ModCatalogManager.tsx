import { Download, ExternalLink, PackageCheck, RefreshCcw, Search, Server, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { checkModUpdates, installMod, searchModCatalog, updateMod } from "../api";
import type {
  AppNotifier,
  ModCatalogEntry,
  ModCatalogSearchResult,
  ModCatalogSourceKind,
  ModUpdateCandidate,
  ModUpdateCheckResult,
  ScanResult
} from "../types";

type ModCatalogManagerProps = {
  celestePath: string;
  loading: boolean;
  notifier: AppNotifier;
  scan: ScanResult;
  setLoading: (loading: boolean, message?: string) => void;
  setScan: (scan: ScanResult) => void;
};

const defaultSources: ModCatalogSourceKind[] = ["everestMirror", "wegfan"];

export function ModCatalogManager({ celestePath, loading, notifier, scan, setLoading, setScan }: ModCatalogManagerProps) {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<ModCatalogSourceKind[]>(defaultSources);
  const [searchResult, setSearchResult] = useState<ModCatalogSearchResult>({ sources: [], entries: [], warnings: [] });
  const [updateResult, setUpdateResult] = useState<ModUpdateCheckResult>({ sources: [], updates: [], matched: [], warnings: [] });
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

  async function runUpdateCheck() {
    try {
      setLoading(true, "检查 Mod 更新...");
      const result = await checkModUpdates(celestePath, sourceList);
      setUpdateResult(result);
      notifier.showSuccess(result.updates.length ? `发现 ${result.updates.length} 个可更新 Mod` : "本地 Mod 已是最新");
    } catch (error) {
      notifier.showError(error instanceof Error ? error.message : "检查 Mod 更新失败。");
    } finally {
      setLoading(false);
    }
  }

  async function installEntry(entry: ModCatalogEntry) {
    if (!window.confirm(`安装 ${entry.name}${entry.version ? ` ${entry.version}` : ""}？`)) return;
    try {
      setLoading(true, `下载并安装 ${entry.name}...`);
      const result = await installMod(celestePath, entry);
      setScan(result.scan);
      notifier.showSuccess(`已安装到 ${result.destinationPath}`);
    } catch (error) {
      notifier.showError(error instanceof Error ? error.message : "安装 Mod 失败。");
    } finally {
      setLoading(false);
    }
  }

  async function updateEntry(candidate: ModUpdateCandidate) {
    if (!window.confirm(`更新 ${candidate.installed.name} 到 ${candidate.entry.version || "目录最新版本"}？`)) return;
    try {
      setLoading(true, `下载并更新 ${candidate.installed.name}...`);
      const result = await updateMod(celestePath, candidate.entry, candidate.installed.absolutePath);
      setScan(result.scan);
      setUpdateResult((current) => ({
        ...current,
        updates: current.updates.filter((item) => item.installed.absolutePath !== candidate.installed.absolutePath),
        matched: current.matched.map((item) =>
          item.installed.absolutePath === candidate.installed.absolutePath
            ? { ...item, updateAvailable: false, reason: "刚刚已更新" }
            : item
        )
      }));
      notifier.showSuccess(`已更新 ${candidate.installed.name}`);
    } catch (error) {
      notifier.showError(error instanceof Error ? error.message : "更新 Mod 失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mod-catalog-manager">
      <div className="list-header catalog-header">
        <div>
          <h2>Mod 获取与更新</h2>
          <p>{`${searchResult.entries.length} 个搜索结果，${updateResult.updates.length} 个可更新`}</p>
        </div>
        <SourcePicker sources={sources} onChange={setSources} />
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
          <button className="primary-button" onClick={runUpdateCheck} disabled={loading || !celestePath.trim()}>
            <RefreshCcw size={16} />
            检查更新
          </button>
        </div>
      </div>

      <div className="catalog-layout">
        <section className="catalog-column">
          <div className="catalog-column-heading">
            <PackageCheck size={17} />
            <h3>目录结果</h3>
          </div>
          <WarningStrip warnings={searchResult.warnings} />
          <div className="catalog-list">
            {searchResult.entries.map((entry) => (
              <CatalogEntryRow
                entry={entry}
                installed={installedNames.has(entry.name.toLowerCase())}
                key={`${entry.source}:${entry.id}`}
                onInstall={() => installEntry(entry)}
              />
            ))}
            {!searchResult.entries.length && <EmptyCatalog text="输入关键字搜索，或直接检查本地可更新 Mod。" />}
          </div>
        </section>

        <section className="catalog-column">
          <div className="catalog-column-heading">
            <ShieldCheck size={17} />
            <h3>本地更新</h3>
          </div>
          <WarningStrip warnings={updateResult.warnings} />
          <div className="catalog-list">
            {updateResult.updates.map((candidate) => (
              <UpdateCandidateRow
                candidate={candidate}
                key={`${candidate.entry.source}:${candidate.installed.absolutePath}`}
                onUpdate={() => updateEntry(candidate)}
              />
            ))}
            {!updateResult.updates.length && (
              <EmptyCatalog text={updateResult.matched.length ? "已匹配的本地 zip 都在目录记录中。" : "还没有检查更新。"} />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function SourcePicker({ sources, onChange }: { sources: ModCatalogSourceKind[]; onChange: (sources: ModCatalogSourceKind[]) => void }) {
  const sourceOptions: Array<{ value: ModCatalogSourceKind; label: string }> = [
    { value: "everestMirror", label: "Everest 镜像" },
    { value: "wegfan", label: "WEGFan" },
    { value: "everest", label: "Everest 官方" }
  ];
  return (
    <div className="catalog-source-picker" aria-label="Mod 数据源">
      <Server size={16} />
      {sourceOptions.map((option) => {
        const active = sources.includes(option.value);
        return (
          <button
            className={active ? "active" : ""}
            key={option.value}
            onClick={() => {
              onChange(active ? sources.filter((item) => item !== option.value) : [...sources, option.value]);
            }}
            title={active ? `停用 ${option.label}` : `启用 ${option.label}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function CatalogEntryRow({ entry, installed, onInstall }: { entry: ModCatalogEntry; installed: boolean; onInstall: () => void }) {
  return (
    <article className="catalog-row">
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
        {entry.pageUrl && (
          <a href={entry.pageUrl} target="_blank" rel="noreferrer" title="打开来源页面">
            <ExternalLink size={15} />
          </a>
        )}
        <button onClick={onInstall} disabled={installed || !entry.downloadUrl}>
          <Download size={15} />
          {installed ? "已安装" : "安装"}
        </button>
      </div>
    </article>
  );
}

function UpdateCandidateRow({ candidate, onUpdate }: { candidate: ModUpdateCandidate; onUpdate: () => void }) {
  return (
    <article className="catalog-row update-row">
      <div className="catalog-row-main">
        <strong title={candidate.installed.name}>{candidate.installed.name}</strong>
        <span>{sourceLabel(candidate.entry.source)}</span>
      </div>
      <div className="catalog-row-meta">
        <small>{`本地 ${candidate.installed.version || "未知"}`}</small>
        <small>{`目录 ${candidate.entry.version || "最新"}`}</small>
        <small title={candidate.reason}>{candidate.reason}</small>
      </div>
      <div className="catalog-row-actions">
        <button className="primary-button" onClick={onUpdate}>
          <Download size={15} />
          更新
        </button>
      </div>
    </article>
  );
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
