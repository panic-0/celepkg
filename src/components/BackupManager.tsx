import { Archive, FolderOpen, RefreshCw, RotateCcw, ToggleLeft, ToggleRight } from "lucide-react";
import type { BackupInfo, RestoreScope } from "../types";

type BackupManagerProps = {
  autoBackupEnabled: boolean;
  backups: BackupInfo[];
  celestePath: string;
  loading: boolean;
  onAutoBackupEnabledChange: (enabled: boolean) => void;
  onBackupCreate: () => void;
  onBackupFolderOpen: () => void;
  onBackupLocationOpen: (backupPath: string) => void;
  onBackupRestore: (backupId: string, scope: RestoreScope) => void;
  onBackupsRefresh: () => void;
};

export function BackupManager({
  autoBackupEnabled,
  backups,
  celestePath,
  loading,
  onAutoBackupEnabledChange,
  onBackupCreate,
  onBackupFolderOpen,
  onBackupLocationOpen,
  onBackupRestore,
  onBackupsRefresh
}: BackupManagerProps) {
  return (
    <section className="backup-manager">
      <div className="list-header">
        <div>
          <h2>备份还原</h2>
          <p>{`${backups.length} 个备份，当前目录：${celestePath || "未设置"}`}</p>
        </div>
        <div className="backup-header-actions">
          <button
            className={autoBackupEnabled ? "inline-toggle active compact" : "inline-toggle compact"}
            onClick={() => onAutoBackupEnabledChange(!autoBackupEnabled)}
            disabled={loading}
          >
            {autoBackupEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            修改前自动备份
          </button>
          <button onClick={onBackupCreate} disabled={loading}>
            <Archive size={16} />
            备份
          </button>
          <button onClick={onBackupFolderOpen} disabled={loading}>
            <FolderOpen size={16} />
            文件夹
          </button>
          <button className="icon-button" onClick={onBackupsRefresh} disabled={loading} title="刷新备份列表">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="backup-list-scroll">
        {backups.length ? (
          <div className="backup-list">
            {backups.map((backup) => (
              <BackupItem
                backup={backup}
                key={backup.id}
                loading={loading}
                onLocationOpen={onBackupLocationOpen}
                onRestore={onBackupRestore}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state table-empty">
            <Archive size={28} />
            <p>暂无备份。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function BackupItem({
  backup,
  loading,
  onLocationOpen,
  onRestore
}: {
  backup: BackupInfo;
  loading: boolean;
  onLocationOpen: (backupPath: string) => void;
  onRestore: (backupId: string, scope: RestoreScope) => void;
}) {
  const gameFiles = backup.files.filter((file) => file.category === "game" && file.existed).length;

  return (
    <article className="backup-item">
      <div>
        <strong>{formatBackupTime(backup.createdAt)}</strong>
        <span>{backup.kind === "manual" ? "手动备份" : "自动备份"}</span>
        <small title={backup.celestePath}>{backup.celestePath || "未设置 Celeste 目录"}</small>
        <small>{`游戏文件 ${gameFiles}/2`}</small>
      </div>
      <div className="backup-actions">
        <button onClick={() => onLocationOpen(backup.backupPath)} disabled={loading}>
          <FolderOpen size={16} />
          位置
        </button>
        <button onClick={() => onRestore(backup.id, "game")} disabled={loading}>
          <RotateCcw size={16} />
          游戏文件
        </button>
      </div>
    </article>
  );
}

function formatBackupTime(value: string) {
  try {
    const milliseconds = Number(BigInt(value.split("-")[0]) / 1_000_000n);
    return new Date(milliseconds).toLocaleString();
  } catch {
    return value;
  }
}
