import { useEffect, useState } from "react";
import type { StrawberryDenominator } from "../viewTypes";

export type MapDetailTab = "overview" | "submaps" | "dependencies" | "saves";
export type ModDetailTab = "overview" | "dependencies" | "files";

type UiLayoutState = {
  mapDetailTab: MapDetailTab;
  modDetailTab: ModDetailTab;
  showWarningColumn: boolean;
  strawberryDenominator: StrawberryDenominator;
};

const STORAGE_KEY = "celepkg.ui.layout";
const defaultLayout: UiLayoutState = {
  mapDetailTab: "overview",
  modDetailTab: "overview",
  showWarningColumn: false,
  strawberryDenominator: "visible"
};

export function useUiLayout() {
  const [layout, setLayout] = useState<UiLayoutState>(() => readLayout());

  useEffect(() => {
    writeLayout(layout);
  }, [layout]);

  return {
    ...layout,
    setMapDetailTab: (mapDetailTab: MapDetailTab) => setLayout((current) => ({ ...current, mapDetailTab })),
    setModDetailTab: (modDetailTab: ModDetailTab) => setLayout((current) => ({ ...current, modDetailTab })),
    setShowWarningColumn: (showWarningColumn: boolean) => setLayout((current) => ({ ...current, showWarningColumn })),
    setStrawberryDenominator: (strawberryDenominator: StrawberryDenominator) =>
      setLayout((current) => ({ ...current, strawberryDenominator }))
  };
}

function readLayout(): UiLayoutState {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return defaultLayout;
    const value = JSON.parse(text) as Partial<UiLayoutState>;
    return {
      mapDetailTab: isMapTab(value.mapDetailTab) ? value.mapDetailTab : defaultLayout.mapDetailTab,
      modDetailTab: isModTab(value.modDetailTab) ? value.modDetailTab : defaultLayout.modDetailTab,
      showWarningColumn: value.showWarningColumn === true,
      strawberryDenominator: isStrawberryDenominator(value.strawberryDenominator)
        ? value.strawberryDenominator
        : defaultLayout.strawberryDenominator
    };
  } catch {
    return defaultLayout;
  }
}

function writeLayout(layout: UiLayoutState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Layout preferences are nice to have; ignore storage failures.
  }
}

function isMapTab(value: unknown): value is MapDetailTab {
  return value === "overview" || value === "submaps" || value === "dependencies" || value === "saves";
}

function isModTab(value: unknown): value is ModDetailTab {
  return value === "overview" || value === "dependencies" || value === "files";
}

function isStrawberryDenominator(value: unknown): value is StrawberryDenominator {
  return value === "visible" || value === "total";
}
