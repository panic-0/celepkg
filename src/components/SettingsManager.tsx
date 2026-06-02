import { CircleDot, Columns3, Save, ToggleLeft, ToggleRight } from "lucide-react";
import type { SaveFileInfo } from "../types";
import { formatUnixNanoseconds } from "../utils/time";
import type { StrawberryDenominator } from "../viewTypes";

type SettingsManagerProps = {
  loading: boolean;
  saveFiles: SaveFileInfo[];
  selectedSaveFiles: string[];
  showWarningColumn: boolean;
  strawberryDenominator: StrawberryDenominator;
  onSelectedSaveFilesChange: (value: string[]) => void;
  onShowWarningColumnChange: (value: boolean) => void;
  onStrawberryDenominatorChange: (value: StrawberryDenominator) => void;
};

export function SettingsManager({
  loading,
  saveFiles,
  selectedSaveFiles,
  showWarningColumn,
  strawberryDenominator,
  onSelectedSaveFilesChange,
  onShowWarningColumnChange,
  onStrawberryDenominatorChange
}: SettingsManagerProps) {
  const selectedSaveSet = new Set(selectedSaveFiles);
  const selectedAvailableCount = saveFiles.filter((save) => selectedSaveSet.has(save.name)).length;

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
          <h2>显示设置</h2>
          <p>{saveFiles.length ? `${selectedAvailableCount}/${saveFiles.length} 个存档参与统计` : "未找到数字存档"}</p>
        </div>
      </div>

      <div className="settings-layout">
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
            <button className={strawberryDenominator === "total" ? "active" : ""} onClick={() => onStrawberryDenominatorChange("total")}>
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

        <section className="settings-section save-settings-section">
          <div className="settings-section-heading">
            <Save size={18} />
            <h3>存档</h3>
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
            <p className="filter-summary">没有找到数字存档。</p>
          )}
        </section>
      </div>
    </section>
  );
}
