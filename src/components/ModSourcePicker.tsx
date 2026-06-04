import { GripVertical, Server } from "lucide-react";
import { useRef, useState } from "react";
import type { ModCatalogSourceKind } from "../types";

type SourceLane = "selected" | "unselected";

type SourceOption = {
  value: ModCatalogSourceKind;
  label: string;
};

type SourceLayout = {
  selected: ModCatalogSourceKind[];
  unselected: ModCatalogSourceKind[];
};

type DragState = {
  source: ModCatalogSourceKind;
  from: SourceLane;
};

const sourceOptions: SourceOption[] = [
  { value: "wegfan", label: "WEGFan" },
  { value: "everestMirror", label: "Everest 镜像" },
  { value: "everest", label: "Everest 官方" }
];

export function ModSourcePicker({
  disabled,
  enabledCount,
  order,
  onChange
}: {
  disabled?: boolean;
  enabledCount: number;
  order: ModCatalogSourceKind[];
  onChange: (order: ModCatalogSourceKind[], enabledCount: number) => void;
}) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draftLayout, setDraftLayout] = useState<SourceLayout | null>(null);
  const draftLayoutRef = useRef<SourceLayout | null>(null);
  const baseLayout = sourceLayout(order, enabledCount);
  const layout = draftLayout ?? baseLayout;

  function startDrag(source: ModCatalogSourceKind, from: SourceLane) {
    if (disabled) return;
    setDragState({ source, from });
    draftLayoutRef.current = baseLayout;
    setDraftLayout(baseLayout);
  }

  function previewMove(targetLane: SourceLane, targetIndex: number) {
    if (!dragState || disabled) return;
    const currentLayout = draftLayoutRef.current ?? draftLayout ?? baseLayout;
    const next = moveInLayout(currentLayout, dragState.source, targetLane, targetIndex);
    if (sameLayout(currentLayout, next)) return;
    draftLayoutRef.current = next;
    setDraftLayout(next);
  }

  function previewMoveToSource(targetLane: SourceLane, targetSource: ModCatalogSourceKind, insertAfter: boolean) {
    if (!dragState || targetSource === dragState.source) return;
    const currentLayout = draftLayoutRef.current ?? draftLayout ?? baseLayout;
    const targetItems = currentLayout[targetLane].filter((source) => source !== dragState.source);
    const targetIndex = targetItems.indexOf(targetSource);
    if (targetIndex < 0) return;
    previewMove(targetLane, targetIndex + (insertAfter ? 1 : 0));
  }

  function commitDrag(targetLane?: SourceLane) {
    let latestLayout = draftLayoutRef.current ?? draftLayout;
    if (!dragState || !latestLayout) {
      resetDrag();
      return;
    }
    if (targetLane && !latestLayout[targetLane].includes(dragState.source)) {
      latestLayout = moveInLayout(latestLayout, dragState.source, targetLane, latestLayout[targetLane].length);
    }
    const latestOrder = [...latestLayout.selected, ...latestLayout.unselected];
    const latestEnabledCount = latestLayout.selected.length;
    if (!sameSources([...baseLayout.selected, ...baseLayout.unselected], latestOrder) || baseLayout.selected.length !== latestEnabledCount) {
      onChange(latestOrder, latestEnabledCount);
    }
    resetDrag();
  }

  function resetDrag() {
    setDragState(null);
    draftLayoutRef.current = null;
    setDraftLayout(null);
  }

  return (
    <div className="catalog-source-picker" aria-label="Mod 数据源">
      <Server className="catalog-source-icon" size={16} />
      <SourceLaneView
        disabled={disabled}
        dragState={dragState}
        label="已启用，按优先级使用"
        lane="selected"
        sources={layout.selected}
        onCommitDrag={commitDrag}
        onPreviewMove={previewMove}
        onPreviewMoveToSource={previewMoveToSource}
        onResetDrag={resetDrag}
        onStartDrag={startDrag}
      />
      <div className="catalog-source-divider" aria-hidden="true" />
      <SourceLaneView
        disabled={disabled}
        dragState={dragState}
        label="未启用"
        lane="unselected"
        sources={layout.unselected}
        onCommitDrag={commitDrag}
        onPreviewMove={previewMove}
        onPreviewMoveToSource={previewMoveToSource}
        onResetDrag={resetDrag}
        onStartDrag={startDrag}
      />
    </div>
  );
}

function SourceLaneView({
  disabled,
  dragState,
  label,
  lane,
  sources,
  onCommitDrag,
  onPreviewMove,
  onPreviewMoveToSource,
  onResetDrag,
  onStartDrag
}: {
  disabled?: boolean;
  dragState: DragState | null;
  label: string;
  lane: SourceLane;
  sources: ModCatalogSourceKind[];
  onCommitDrag: (targetLane?: SourceLane) => void;
  onPreviewMove: (targetLane: SourceLane, targetIndex: number) => void;
  onPreviewMoveToSource: (targetLane: SourceLane, targetSource: ModCatalogSourceKind, insertAfter: boolean) => void;
  onResetDrag: () => void;
  onStartDrag: (source: ModCatalogSourceKind, from: SourceLane) => void;
}) {
  return (
    <div
      className={`catalog-source-lane ${lane}${sources.length ? "" : " empty"}`}
      aria-label={`${label}数据源`}
      onDragOver={(event) => {
        if (!disabled && dragState) {
          event.preventDefault();
          onPreviewMove(lane, sources.length);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        onCommitDrag(lane);
      }}
    >
      <span className="catalog-source-lane-label">{label}</span>
      {sources.map((source) => (
        <SourceChip
          disabled={disabled}
          dragging={dragState?.source === source}
          key={source}
          lane={lane}
          source={source}
          onCommitDrag={onCommitDrag}
          onPreviewMove={(insertAfter) => onPreviewMoveToSource(lane, source, insertAfter)}
          onResetDrag={onResetDrag}
          onStartDrag={() => onStartDrag(source, lane)}
        />
      ))}
    </div>
  );
}

function SourceChip({
  disabled,
  dragging,
  lane,
  source,
  onCommitDrag,
  onPreviewMove,
  onResetDrag,
  onStartDrag
}: {
  disabled?: boolean;
  dragging: boolean;
  lane: SourceLane;
  source: ModCatalogSourceKind;
  onCommitDrag: (targetLane?: SourceLane) => void;
  onPreviewMove: (insertAfter: boolean) => void;
  onResetDrag: () => void;
  onStartDrag: () => void;
}) {
  const option = sourceOption(source);
  return (
    <div
      className={`catalog-source-chip ${lane}${dragging ? " dragging" : ""}${disabled ? " disabled" : ""}`}
      draggable={!disabled}
      onDragEnd={onResetDrag}
      onDragOver={(event) => {
        if (!disabled) {
          event.preventDefault();
          event.stopPropagation();
          if (dragging) return;
          const rect = event.currentTarget.getBoundingClientRect();
          onPreviewMove(event.clientX > rect.left + rect.width / 2);
        }
      }}
      onDragStart={(event) => {
        onStartDrag();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", source);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCommitDrag(lane);
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      title={`拖动调整 ${option.label}`}
    >
      <GripVertical size={13} />
      {option.label}
    </div>
  );
}

function sourceLayout(order: ModCatalogSourceKind[], enabledCount: number): SourceLayout {
  const normalizedOrder = normalizeSourceOrder(order);
  const normalizedEnabledCount = Math.max(1, Math.min(enabledCount, normalizedOrder.length));
  return {
    selected: normalizedOrder.slice(0, normalizedEnabledCount),
    unselected: normalizedOrder.slice(normalizedEnabledCount)
  };
}

function normalizeSourceOrder(sources: ModCatalogSourceKind[]) {
  const seen = new Set<ModCatalogSourceKind>();
  const normalized = sources.filter((source) => {
    if (!sourceOptions.some((option) => option.value === source) || seen.has(source)) return false;
    seen.add(source);
    return true;
  });
  for (const option of sourceOptions) {
    if (!seen.has(option.value)) normalized.push(option.value);
  }
  return normalized;
}

function moveInLayout(layout: SourceLayout, source: ModCatalogSourceKind, targetLane: SourceLane, targetIndex: number): SourceLayout {
  const selected = layout.selected.filter((item) => item !== source);
  const unselected = layout.unselected.filter((item) => item !== source);
  const fromSelected = layout.selected.includes(source);

  if (fromSelected && targetLane === "unselected" && selected.length === 0) {
    return layout;
  }

  const target = targetLane === "selected" ? selected : unselected;
  target.splice(Math.max(0, Math.min(targetIndex, target.length)), 0, source);
  return { selected, unselected };
}

function sameSources(left: ModCatalogSourceKind[], right: ModCatalogSourceKind[]) {
  return left.length === right.length && left.every((source, index) => source === right[index]);
}

function sameLayout(left: SourceLayout, right: SourceLayout) {
  return sameSources(left.selected, right.selected) && sameSources(left.unselected, right.unselected);
}

function sourceOption(source: ModCatalogSourceKind) {
  return sourceOptions.find((option) => option.value === source) ?? { value: source, label: source };
}
