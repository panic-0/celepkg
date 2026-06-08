export type ProfileDraftSnapshot = {
  enabledExplicitModIds: string[];
  enabledMapIds: string[];
  enabledMapModIds: string[];
  launchArgs: string;
};

export type ProfileDraftHistory = {
  canRedo: () => boolean;
  canUndo: () => boolean;
  push: (snapshot: ProfileDraftSnapshot) => void;
  redo: (current: ProfileDraftSnapshot) => ProfileDraftSnapshot | null;
  reset: () => void;
  undo: (current: ProfileDraftSnapshot) => ProfileDraftSnapshot | null;
};

const DEFAULT_HISTORY_LIMIT = 100;

export function createProfileDraftHistory(limit = DEFAULT_HISTORY_LIMIT): ProfileDraftHistory {
  let undoStack: ProfileDraftSnapshot[] = [];
  let redoStack: ProfileDraftSnapshot[] = [];

  return {
    canRedo: () => redoStack.length > 0,
    canUndo: () => undoStack.length > 0,
    push: (snapshot) => {
      const copy = cloneProfileDraftSnapshot(snapshot);
      const previous = undoStack[undoStack.length - 1];
      if (previous && profileDraftSnapshotsEqual(previous, copy)) {
        redoStack = [];
        return;
      }
      undoStack = [...undoStack, copy].slice(-limit);
      redoStack = [];
    },
    redo: (current) => {
      const next = redoStack[redoStack.length - 1];
      if (!next) return null;
      redoStack = redoStack.slice(0, -1);
      undoStack = [...undoStack, cloneProfileDraftSnapshot(current)].slice(-limit);
      return cloneProfileDraftSnapshot(next);
    },
    reset: () => {
      undoStack = [];
      redoStack = [];
    },
    undo: (current) => {
      const previous = undoStack[undoStack.length - 1];
      if (!previous) return null;
      undoStack = undoStack.slice(0, -1);
      redoStack = [...redoStack, cloneProfileDraftSnapshot(current)].slice(-limit);
      return cloneProfileDraftSnapshot(previous);
    }
  };
}

export function cloneProfileDraftSnapshot(snapshot: ProfileDraftSnapshot): ProfileDraftSnapshot {
  return {
    enabledExplicitModIds: [...snapshot.enabledExplicitModIds],
    enabledMapIds: [...snapshot.enabledMapIds],
    enabledMapModIds: [...snapshot.enabledMapModIds],
    launchArgs: snapshot.launchArgs
  };
}

export function profileDraftSnapshotsEqual(left: ProfileDraftSnapshot, right: ProfileDraftSnapshot) {
  return (
    sameStringArray(left.enabledExplicitModIds, right.enabledExplicitModIds) &&
    sameStringArray(left.enabledMapIds, right.enabledMapIds) &&
    sameStringArray(left.enabledMapModIds, right.enabledMapModIds) &&
    left.launchArgs === right.launchArgs
  );
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
