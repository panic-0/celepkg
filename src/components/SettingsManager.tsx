import { Archive, CircleDot, Columns3, PackageSearch, Save, SearchCheck, ToggleLeft, ToggleRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { ModCatalogSourceKind, SaveFileInfo } from "../types";
import { formatUnixNanoseconds } from "../utils/time";
import type { StrawberryDenominator } from "../viewTypes";
import { ModSourcePicker } from "./ModSourcePicker";

type SettingsManagerProps = {
  autoBackupCleanupEnabled: boolean;
  autoBackupEnabled: boolean;
  autoBackupRetentionCount: number;
  autoCheckModUpdatesOnStartup: boolean;
  loading: boolean;
  modCatalogSourceEnabledCount: number;
  modCatalogSourceOrder: ModCatalogSourceKind[];
  saveFiles: SaveFileInfo[];
  selectedSaveFiles: string[];
  showWarningColumn: boolean;
  strawberryDenominator: StrawberryDenominator;
  onAutoBackupCleanupEnabledChange: (value: boolean) => void;
  onAutoBackupEnabledChange: (value: boolean) => void;
  onAutoBackupRetentionCountChange: (value: number) => void;
  onAutoCheckModUpdatesOnStartupChange: (value: boolean) => void;
  onModCatalogSourcesChange: (order: ModCatalogSourceKind[], enabledCount: number) => void;
  onSelectedSaveFilesChange: (value: string[]) => void;
  onShowWarningColumnChange: (value: boolean) => void;
  onStrawberryDenominatorChange: (value: StrawberryDenominator) => void;
};

export function SettingsManager({
  autoBackupCleanupEnabled,
  autoBackupEnabled,
  autoBackupRetentionCount,
  autoCheckModUpdatesOnStartup,
  loading,
  modCatalogSourceEnabledCount,
  modCatalogSourceOrder,
  saveFiles,
  selectedSaveFiles,
  showWarningColumn,
  strawberryDenominator,
  onAutoBackupCleanupEnabledChange,
  onAutoBackupEnabledChange,
  onAutoBackupRetentionCountChange,
  onAutoCheckModUpdatesOnStartupChange,
  onModCatalogSourcesChange,
  onSelectedSaveFilesChange,
  onShowWarningColumnChange,
  onStrawberryDenominatorChange
}: SettingsManagerProps) {
  const [retentionDraft, setRetentionDraft] = useState(String(autoBackupRetentionCount));
  const selectedSaveSet = new Set(selectedSaveFiles);
  const selectedAvailableCount = saveFiles.filter((save) => selectedSaveSet.has(save.name)).length;

  useEffect(() => {
    setRetentionDraft(String(autoBackupRetentionCount));
  }, [autoBackupRetentionCount]);

  function commitRetentionDraft() {
    const value = Number.parseInt(retentionDraft, 10);
    const nextCount = Number.isFinite(value) ? Math.max(1, Math.min(100, value)) : Math.max(1, autoBackupRetentionCount);
    setRetentionDraft(String(nextCount));
    if (nextCount !== autoBackupRetentionCount) {
      onAutoBackupRetentionCountChange(nextCount);
    }
  }

  function toggleSave(name: string) {
    if (selectedSaveSet.has(name)) {
      if (selectedSaveFiles.length <= 1) return;
      onSelectedSaveFilesChange(selectedSaveFiles.filter((item) => item !== name));
      return;
    }
    onSelectedSaveFilesChange([...selectedSaveFiles, name]);
  }

  return (
    <section className="settings-manager">
      <div className="list-header">
        <div>
          <h2>设置</h2>
          <p>{saveFiles.length ? `${selectedAvailableCount}/${saveFiles.length} 个存档参与统计` : "未找到数字存档"}</p>
        </div>
      </div>

      <div className="settings-layout">
        <section className="settings-group save-settings-group">
          <div className="settings-group-heading">
            <h3>存档</h3>
          </div>
          <div className="settings-group-grid">
            <section className="settings-section save-settings-section">
              <div className="settings-section-heading">
                <Save size={18} />
                <h3>统计存档</h3>
                <small>{saveFiles.length ? `${selectedAvailableCount}/${saveFiles.length}` : "未找到"}</small>
              </div>
              {saveFiles.length ? (
                <div className="save-list settings-save-list">
                  {saveFiles.map((save) => {
                    const selected = selectedSaveSet.has(save.name);
                    return (
                      <button
                        className={selected ? "save-option active" : "save-option"}
                        disabled={loading || (selected && selectedSaveFiles.length <= 1)}
                        key={save.name}
                        onClick={() => toggleSave(save.name)}
                        title={save.currentMap || "未知当前地图"}
                      >
                        <span>{save.name}</span>
                        <strong>{save.playerName || "未知玩家"}</strong>
                        <small>{save.currentMap || "未知当前地图"}</small>
                        <small>{formatUnixNanoseconds(save.lastModified, "未知时间")}</small>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state compact settings-empty">
                  <Save size={22} />
                  <p>没有找到数字存档。</p>
                </div>
              )}
            </section>
          </div>
        </section>

        <section className="settings-group">
          <div className="settings-group-heading">
            <h3>显示</h3>
          </div>
          <div className="settings-group-grid">
            <section className="settings-section">
              <div className="settings-section-heading">
                <CircleDot size={18} />
                <h3>草莓</h3>
              </div>
              <div className="segmented two">
                <button
                  className={strawberryDenominator === "visible" ? "active" : ""}
                  onClick={() => onStrawberryDenominatorChange("visible")}
                >
                  概览分母
                </button>
                <button
                  className={strawberryDenominator === "total" ? "active" : ""}
                  onClick={() => onStrawberryDenominatorChange("total")}
                >
                  全部草莓
                </button>
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-section-heading">
                <Columns3 size={18} />
                <h3>列表</h3>
              </div>
              <button
                className={showWarningColumn ? "inline-toggle active" : "inline-toggle"}
                onClick={() => onShowWarningColumnChange(!showWarningColumn)}
                title="在列表中显示警告数量列"
              >
                {showWarningColumn ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                警告栏
              </button>
            </section>
          </div>
        </section>

        <section className="settings-group">
          <div className="settings-group-heading">
            <h3>Mod</h3>
          </div>
          <div className="settings-group-grid">
            <section className="settings-section mod-settings-section">
              <div className="settings-section-heading">
                <PackageSearch size={18} />
                <h3>更新与下载</h3>
              </div>
              <div className="settings-field-stack">
                <span>数据源</span>
                <ModSourcePicker
                  disabled={loading}
                  enabledCount={modCatalogSourceEnabledCount}
                  order={modCatalogSourceOrder}
                  onChange={onModCatalogSourcesChange}
                />
                <small className="catalog-source-hint">已启用数据源从左到右优先使用，拖到未启用会停用该源。</small>
              </div>
              <button
                className={autoCheckModUpdatesOnStartup ? "inline-toggle active" : "inline-toggle"}
                disabled={loading}
                onClick={() => onAutoCheckModUpdatesOnStartupChange(!autoCheckModUpdatesOnStartup)}
                title="应用启动并完成扫描后自动检查本地 Mod 更新"
              >
                {autoCheckModUpdatesOnStartup ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                <SearchCheck size={16} />
                启动时检查更新
              </button>
            </section>
          </div>
        </section>

        <section className="settings-group">
          <div className="settings-group-heading">
            <h3>备份</h3>
          </div>
          <div className="settings-group-grid">
            <section className="settings-section backup-settings-section">
              <div className="settings-section-heading">
                <Archive size={18} />
                <h3>自动备份</h3>
              </div>
              <button
                className={autoBackupEnabled ? "inline-toggle active" : "inline-toggle"}
                onClick={() => onAutoBackupEnabledChange(!autoBackupEnabled)}
                disabled={loading}
              >
                {autoBackupEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                修改前自动备份
              </button>
              <div className="backup-retention-segments" aria-label="自动清理策略">
                <label
                  className={autoBackupCleanupEnabled ? "backup-retention-option active" : "backup-retention-option"}
                  onClick={() => {
                    if (!autoBackupCleanupEnabled && !loading) onAutoBackupCleanupEnabledChange(true);
                  }}
                >
                  <span>保留最近</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={retentionDraft}
                    onBlur={commitRetentionDraft}
                    onChange={(event) => setRetentionDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    disabled={loading || !autoBackupCleanupEnabled}
                  />
                  <span>个</span>
                </label>
                <button
                  className={autoBackupCleanupEnabled ? "backup-retention-option" : "backup-retention-option active"}
                  onClick={() => onAutoBackupCleanupEnabledChange(false)}
                  disabled={loading}
                  type="button"
                >
                  不自动清理
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </section>
  );
}
