import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { ModRecord } from "../types";
import type { SubMapSortKey } from "../utils/subMapSorting";
import { ALL_SUB_MAP_FOLDER, getSubMapRootPath } from "../utils/subMapFolders";

export type MapDetailMemoryState = {
  groupSubMapsByDifficulty: boolean;
  selectedSubMapId: string;
  subMapPath: string;
  subMapQuery: string;
  subMapSearchCurrentLevelOnly: boolean;
  subMapSortDescending: boolean;
  subMapSortKey: SubMapSortKey;
};

export type MapDetailControls = {
  effectiveSubMapPath: string;
  groupSubMapsByDifficulty: boolean;
  selectedSubMapId: string;
  subMapPath: string;
  subMapQuery: string;
  subMapRootPath: string;
  subMapSearchCurrentLevelOnly: boolean;
  subMapSortDescending: boolean;
  subMapSortKey: SubMapSortKey;
  selectSubMap: (id: string) => void;
  updateGroupSubMapsByDifficulty: (value: boolean) => void;
  updateSubMapPath: (value: string) => void;
  updateSubMapQuery: (value: string) => void;
  updateSubMapSearchCurrentLevelOnly: (value: boolean) => void;
  updateSubMapSortDescending: (value: boolean) => void;
  updateSubMapSortKey: (value: SubMapSortKey) => void;
};

export function useMapDetailControls(map: ModRecord | undefined, mapDetailMemory: MutableRefObject<Record<string, MapDetailMemoryState>>) {
  const [selectedSubMapId, setSelectedSubMapId] = useState("");
  const [groupSubMapsByDifficulty, setGroupSubMapsByDifficulty] = useState(true);
  const [subMapPath, setSubMapPath] = useState(ALL_SUB_MAP_FOLDER);
  const [subMapQuery, setSubMapQuery] = useState("");
  const [subMapSearchCurrentLevelOnly, setSubMapSearchCurrentLevelOnly] = useState(false);
  const [subMapSortDescending, setSubMapSortDescending] = useState(false);
  const [subMapSortKey, setSubMapSortKey] = useState<SubMapSortKey>("file");
  const mapId = map?.id ?? "empty";
  const subMapRootPath = useMemo(() => (map ? getSubMapRootPath(map.subMaps) : ALL_SUB_MAP_FOLDER), [map]);
  const effectiveSubMapPath = subMapPath === ALL_SUB_MAP_FOLDER ? subMapRootPath : subMapPath;

  useEffect(() => {
    const saved = mapId === "empty" ? undefined : mapDetailMemory.current[mapId];
    const savedPath = saved?.subMapPath === subMapRootPath ? ALL_SUB_MAP_FOLDER : saved?.subMapPath;
    setGroupSubMapsByDifficulty(saved?.groupSubMapsByDifficulty ?? true);
    setSelectedSubMapId(saved?.selectedSubMapId ?? "");
    setSubMapPath(savedPath ?? ALL_SUB_MAP_FOLDER);
    setSubMapQuery(saved?.subMapQuery ?? "");
    setSubMapSearchCurrentLevelOnly(saved?.subMapSearchCurrentLevelOnly ?? false);
    setSubMapSortDescending(saved?.subMapSortDescending ?? false);
    setSubMapSortKey(saved?.subMapSortKey ?? "file");
  }, [mapId, mapDetailMemory, subMapRootPath]);

  function updateMapDetailMemory(value: Partial<MapDetailMemoryState>) {
    if (!map) return;
    const current = mapDetailMemory.current[map.id] ?? defaultMemoryState();
    mapDetailMemory.current[map.id] = {
      ...current,
      ...value
    };
  }

  function updateSubMapQuery(value: string) {
    setSubMapQuery(value);
    updateMapDetailMemory({ subMapQuery: value });
  }

  function updateSubMapSearchCurrentLevelOnly(value: boolean) {
    setSubMapSearchCurrentLevelOnly(value);
    updateMapDetailMemory({ subMapSearchCurrentLevelOnly: value });
  }

  function updateSubMapPath(value: string) {
    setSubMapPath(value);
    setSelectedSubMapId("");
    updateMapDetailMemory({ selectedSubMapId: "", subMapPath: value });
  }

  function updateSubMapSortKey(value: SubMapSortKey) {
    setSubMapSortKey(value);
    updateMapDetailMemory({ subMapSortKey: value });
  }

  function updateSubMapSortDescending(value: boolean) {
    setSubMapSortDescending(value);
    updateMapDetailMemory({ subMapSortDescending: value });
  }

  function updateGroupSubMapsByDifficulty(value: boolean) {
    setGroupSubMapsByDifficulty(value);
    updateMapDetailMemory({ groupSubMapsByDifficulty: value });
  }

  function selectSubMap(id: string) {
    setSelectedSubMapId(id);
    updateMapDetailMemory({ selectedSubMapId: id });
  }

  return {
    effectiveSubMapPath,
    groupSubMapsByDifficulty,
    selectedSubMapId,
    subMapPath,
    subMapQuery,
    subMapRootPath,
    subMapSearchCurrentLevelOnly,
    subMapSortDescending,
    subMapSortKey,
    selectSubMap,
    updateGroupSubMapsByDifficulty,
    updateSubMapPath,
    updateSubMapQuery,
    updateSubMapSearchCurrentLevelOnly,
    updateSubMapSortDescending,
    updateSubMapSortKey
  };
}

function defaultMemoryState(): MapDetailMemoryState {
  return {
    groupSubMapsByDifficulty: true,
    selectedSubMapId: "",
    subMapPath: ALL_SUB_MAP_FOLDER,
    subMapQuery: "",
    subMapSearchCurrentLevelOnly: false,
    subMapSortDescending: false,
    subMapSortKey: "file"
  };
}
