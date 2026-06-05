import { AlertTriangle, Archive, FolderOpen, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { BackupFileEntry, BackupInfo, RestoreScope } from "../types";
import { formatUnixNanoseconds } from "../utils/time";
import { ConfirmDialog } from "./common";

type BackupManagerProps = {
  autoBackupCleanupEnabled: boolean;
  backups: BackupInfo[];
  backupsRefreshing: boolean;
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
  backupsRefreshing,
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
    <section className="ui-panel backup-manager">
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
          <button onClick={onBackupFolderOpen}>
            <FolderOpen size={16} />
            文件夹
          </button>
          <button className="ui-icon-button icon-button" onClick={onBackupsRefresh} disabled={backupsRefreshing} title="刷新备份列表">
            <RefreshCw size={16} className={backupsRefreshing ? "spin-icon" : ""} />
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
          <div className="ui-empty-state empty-state table-empty backup-empty">
            <Archive size={28} />
            <p>暂无备份。</p>
            <div className="empty-actions">
              <button onClick={onBackupCreate} disabled={loading}>
                <Archive size={16} />
                立即备份
              </button>
              <button onClick={onBackupFolderOpen}>
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
  const managedFiles = backup.files.filter((file) => file.category === "game" && file.existed).length;
  const totalManagedFiles = backup.files.filter((file) => file.category === "game").length;

  return (
    <article className="backup-item">
      <div>
        <strong>{formatBackupTime(backup.createdAt)}</strong>
        <span>{backup.kind === "manual" ? "手动备份" : "自动备份"}</span>
        <small title={backup.celestePath}>{backup.celestePath || "未设置 Celeste 目录"}</small>
        <small>{`Mod 清单 ${backup.mods.length} 个，受管文件 ${managedFiles}/${totalManagedFiles}`}</small>
      </div>
      <div className="backup-actions">
        <button onClick={() => onLocationOpen(backup.backupPath)}>
          <FolderOpen size={16} />
          位置
        </button>
        <button onClick={() => onRestore(backup)} disabled={loading}>
          <RotateCcw size={16} />
          还原启用状态
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
  const managedFiles = backup.files.filter((file) => file.category === "game" && file.existed).length;
  const totalManagedFiles = backup.files.filter((file) => file.category === "game").length;
  return (
    <ConfirmDialog
      confirmLabel="删除"
      description="此操作会删除这个备份目录，删除后不能在应用内还原。"
      facts={[
        { label: "时间", value: formatBackupTime(backup.createdAt) },
        { label: "类型", value: backup.kind === "manual" ? "手动备份" : "自动备份" },
        { label: "Mod 清单", value: `${backup.mods.length} 个` },
        { label: "受管文件", value: `${managedFiles}/${totalManagedFiles}` },
        { label: "位置", value: backup.backupPath }
      ]}
      icon={<AlertTriangle size={18} />}
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="删除备份"
      variant="danger"
    />
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
    <ConfirmDialog
      className="backup-restore-dialog"
      confirmLabel="确认还原启用状态"
      description="确认后会按下列清单覆盖或删除 CelePkg 管理的启用状态文件。"
      facts={[
        { label: "备份时间", value: formatBackupTime(backup.createdAt) },
        { label: "备份类型", value: backup.kind === "manual" ? "手动备份" : "自动备份" },
        { label: "Mod 快照", value: `${backup.mods.length} 个` }
      ]}
      icon={<RotateCcw size={18} />}
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="还原启用状态"
    >
      <div className="restore-preview-list">
        {files.map((file) => (
          <RestorePreviewRow file={file} key={`${file.category}:${file.label}`} />
        ))}
      </div>
    </ConfirmDialog>
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

function formatBackupTime(value: string) {
  return formatUnixNanoseconds(value.split("-")[0], value);
}
