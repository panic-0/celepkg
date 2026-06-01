import type { ScanResult } from "../types";
import { Metric } from "./common";

type StatusStripProps = {
  enabledCount: number;
  enabledModCount: number;
  scan: ScanResult;
};

export function StatusStrip({ enabledCount, enabledModCount, scan }: StatusStripProps) {
  const completedCount = scan.maps.filter((map) => map.completionStatus === "completed").length;
  const warningCount = [...scan.maps, ...scan.otherMods].filter((record) => record.warnings.length).length;

  return (
    <section className="status-strip">
      <Metric label="地图" value={scan.maps.length} />
      <Metric label="启用" value={enabledCount} />
      <Metric label="其他 Mod" value={scan.otherMods.length} />
      <Metric label="Mod 启用" value={enabledModCount} />
      <Metric label="已完成" value={completedCount} />
      <Metric label="依赖警告" value={warningCount} tone={warningCount ? "warn" : "ok"} />
      <span className="path-note">{scan.modsPath || "等待选择 Celeste 目录"}</span>
    </section>
  );
}
