import { Server } from "lucide-react";
import type { ModCatalogSourceKind } from "../types";

const sourceOptions: Array<{ value: ModCatalogSourceKind; label: string }> = [
  { value: "everestMirror", label: "Everest 镜像" },
  { value: "wegfan", label: "WEGFan" },
  { value: "everest", label: "Everest 官方" }
];

export function ModSourcePicker({
  disabled,
  sources,
  onChange
}: {
  disabled?: boolean;
  sources: ModCatalogSourceKind[];
  onChange: (sources: ModCatalogSourceKind[]) => void;
}) {
  return (
    <div className="catalog-source-picker" aria-label="Mod 数据源">
      <Server size={16} />
      {sourceOptions.map((option) => {
        const active = sources.includes(option.value);
        const cannotDisable = active && sources.length <= 1;
        return (
          <button
            className={active ? "active" : ""}
            disabled={disabled || cannotDisable}
            key={option.value}
            onClick={() => {
              onChange(active ? sources.filter((item) => item !== option.value) : [...sources, option.value]);
            }}
            title={cannotDisable ? "至少保留一个数据源" : active ? `停用 ${option.label}` : `启用 ${option.label}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
