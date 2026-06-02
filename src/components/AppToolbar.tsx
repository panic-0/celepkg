import { AlertTriangle, CheckCircle2, DatabaseZap, FolderOpen, Play, RefreshCcw } from "lucide-react";
import type { ScanResult } from "../types";

type AppToolbarProps = {
  canLaunch: boolean;
  celestePath: string;
  loading: boolean;
  loadingMessage: string;
  scan: ScanResult;
  onApplyAndLaunch: () => void;
  onDirectLaunch: () => void;
  onPathBrowse: () => void;
  onPathChange: (path: string) => void;
  onRefresh: () => void;
  onRescan: () => void;
};

export function AppToolbar({
  canLaunch,
  celestePath,
  loading,
  loadingMessage,
  scan,
  onApplyAndLaunch,
  onDirectLaunch,
  onPathBrowse,
  onPathChange,
  onRefresh,
  onRescan
}: AppToolbarProps) {
  const completedCount = scan.maps.filter((map) => map.completionStatus === "completed").length;
  const warningCount = [...scan.maps, ...scan.otherMods].filter((record) => record.warnings.length).length;

  return (
    <header className="app-toolbar">
      <div className="brand-block">
        <strong>CelePkg</strong>
        <span>{loading ? loadingMessage || "正在处理" : scan.modsPath ? "已连接 Celeste" : "等待目录"}</span>
      </div>

      <div className="toolbar-path">
        <button className="toolbar-path-browse" onClick={onPathBrowse} disabled={loading} title="选择 Celeste 安装目录">
          <FolderOpen size={17} />
        </button>
        <input
          value={celestePath}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="Celeste 安装目录，例如 D:/SteamLibrary/steamapps/common/Celeste"
        />
      </div>

      <div className="toolbar-metrics" aria-label="当前扫描状态">
        <MetricPill icon={<CheckCircle2 size={14} />} label="完成" value={completedCount} />
        <MetricPill icon={<AlertTriangle size={14} />} label="警告" value={warningCount} tone={warningCount ? "warn" : "ok"} />
      </div>

      <div className="toolbar-actions">
        <button className="icon-button" onClick={onRefresh} disabled={loading} title="保存路径并扫描">
          <RefreshCcw size={18} />
        </button>
        <button className="cache-rescan-button" onClick={onRescan} disabled={loading} title="刷新缓存并重新扫描地图">
          <DatabaseZap size={17} />
          重扫缓存
        </button>
        <button className="primary-button" onClick={onApplyAndLaunch} disabled={loading || !canLaunch} title="应用当前 Profile 并启动">
          <Play size={18} />
          应用并启动
        </button>
        <button onClick={onDirectLaunch} disabled={loading || !canLaunch} title="不应用 Profile，直接启动 Celeste">
          <Play size={18} />
          直接启动
        </button>
      </div>
    </header>
  );
}

function MetricPill({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone?: "ok" | "warn"; value: React.ReactNode }) {
  return (
    <span className={tone ? `toolbar-pill ${tone}` : "toolbar-pill"}>
      {icon}
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
