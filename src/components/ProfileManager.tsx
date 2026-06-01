import { Check, Gamepad2, Layers, Play, Save, Sparkles, ToggleRight, Trash2 } from "lucide-react";
import { useScrollMemory, type ScrollMemory } from "../hooks/useScrollMemory";
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
  onLaunch: () => void;
  onLaunchArgsChange: (value: string) => void;
  onMapProfileNameChange: (value: string) => void;
  onMapProfileSelect: (profile: Profile) => void;
  onModProfileNameChange: (value: string) => void;
  onModProfileSelect: (profile: Profile) => void;
  onMapProfileDelete: (profile: Profile) => void;
  onModProfileDelete: (profile: Profile) => void;
  onSaveAsMapProfile: () => void;
  onSaveAsModProfile: () => void;
  onSaveMapProfile: (applyAfterSave: boolean) => void;
  onSaveModProfile: (applyAfterSave: boolean) => void;
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
  onLaunch,
  onLaunchArgsChange,
  onMapProfileNameChange,
  onMapProfileSelect,
  onModProfileNameChange,
  onModProfileSelect,
  onMapProfileDelete,
  onModProfileDelete,
  onSaveAsMapProfile,
  onSaveAsModProfile,
  onSaveMapProfile,
  onSaveModProfile
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
          <button onClick={onLaunch} disabled={loading || !selectedMapProfile || !selectedModProfile}>
            <Play size={16} />
            启动
          </button>
          <button onClick={onApplyProfile} disabled={loading || !selectedMapProfile || !selectedModProfile}>
            <ToggleRight size={16} />
            应用
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
          onNameChange={onMapProfileNameChange}
          onProfileDelete={onMapProfileDelete}
          onProfileSelect={onMapProfileSelect}
          onSave={() => onSaveMapProfile(false)}
          onSaveAndApply={() => onSaveMapProfile(true)}
          onSaveAs={onSaveAsMapProfile}
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
          onNameChange={onModProfileNameChange}
          onProfileDelete={onModProfileDelete}
          onProfileSelect={onModProfileSelect}
          onSave={() => onSaveModProfile(false)}
          onSaveAndApply={() => onSaveModProfile(true)}
          onSaveAs={onSaveAsModProfile}
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
  onNameChange,
  onProfileDelete,
  onProfileSelect,
  onSave,
  onSaveAndApply,
  onSaveAs,
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
  onNameChange: (value: string) => void;
  onProfileDelete: (profile: Profile) => void;
  onProfileSelect: (profile: Profile) => void;
  onSave: () => void;
  onSaveAndApply: () => void;
  onSaveAs: () => void;
  scrollKey: string;
  scrollMemory: ScrollMemory;
}) {
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const profileListRef = useScrollMemory<HTMLDivElement>(scrollKey, scrollMemory);

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
        {profiles.map((profile) => (
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
        ))}
      </div>
      <label className="field">
        <span>{nameLabel}</span>
        <input value={nameDraft} onChange={(event) => onNameChange(event.target.value)} />
      </label>
      <div className="button-row">
        <button onClick={onSave} disabled={loading || !selectedProfile}>
          <Save size={16} />
          保存
        </button>
        <button onClick={onSaveAndApply} disabled={loading || !selectedProfile}>
          <Check size={16} />
          保存并应用
        </button>
      </div>
      <button className="wide-button" onClick={onSaveAs} disabled={loading}>
        <Sparkles size={16} />
        新建 Profile
      </button>
    </aside>
  );
}

function isDefaultProfile(profile: Profile) {
  return profile.id === "default-maps" || profile.id === "default-mods";
}
