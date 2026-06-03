import { AlertTriangle, Check, Copy, Gamepad2, Layers, Pencil, Plus, RefreshCw, ToggleRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { useScrollMemory, type ScrollMemory } from "../hooks/useScrollMemory";
import type { ProfileOverwriteMode } from "../hooks/useProfileDraft";
import type { Profile } from "../types";
import { profileSummary } from "../utils/format";

type ProfileManagerProps = {
  dependencyModCount: number;
  enabledMapCount: number;
  enabledModCount: number;
  launchArgs: string;
  loading: boolean;
  mapProfileName: string;
  mapProfiles: Profile[];
  modProfileName: string;
  modProfiles: Profile[];
  selectedMapProfileId: string;
  selectedModProfileId: string;
  scrollMemory: ScrollMemory;
  totalMapCount: number;
  totalModCount: number;
  onApplyProfile: () => void;
  onLaunchArgsChange: (value: string) => void;
  onMapProfileNameChange: (value: string) => void;
  onMapProfileSelect: (profile: Profile) => void;
  onModProfileNameChange: (value: string) => void;
  onModProfileSelect: (profile: Profile) => void;
  onMapProfileDelete: (profile: Profile) => void;
  onModProfileDelete: (profile: Profile) => void;
  onMapProfileCopy: (profile: Profile) => void;
  onMapProfileCreateEmpty: () => void;
  onModProfileCopy: (profile: Profile) => void;
  onModProfileCreateEmpty: () => void;
  onMapProfileOverwriteFromCurrent: () => void;
  onMapProfileOverwriteFromProfile: (sourceProfileId: string, mode: ProfileOverwriteMode) => void;
  onMapProfileRename: (profile: Profile, name: string) => void;
  onModProfileOverwriteFromCurrent: () => void;
  onModProfileOverwriteFromProfile: (sourceProfileId: string, mode: ProfileOverwriteMode) => void;
  onModProfileRename: (profile: Profile, name: string) => void;
};

export function ProfileManager({
  dependencyModCount,
  enabledMapCount,
  enabledModCount,
  launchArgs,
  loading,
  mapProfileName,
  mapProfiles,
  modProfileName,
  modProfiles,
  selectedMapProfileId,
  selectedModProfileId,
  scrollMemory,
  totalMapCount,
  totalModCount,
  onApplyProfile,
  onLaunchArgsChange,
  onMapProfileNameChange,
  onMapProfileSelect,
  onModProfileNameChange,
  onModProfileSelect,
  onMapProfileDelete,
  onModProfileDelete,
  onMapProfileCopy,
  onMapProfileCreateEmpty,
  onModProfileCopy,
  onModProfileCreateEmpty,
  onMapProfileOverwriteFromCurrent,
  onMapProfileOverwriteFromProfile,
  onMapProfileRename,
  onModProfileOverwriteFromCurrent,
  onModProfileOverwriteFromProfile,
  onModProfileRename
}: ProfileManagerProps) {
  const selectedMapProfile = mapProfiles.find((profile) => profile.id === selectedMapProfileId);
  const selectedModProfile = modProfiles.find((profile) => profile.id === selectedModProfileId);

  return (
    <section className="profile-manager">
      <div className="list-header">
        <div>
          <h2>Profile</h2>
          <p>{`启用 ${enabledMapCount}/${totalMapCount} 图，${enabledModCount}/${totalModCount} Mod，其中 ${dependencyModCount} 个由依赖推导`}</p>
        </div>
        <div className="profile-header-actions">
          <button onClick={onApplyProfile} disabled={loading || !selectedMapProfile || !selectedModProfile}>
            <ToggleRight size={16} />
            应用当前
          </button>
        </div>
      </div>

      <div className="profile-combo-bar">
        <SummaryItem label="地图 Profile" value={selectedMapProfile?.name || "未选择"} />
        <SummaryItem label="Mod Profile" value={selectedModProfile?.name || "未选择"} />
        <SummaryItem label="启用地图" value={`${enabledMapCount}/${totalMapCount}`} />
        <SummaryItem label="有效 Mod" value={`${enabledModCount}/${totalModCount}，${dependencyModCount} 依赖`} />
        <label className="profile-launch-field">
          <span>启动参数</span>
          <input value={launchArgs} onChange={(event) => onLaunchArgsChange(event.target.value)} placeholder="-debug" />
        </label>
      </div>

      <div className="profile-layout split">
        <ProfileColumn
          icon={<Gamepad2 size={17} />}
          title="地图 Profile"
          profiles={mapProfiles}
          selectedProfileId={selectedMapProfileId}
          nameDraft={mapProfileName}
          nameLabel="新建地图 Profile 名称"
          summary={selectedMapProfile ? profileSummary(selectedMapProfile) : "请选择地图 Profile"}
          onCopy={onMapProfileCopy}
          onCreateEmpty={onMapProfileCreateEmpty}
          onNameChange={onMapProfileNameChange}
          onOverwriteFromCurrent={onMapProfileOverwriteFromCurrent}
          onOverwriteFromProfile={onMapProfileOverwriteFromProfile}
          onProfileDelete={onMapProfileDelete}
          onProfileRename={onMapProfileRename}
          onProfileSelect={onMapProfileSelect}
          scrollKey="profiles:maps"
          scrollMemory={scrollMemory}
          loading={loading}
        />

        <ProfileColumn
          icon={<Layers size={17} />}
          title="其他 Mod Profile"
          profiles={modProfiles}
          selectedProfileId={selectedModProfileId}
          nameDraft={modProfileName}
          nameLabel="新建 Mod Profile 名称"
          summary={selectedModProfile ? profileSummary(selectedModProfile) : "请选择 Mod Profile"}
          onCopy={onModProfileCopy}
          onCreateEmpty={onModProfileCreateEmpty}
          onNameChange={onModProfileNameChange}
          onOverwriteFromCurrent={onModProfileOverwriteFromCurrent}
          onOverwriteFromProfile={onModProfileOverwriteFromProfile}
          onProfileDelete={onModProfileDelete}
          onProfileRename={onModProfileRename}
          onProfileSelect={onModProfileSelect}
          scrollKey="profiles:mods"
          scrollMemory={scrollMemory}
          loading={loading}
        />
      </div>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-summary-item">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function ProfileColumn({
  icon,
  loading,
  nameDraft,
  nameLabel,
  profiles,
  selectedProfileId,
  summary,
  title,
  onCopy,
  onCreateEmpty,
  onNameChange,
  onOverwriteFromCurrent,
  onOverwriteFromProfile,
  onProfileDelete,
  onProfileRename,
  onProfileSelect,
  scrollKey,
  scrollMemory
}: {
  icon: React.ReactNode;
  loading: boolean;
  nameDraft: string;
  nameLabel: string;
  profiles: Profile[];
  selectedProfileId: string;
  summary: string;
  title: string;
  onCopy: (profile: Profile) => void;
  onCreateEmpty: () => void;
  onNameChange: (value: string) => void;
  onOverwriteFromCurrent: () => void;
  onOverwriteFromProfile: (sourceProfileId: string, mode: ProfileOverwriteMode) => void;
  onProfileDelete: (profile: Profile) => void;
  onProfileRename: (profile: Profile, name: string) => void;
  onProfileSelect: (profile: Profile) => void;
  scrollKey: string;
  scrollMemory: ScrollMemory;
}) {
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [overwriteMode, setOverwriteMode] = useState<ProfileOverwriteMode>("enabled");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const profileListRef = useScrollMemory<HTMLDivElement>(scrollKey, scrollMemory);
  const overwriteModeLabel = overwriteMode === "all" ? "覆盖全部内容" : "只覆盖启用情况";

  function openOverwriteFromProfileDialog(sourceProfile: Profile) {
    if (!selectedProfile || sourceProfile.id === selectedProfileId) return;
    setConfirmDialog({
      title: "确认覆盖 Profile",
      description:
        overwriteMode === "all"
          ? "这会覆盖目标 Profile 的名称、启用情况和启动参数，但不会改变 Profile id，也不会改变 Favorite / 始终启用标记。"
          : "这只会复制来源 Profile 的启用情况，目标 Profile 的名称和启动参数不变，Favorite / 始终启用标记不会改变。",
      actionLabel: "确认覆盖",
      rows: [
        { label: "目标 Profile", value: selectedProfile.name },
        { label: "来源 Profile", value: sourceProfile.name },
        { label: "覆盖范围", value: overwriteModeLabel }
      ],
      onConfirm: () => onOverwriteFromProfile(sourceProfile.id, overwriteMode)
    });
  }

  function openOverwriteFromCurrentDialog() {
    if (!selectedProfile) return;
    setConfirmDialog({
      title: "确认覆盖 Profile",
      description: "Profile 名称和启动参数不变，始终启用条目会保留当前 Profile 选择。",
      actionLabel: "确认覆盖",
      rows: [
        { label: "目标 Profile", value: selectedProfile.name || title },
        { label: "来源 Profile", value: "当前游戏启用情况" },
        { label: "覆盖范围", value: "只覆盖启用情况" }
      ],
      onConfirm: onOverwriteFromCurrent
    });
  }

  function openDeleteDialog(profile: Profile) {
    setConfirmDialog({
      title: "确认删除 Profile",
      description: "删除后无法从 CelePkg 内直接恢复。默认 Profile 不能删除。",
      actionLabel: "确认删除",
      danger: true,
      rows: [
        { label: "目标 Profile", value: profile.name },
        { label: "来源 Profile", value: "不适用" },
        { label: "覆盖范围", value: "删除整个 Profile" }
      ],
      onConfirm: () => onProfileDelete(profile)
    });
  }

  function startRename(profile: Profile) {
    setEditingProfileId(profile.id);
    setRenameDraft(profile.name);
  }

  function cancelRename() {
    setEditingProfileId(null);
    setRenameDraft("");
  }

  function commitRename(profile: Profile) {
    const nextName = renameDraft.trim();
    cancelRename();
    if (nextName && nextName !== profile.name) onProfileRename(profile, nextName);
  }

  function confirmPendingAction() {
    const action = confirmDialog?.onConfirm;
    setConfirmDialog(null);
    action?.();
  }

  return (
    <aside className="profile-editor">
      <div className="panel-title">
        {icon}
        {title}
      </div>
      <div className="profile-current">
        <strong title={selectedProfile?.name || "未选择"}>{selectedProfile?.name || "未选择"}</strong>
        <span>{summary}</span>
      </div>
      <div className="profile-list table-like" ref={profileListRef}>
        {profiles.length ? (
          profiles.map((profile) => {
            const isRenaming = editingProfileId === profile.id;
            return (
              <div className={profile.id === selectedProfileId ? "profile-row active" : "profile-row"} key={profile.id}>
                {isRenaming ? (
                  <div className="profile profile-editing">
                    <input
                      autoFocus
                      className="profile-name-input"
                      value={renameDraft}
                      onBlur={() => commitRename(profile)}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename(profile);
                        } else if (event.key === "Escape") {
                          cancelRename();
                        }
                      }}
                    />
                    <small>{profileSummary(profile)}</small>
                  </div>
                ) : (
                  <button className="profile" onClick={() => onProfileSelect(profile)}>
                    <span>{profile.name}</span>
                    <small>{profileSummary(profile)}</small>
                  </button>
                )}
                <div className="profile-row-actions">
                  <button
                    className={isRenaming ? "profile-action-button save" : "profile-action-button"}
                    disabled={loading}
                    title={isRenaming ? "保存名称" : "重命名 Profile"}
                    onMouseDown={(event) => {
                      if (isRenaming) event.preventDefault();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isRenaming) commitRename(profile);
                      else startRename(profile);
                    }}
                  >
                    {isRenaming ? <Check size={14} /> : <Pencil size={14} />}
                  </button>
                  <button
                    className="profile-action-button"
                    disabled={loading || isRenaming}
                    title="复制 Profile"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCopy(profile);
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="profile-action-button overwrite"
                    disabled={loading || isRenaming || !selectedProfile || profile.id === selectedProfileId}
                    title={profile.id === selectedProfileId ? "不能从当前 Profile 覆盖自己" : "从此 Profile 覆盖当前 Profile"}
                    onClick={(event) => {
                      event.stopPropagation();
                      openOverwriteFromProfileDialog(profile);
                    }}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    className="profile-action-button danger"
                    disabled={loading || isRenaming || isDefaultProfile(profile)}
                    title={isDefaultProfile(profile) ? "默认 Profile 不能删除" : "删除 Profile"}
                    onClick={(event) => {
                      event.stopPropagation();
                      openDeleteDialog(profile);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty-state compact profile-list-empty">
            <p>还没有 Profile。</p>
          </div>
        )}
      </div>
      <div className="profile-name-row">
        <label className="field">
          <span>{nameLabel}</span>
          <input value={nameDraft} onChange={(event) => onNameChange(event.target.value)} placeholder="留空自动命名" />
        </label>
        <button className="profile-create-button" onClick={onCreateEmpty} disabled={loading}>
          <Plus size={16} />
          新建空 Profile
        </button>
      </div>
      <div className="profile-overwrite-mode">
        <label className="field">
          <span>覆盖范围</span>
          <select value={overwriteMode} onChange={(event) => setOverwriteMode(event.target.value as ProfileOverwriteMode)}>
            <option value="enabled">只覆盖启用情况</option>
            <option value="all">覆盖全部内容</option>
          </select>
        </label>
      </div>
      <button className="wide-button overwrite-button" onClick={openOverwriteFromCurrentDialog} disabled={loading || !selectedProfile}>
        <RefreshCw size={16} />
        从当前游戏覆盖启用情况
      </button>
      {confirmDialog && (
        <ConfirmDialog dialog={confirmDialog} loading={loading} onCancel={() => setConfirmDialog(null)} onConfirm={confirmPendingAction} />
      )}
    </aside>
  );
}

type ConfirmDialogState = {
  actionLabel: string;
  danger?: boolean;
  description: string;
  rows: Array<{ label: string; value: string }>;
  title: string;
  onConfirm: () => void;
};

function ConfirmDialog({
  dialog,
  loading,
  onCancel,
  onConfirm
}: {
  dialog: ConfirmDialogState;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="confirm-dialog-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="confirm-dialog-heading">
          <AlertTriangle size={18} />
          <h3 id="confirm-dialog-title">{dialog.title}</h3>
        </div>
        <p>{dialog.description}</p>
        <dl className="confirm-dialog-facts">
          {dialog.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd title={row.value}>{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="confirm-dialog-actions">
          <button onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button className={dialog.danger ? "confirm-danger-button" : "confirm-primary-button"} onClick={onConfirm} disabled={loading}>
            {dialog.actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function isDefaultProfile(profile: Profile) {
  return profile.id === "default-maps" || profile.id === "default-mods";
}
