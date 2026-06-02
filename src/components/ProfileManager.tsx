import { Copy, Gamepad2, Layers, Plus, RefreshCw, ToggleRight, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  onMapProfileCopy: () => void;
  onMapProfileCreateEmpty: () => void;
  onModProfileCopy: () => void;
  onModProfileCreateEmpty: () => void;
  onMapProfileOverwriteFromCurrent: () => void;
  onMapProfileOverwriteFromProfile: (sourceProfileId: string, mode: ProfileOverwriteMode) => void;
  onModProfileOverwriteFromCurrent: () => void;
  onModProfileOverwriteFromProfile: (sourceProfileId: string, mode: ProfileOverwriteMode) => void;
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
  onModProfileOverwriteFromCurrent,
  onModProfileOverwriteFromProfile
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
          nameLabel="地图 Profile 名称"
          summary={selectedMapProfile ? profileSummary(selectedMapProfile) : "请选择地图 Profile"}
          onCopy={onMapProfileCopy}
          onCreateEmpty={onMapProfileCreateEmpty}
          onNameChange={onMapProfileNameChange}
          onOverwriteFromCurrent={onMapProfileOverwriteFromCurrent}
          onOverwriteFromProfile={onMapProfileOverwriteFromProfile}
          onProfileDelete={onMapProfileDelete}
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
          nameLabel="Mod Profile 名称"
          summary={selectedModProfile ? profileSummary(selectedModProfile) : "请选择 Mod Profile"}
          onCopy={onModProfileCopy}
          onCreateEmpty={onModProfileCreateEmpty}
          onNameChange={onModProfileNameChange}
          onOverwriteFromCurrent={onModProfileOverwriteFromCurrent}
          onOverwriteFromProfile={onModProfileOverwriteFromProfile}
          onProfileDelete={onModProfileDelete}
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
  onCopy: () => void;
  onCreateEmpty: () => void;
  onNameChange: (value: string) => void;
  onOverwriteFromCurrent: () => void;
  onOverwriteFromProfile: (sourceProfileId: string, mode: ProfileOverwriteMode) => void;
  onProfileDelete: (profile: Profile) => void;
  onProfileSelect: (profile: Profile) => void;
  scrollKey: string;
  scrollMemory: ScrollMemory;
}) {
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const sourceProfiles = useMemo(() => profiles.filter((profile) => profile.id !== selectedProfileId), [profiles, selectedProfileId]);
  const [overwriteSourceId, setOverwriteSourceId] = useState("");
  const [overwriteMode, setOverwriteMode] = useState<ProfileOverwriteMode>("enabled");
  const profileListRef = useScrollMemory<HTMLDivElement>(scrollKey, scrollMemory);

  useEffect(() => {
    if (sourceProfiles.some((profile) => profile.id === overwriteSourceId)) return;
    setOverwriteSourceId(sourceProfiles[0]?.id ?? "");
  }, [overwriteSourceId, sourceProfiles]);

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
          profiles.map((profile) => (
            <div className={profile.id === selectedProfileId ? "profile-row active" : "profile-row"} key={profile.id}>
              <button className="profile" onClick={() => onProfileSelect(profile)}>
                <span>{profile.name}</span>
                <small>{profileSummary(profile)}</small>
              </button>
              <button
                className="profile-delete-button"
                disabled={loading || isDefaultProfile(profile)}
                title={isDefaultProfile(profile) ? "默认 Profile 不能删除" : "删除 Profile"}
                onClick={(event) => {
                  event.stopPropagation();
                  if (window.confirm(`删除 Profile「${profile.name}」？`)) onProfileDelete(profile);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <div className="empty-state compact profile-list-empty">
            <p>还没有 Profile。</p>
          </div>
        )}
      </div>
      <label className="field">
        <span>{nameLabel}</span>
        <input value={nameDraft} onChange={(event) => onNameChange(event.target.value)} />
      </label>
      <button className="wide-button" onClick={onCreateEmpty} disabled={loading}>
        <Plus size={16} />
        新建空 Profile
      </button>
      <button className="wide-button" onClick={onCopy} disabled={loading || !selectedProfile}>
        <Copy size={16} />
        复制当前 Profile
      </button>
      <div className="profile-overwrite-box">
        <label className="field">
          <span>覆盖来源</span>
          <select
            value={overwriteSourceId}
            onChange={(event) => setOverwriteSourceId(event.target.value)}
            disabled={!sourceProfiles.length}
          >
            {sourceProfiles.length ? (
              sourceProfiles.map((profile) => (
                <option value={profile.id} key={profile.id}>
                  {profile.name}
                </option>
              ))
            ) : (
              <option value="">没有其他 Profile</option>
            )}
          </select>
        </label>
        <label className="field">
          <span>覆盖范围</span>
          <select value={overwriteMode} onChange={(event) => setOverwriteMode(event.target.value as ProfileOverwriteMode)}>
            <option value="enabled">只覆盖启用情况</option>
            <option value="all">覆盖全部内容</option>
          </select>
        </label>
        <button
          className="wide-button overwrite-button"
          onClick={() => {
            const sourceProfile = sourceProfiles.find((profile) => profile.id === overwriteSourceId);
            if (!sourceProfile || !selectedProfile) return;
            const confirmed =
              overwriteMode === "all"
                ? window.confirm(
                    `用「${sourceProfile.name}」的全部内容覆盖「${selectedProfile.name}」？这会覆盖名称、启用情况和启动参数，但不会改变 Profile id。`
                  )
                : window.confirm(
                    `只用「${sourceProfile.name}」的启用情况覆盖「${selectedProfile.name}」？名称、启动参数、Favorite 和 Protected 不会被覆盖。`
                  );
            if (confirmed) onOverwriteFromProfile(sourceProfile.id, overwriteMode);
          }}
          disabled={loading || !selectedProfile || !overwriteSourceId}
        >
          <RefreshCw size={16} />从 Profile 覆盖
        </button>
      </div>
      <button
        className="wide-button overwrite-button"
        onClick={() => {
          if (
            window.confirm(
              `只用当前游戏启用情况覆盖「${selectedProfile?.name || title}」？Profile 名称、启动参数、Favorite 和 Protected 不会被覆盖。`
            )
          ) {
            onOverwriteFromCurrent();
          }
        }}
        disabled={loading || !selectedProfile}
      >
        <RefreshCw size={16} />
        从当前游戏覆盖启用情况
      </button>
    </aside>
  );
}

function isDefaultProfile(profile: Profile) {
  return profile.id === "default-maps" || profile.id === "default-mods";
}
