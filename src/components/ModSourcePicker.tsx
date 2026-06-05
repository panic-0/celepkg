import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

type DragTarget = {
  insertAfter?: boolean;
  lane: SourceLane;
  source?: ModCatalogSourceKind;
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
  const dragStateRef = useRef<DragState | null>(null);
  const lastDragTargetRef = useRef<DragTarget | null>(null);
  const previewPointerMoveRef = useRef<(clientX: number, clientY: number) => void>(() => undefined);
  const commitPointerDragRef = useRef<(clientX: number, clientY: number) => void>(() => undefined);
  const baseLayout = sourceLayout(order, enabledCount);
  const layout = draftLayout ?? baseLayout;

  function startDrag(source: ModCatalogSourceKind, from: SourceLane) {
    if (disabled) return;
    const nextDragState = { source, from };
    dragStateRef.current = nextDragState;
    lastDragTargetRef.current = { lane: from, source };
    setDragState(nextDragState);
    draftLayoutRef.current = baseLayout;
    setDraftLayout(baseLayout);
  }

  function previewMove(targetLane: SourceLane, targetIndex: number) {
    const activeDragState = dragStateRef.current;
    if (!activeDragState || disabled) return;
    const currentLayout = draftLayoutRef.current ?? draftLayout ?? baseLayout;
    const next = moveInLayout(currentLayout, activeDragState.source, targetLane, targetIndex);
    if (sameLayout(currentLayout, next)) return;
    draftLayoutRef.current = next;
    setDraftLayout(next);
  }

  function previewMoveToSource(targetLane: SourceLane, targetSource: ModCatalogSourceKind, insertAfter: boolean) {
    const activeDragState = dragStateRef.current;
    if (!activeDragState || targetSource === activeDragState.source) return;
    const currentLayout = draftLayoutRef.current ?? draftLayout ?? baseLayout;
    const targetItems = currentLayout[targetLane].filter((source) => source !== activeDragState.source);
    const targetIndex = targetItems.indexOf(targetSource);
    if (targetIndex < 0) return;
    previewMove(targetLane, targetIndex + (insertAfter ? 1 : 0));
  }

  function commitDrag(targetLane?: SourceLane) {
    const activeDragState = dragStateRef.current;
    let latestLayout = draftLayoutRef.current ?? draftLayout;
    if (!activeDragState || !latestLayout) {
      resetDrag();
      return;
    }
    if (targetLane && !latestLayout[targetLane].includes(activeDragState.source)) {
      latestLayout = moveInLayout(latestLayout, activeDragState.source, targetLane, latestLayout[targetLane].length);
    }
    const latestOrder = [...latestLayout.selected, ...latestLayout.unselected];
    const latestEnabledCount = latestLayout.selected.length;
    if (
      !sameSources([...baseLayout.selected, ...baseLayout.unselected], latestOrder) ||
      baseLayout.selected.length !== latestEnabledCount
    ) {
      onChange(latestOrder, latestEnabledCount);
    }
    resetDrag();
  }

  function previewPointerMove(clientX: number, clientY: number) {
    const target = dragTargetAtPoint(clientX, clientY);
    if (!target) return;
    lastDragTargetRef.current = target;
    if (target.source) {
      previewMoveToSource(target.lane, target.source, target.insertAfter === true);
      return;
    }
    previewMove(target.lane, (draftLayoutRef.current ?? layout)[target.lane].length);
  }

  function commitPointerDrag(clientX: number, clientY: number) {
    const target = dragTargetAtPoint(clientX, clientY) ?? lastDragTargetRef.current;
    commitDrag(target?.lane);
  }

  previewPointerMoveRef.current = previewPointerMove;
  commitPointerDragRef.current = commitPointerDrag;

  function resetDrag() {
    dragStateRef.current = null;
    lastDragTargetRef.current = null;
    setDragState(null);
    draftLayoutRef.current = null;
    setDraftLayout(null);
  }

  useEffect(() => {
    if (!dragState) return;
    const handlePointerMove = (event: PointerEvent) => previewPointerMoveRef.current(event.clientX, event.clientY);
    const handlePointerUp = (event: PointerEvent) => commitPointerDragRef.current(event.clientX, event.clientY);
    const handleMouseUp = (event: MouseEvent) => commitPointerDragRef.current(event.clientX, event.clientY);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", resetDrag);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", resetDrag);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState]);

  return (
    <div className="catalog-source-picker" aria-label="Mod 数据源">
      <SourceLaneView
        disabled={disabled}
        dragState={dragState}
        label="启用"
        lane="selected"
        sources={layout.selected}
        onCommitDrag={commitDrag}
        onPointerMove={previewPointerMove}
        onPointerUp={commitPointerDrag}
        onResetDrag={resetDrag}
        onStartDrag={startDrag}
      />
      <div className="catalog-source-divider" aria-hidden="true" />
      <SourceLaneView
        disabled={disabled}
        dragState={dragState}
        label="禁用"
        lane="unselected"
        sources={layout.unselected}
        onCommitDrag={commitDrag}
        onPointerMove={previewPointerMove}
        onPointerUp={commitPointerDrag}
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
  onPointerMove,
  onPointerUp,
  onResetDrag,
  onStartDrag
}: {
  disabled?: boolean;
  dragState: DragState | null;
  label: string;
  lane: SourceLane;
  sources: ModCatalogSourceKind[];
  onCommitDrag: (targetLane?: SourceLane) => void;
  onPointerMove: (clientX: number, clientY: number) => void;
  onPointerUp: (clientX: number, clientY: number) => void;
  onResetDrag: () => void;
  onStartDrag: (source: ModCatalogSourceKind, from: SourceLane) => void;
}) {
  return (
    <div
      className={`catalog-source-lane ${lane}${sources.length ? "" : " empty"}`}
      data-source-lane={lane}
      aria-label={`${label}数据源`}
      onPointerMove={(event) => {
        if (!disabled && dragState) {
          event.preventDefault();
          onPointerMove(event.clientX, event.clientY);
        }
      }}
      onPointerUp={(event) => {
        if (!disabled && dragState) {
          event.preventDefault();
          onPointerUp(event.clientX, event.clientY);
        }
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
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
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
  onPointerMove,
  onPointerUp,
  onResetDrag,
  onStartDrag
}: {
  disabled?: boolean;
  dragging: boolean;
  lane: SourceLane;
  source: ModCatalogSourceKind;
  onCommitDrag: (targetLane?: SourceLane) => void;
  onPointerMove: (clientX: number, clientY: number) => void;
  onPointerUp: (clientX: number, clientY: number) => void;
  onResetDrag: () => void;
  onStartDrag: () => void;
}) {
  const option = sourceOption(source);
  return (
    <div
      className={`catalog-source-chip ${lane}${dragging ? " dragging" : ""}${disabled ? " disabled" : ""}`}
      data-source-chip={source}
      data-source-lane={lane}
      onPointerCancel={onResetDrag}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onStartDrag();
      }}
      onPointerMove={(event) => {
        if (dragging) {
          event.preventDefault();
          onPointerMove(event.clientX, event.clientY);
        }
      }}
      onPointerUp={(event) => {
        if (dragging) {
          event.preventDefault();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          onPointerUp(event.clientX, event.clientY);
          return;
        }
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

function dragTargetAtPoint(clientX: number, clientY: number): DragTarget | null {
  const element = document.elementFromPoint(clientX, clientY);
  const laneElement = element?.closest<HTMLElement>("[data-source-lane]");
  const lane = laneElement?.dataset.sourceLane;
  if (!isSourceLane(lane)) return null;
  const chipElement = element?.closest<HTMLElement>("[data-source-chip]");
  const source = chipElement?.dataset.sourceChip;
  if (!chipElement || !isModCatalogSource(source)) return { lane };
  const rect = chipElement.getBoundingClientRect();
  return { insertAfter: clientX > rect.left + rect.width / 2, lane, source };
}

function isSourceLane(value: unknown): value is SourceLane {
  return value === "selected" || value === "unselected";
}

function isModCatalogSource(value: unknown): value is ModCatalogSourceKind {
  return sourceOptions.some((option) => option.value === value);
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
