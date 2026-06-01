import { AlertTriangle, CheckCircle2, FolderOpen, Map, Package, Play, RefreshCcw } from "lucide-react";
import type { ScanResult } from "../types";

type AppToolbarProps = {
  canLaunch: boolean;
  celestePath: string;
  enabledMapCount: number;
  enabledModCount: number;
  loading: boolean;
  scan: ScanResult;
  onLaunch: () => void;
  onPathChange: (path: string) => void;
  onRefresh: () => void;
};

export function AppToolbar({
  canLaunch,
  celestePath,
  enabledMapCount,
  enabledModCount,
  loading,
  scan,
  onLaunch,
  onPathChange,
  onRefresh
}: AppToolbarProps) {
  const completedCount = scan.maps.filter((map) => map.completionStatus === "completed").length;
  const warningCount = [...scan.maps, ...scan.otherMods].filter((record) => record.warnings.length).length;

  return (
    <header className="app-toolbar">
      <div className="brand-block">
        <strong>CelePkg</strong>
        <span>{loading ? "正在处理" : scan.modsPath ? "已连接 Celeste" : "等待目录"}</span>
      </div>

      <label className="toolbar-path">
        <FolderOpen size={17} />
        <input
          value={celestePath}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="Celeste 安装目录，例如 D:/SteamLibrary/steamapps/common/Celeste"
        />
      </label>

      <div className="toolbar-metrics" aria-label="当前扫描状态">
        <MetricPill icon={<Map size={14} />} label="地图" value={`${enabledMapCount}/${scan.maps.length}`} />
        <MetricPill icon={<Package size={14} />} label="Mod" value={`${enabledModCount}/${scan.otherMods.length}`} />
        <MetricPill icon={<CheckCircle2 size={14} />} label="完成" value={completedCount} />
        <MetricPill icon={<AlertTriangle size={14} />} label="警告" value={warningCount} tone={warningCount ? "warn" : "ok"} />
      </div>

      <div className="toolbar-actions">
        <button className="icon-button" onClick={onRefresh} disabled={loading} title="保存路径并扫描">
          <RefreshCcw size={18} />
        </button>
        <button className="primary-button" onClick={onLaunch} disabled={loading || !canLaunch}>
          <Play size={18} />
          启动
        </button>
      </div>
    </header>
  );
}

function MetricPill({
  icon,
  label,
  tone,
  value
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "ok" | "warn";
  value: React.ReactNode;
}) {
  return (
    <span className={tone ? `toolbar-pill ${tone}` : "toolbar-pill"}>
      {icon}
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
