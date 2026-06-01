import { Check, Gamepad2, Play, Save, Sparkles, ToggleRight } from "lucide-react";
import type { Profile } from "../types";
import { profileSummary } from "../utils/format";

type ProfileManagerProps = {
  enabledMapCount: number;
  enabledModCount: number;
  launchArgs: string;
  loading: boolean;
  profileName: string;
  profiles: Profile[];
  selectedProfileId: string;
  totalMapCount: number;
  totalModCount: number;
  onApplyProfile: () => void;
  onLaunch: () => void;
  onLaunchArgsChange: (value: string) => void;
  onProfileNameChange: (value: string) => void;
  onProfileSelect: (profile: Profile) => void;
  onSaveAsProfile: () => void;
  onSaveProfile: (applyAfterSave: boolean) => void;
};

export function ProfileManager({
  enabledMapCount,
  enabledModCount,
  launchArgs,
  loading,
  profileName,
  profiles,
  selectedProfileId,
  totalMapCount,
  totalModCount,
  onApplyProfile,
  onLaunch,
  onLaunchArgsChange,
  onProfileNameChange,
  onProfileSelect,
  onSaveAsProfile,
  onSaveProfile
}: ProfileManagerProps) {
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);

  return (
    <section className="profile-manager">
      <div className="list-header">
        <div>
          <h2>Profile</h2>
          <p>{`${profiles.length} 个配置，当前草稿启用 ${enabledMapCount}/${totalMapCount} 图，${enabledModCount}/${totalModCount} Mod`}</p>
        </div>
        <button onClick={onLaunch} disabled={loading}>
          <Play size={16} />
          启动
        </button>
        <button onClick={onApplyProfile} disabled={loading || !selectedProfile}>
          <ToggleRight size={16} />
          应用
        </button>
      </div>

      <div className="profile-layout">
        <div className="profile-table-card">
          <div className="profile-table-scroll">
            <table className="record-table profile-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>范围</th>
                  <th>启动参数</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr
                    className={profile.id === selectedProfileId ? "active" : ""}
                    key={profile.id}
                    onClick={() => onProfileSelect(profile)}
                  >
                    <td className="name-cell">
                      <strong title={profile.name}>{profile.name}</strong>
                      <small title={profile.id}>{profile.id}</small>
                    </td>
                    <td title={profileSummary(profile)}>{profileSummary(profile)}</td>
                    <td title={profile.launchArgs || "无"}>{profile.launchArgs || "-"}</td>
                    <td title={profile.updatedAt}>{formatDate(profile.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="profile-editor">
          <div className="panel-title">
            <Gamepad2 size={17} />
            当前 Profile
          </div>
          <div className="profile-current">
            <strong title={selectedProfile?.name || "未选择"}>{selectedProfile?.name || "未选择"}</strong>
            <span>{selectedProfile ? profileSummary(selectedProfile) : "请选择一个 Profile"}</span>
          </div>
          <label className="field">
            <span>启动参数</span>
            <input value={launchArgs} onChange={(event) => onLaunchArgsChange(event.target.value)} placeholder="-debug" />
          </label>
          <label className="field">
            <span>另存为</span>
            <input value={profileName} onChange={(event) => onProfileNameChange(event.target.value)} />
          </label>
          <div className="profile-stats">
            <span>草稿地图</span>
            <strong>{`${enabledMapCount}/${totalMapCount}`}</strong>
            <span>草稿 Mod</span>
            <strong>{`${enabledModCount}/${totalModCount}`}</strong>
          </div>
          <div className="button-row">
            <button onClick={() => onSaveProfile(false)} disabled={loading || !selectedProfile}>
              <Save size={16} />
              保存
            </button>
            <button onClick={() => onSaveProfile(true)} disabled={loading || !selectedProfile}>
              <Check size={16} />
              保存并应用
            </button>
          </div>
          <div className="button-row">
            <button onClick={onSaveAsProfile} disabled={loading}>
              <Sparkles size={16} />
              新建 Profile
            </button>
            <button onClick={onApplyProfile} disabled={loading || !selectedProfile}>
              <ToggleRight size={16} />
              应用
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
