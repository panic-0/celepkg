import { AlertTriangle, Archive, FolderOpen, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { BackupFileEntry, BackupInfo, RestoreScope } from "../types";
import { formatUnixNanoseconds } from "../utils/time";

type BackupManagerProps = {
  autoBackupCleanupEnabled: boolean;
  backups: BackupInfo[];
  celestePath: string;
  loading: boolean;
  onBackupCreate: () => void;
  onBackupDelete: (backupId: string) => void;
  onBackupFolderOpen: () => void;
  onBackupLocationOpen: (backupPath: string) => void;
  onBackupRestore: (backupId: string, scope: RestoreScope) => void;
  onBackupsCleanup: () => void;
  onBackupsRefresh: () => void;
};

export function BackupManager({
  autoBackupCleanupEnabled,
  backups,
  celestePath,
  loading,
  onBackupCreate,
  onBackupDelete,
  onBackupFolderOpen,
  onBackupLocationOpen,
  onBackupRestore,
  onBackupsCleanup,
  onBackupsRefresh
}: BackupManagerProps) {
  const [deleteTarget, setDeleteTarget] = useState<BackupInfo | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);

  function confirmDelete() {
    if (!deleteTarget) return;
    onBackupDelete(deleteTarget.id);
    setDeleteTarget(null);
  }

  function confirmRestore() {
    if (!restoreTarget) return;
    onBackupRestore(restoreTarget.id, "game");
    setRestoreTarget(null);
  }

  return (
    <section className="backup-manager">
      <div className="list-header">
        <div>
          <h2>备份还原</h2>
          <p>{`${backups.length} 个备份，当前目录：${celestePath || "未设置"}`}</p>
        </div>
        <div className="backup-header-actions">
          <button
            onClick={onBackupsCleanup}
            disabled={loading || !autoBackupCleanupEnabled}
            title={autoBackupCleanupEnabled ? "清理超过保留数量的旧自动备份" : "当前已关闭自动清理"}
          >
            <Trash2 size={16} />
            清理旧自动备份
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
                onDelete={setDeleteTarget}
                onRestore={setRestoreTarget}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state table-empty backup-empty">
            <Archive size={28} />
            <p>暂无备份。</p>
            <div className="empty-actions">
              <button onClick={onBackupCreate} disabled={loading}>
                <Archive size={16} />
                立即备份
              </button>
              <button onClick={onBackupFolderOpen} disabled={loading}>
                <FolderOpen size={16} />
                打开文件夹
              </button>
            </div>
          </div>
        )}
      </div>
      {deleteTarget && (
        <BackupDeleteDialog backup={deleteTarget} loading={loading} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
      )}
      {restoreTarget && (
        <BackupRestoreDialog backup={restoreTarget} loading={loading} onCancel={() => setRestoreTarget(null)} onConfirm={confirmRestore} />
      )}
    </section>
  );
}

function BackupItem({
  backup,
  loading,
  onLocationOpen,
  onDelete,
  onRestore
}: {
  backup: BackupInfo;
  loading: boolean;
  onLocationOpen: (backupPath: string) => void;
  onDelete: (backup: BackupInfo) => void;
  onRestore: (backup: BackupInfo) => void;
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
        <button onClick={() => onRestore(backup)} disabled={loading}>
          <RotateCcw size={16} />
          还原游戏文件
        </button>
        <button className="danger-action-button" onClick={() => onDelete(backup)} disabled={loading} title="删除此备份">
          <Trash2 size={16} />
          删除
        </button>
      </div>
    </article>
  );
}

function BackupDeleteDialog({
  backup,
  loading,
  onCancel,
  onConfirm
}: {
  backup: BackupInfo;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const gameFiles = backup.files.filter((file) => file.category === "game" && file.existed).length;
  return (
    <div className="confirm-dialog-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-delete-title">
        <div className="confirm-dialog-heading">
          <AlertTriangle size={18} />
          <h3 id="backup-delete-title">删除备份</h3>
        </div>
        <p>此操作会删除这个备份目录，删除后不能在应用内还原。</p>
        <dl className="confirm-dialog-facts">
          <FactRow label="时间" value={formatBackupTime(backup.createdAt)} />
          <FactRow label="类型" value={backup.kind === "manual" ? "手动备份" : "自动备份"} />
          <FactRow label="游戏文件" value={`${gameFiles}/${backup.files.filter((file) => file.category === "game").length}`} />
          <FactRow label="位置" value={backup.backupPath} />
        </dl>
        <div className="confirm-dialog-actions">
          <button onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button className="confirm-danger-button" onClick={onConfirm} disabled={loading}>
            删除
          </button>
        </div>
      </section>
    </div>
  );
}

function BackupRestoreDialog({
  backup,
  loading,
  onCancel,
  onConfirm
}: {
  backup: BackupInfo;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const files = backup.files.filter((file) => file.category === "game");
  return (
    <div className="confirm-dialog-backdrop" role="presentation">
      <section className="confirm-dialog backup-restore-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-restore-title">
        <div className="confirm-dialog-heading">
          <RotateCcw size={18} />
          <h3 id="backup-restore-title">还原游戏文件</h3>
        </div>
        <p>确认后会按下列清单覆盖或删除当前游戏文件。</p>
        <dl className="confirm-dialog-facts">
          <FactRow label="备份时间" value={formatBackupTime(backup.createdAt)} />
          <FactRow label="备份类型" value={backup.kind === "manual" ? "手动备份" : "自动备份"} />
        </dl>
        <div className="restore-preview-list">
          {files.map((file) => (
            <RestorePreviewRow file={file} key={`${file.category}:${file.label}`} />
          ))}
        </div>
        <div className="confirm-dialog-actions">
          <button onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button className="confirm-primary-button" onClick={onConfirm} disabled={loading}>
            确认还原
          </button>
        </div>
      </section>
    </div>
  );
}

function RestorePreviewRow({ file }: { file: BackupFileEntry }) {
  return (
    <div className={file.existed ? "restore-preview-row overwrite" : "restore-preview-row remove"}>
      <strong>{file.label}</strong>
      <span>{file.existed ? "覆盖或创建目标文件" : "删除当前目标文件"}</span>
      <small>{file.existed ? "备份时存在" : "备份时不存在"}</small>
      <code title={file.targetPath}>{file.targetPath}</code>
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

function formatBackupTime(value: string) {
  return formatUnixNanoseconds(value.split("-")[0], value);
}
