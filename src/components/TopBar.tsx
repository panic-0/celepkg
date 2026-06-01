import { FolderOpen, Play, RefreshCcw } from "lucide-react";

type TopBarProps = {
  celestePath: string;
  loading: boolean;
  canLaunch: boolean;
  onLaunch: () => void;
  onPathChange: (path: string) => void;
  onRefresh: () => void;
};

export function TopBar({ celestePath, loading, canLaunch, onLaunch, onPathChange, onRefresh }: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Celeste 地图管理器</p>
        <h1>CelePkg</h1>
      </div>
      <div className="path-control">
        <FolderOpen size={18} />
        <input
          value={celestePath}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="Celeste 安装目录，例如 D:/SteamLibrary/steamapps/common/Celeste"
        />
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
