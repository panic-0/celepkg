import { describe, expect, it } from "vitest";
import { createProfileDraftHistory, type ProfileDraftSnapshot } from "./profileDraftHistory";

describe("profile draft history", () => {
  it("undoes and redoes draft snapshots", () => {
    const history = createProfileDraftHistory();
    const first = snapshot({ enabledMapIds: ["a"] });
    const second = snapshot({ enabledMapIds: ["a", "b"] });

    history.push(first);

    expect(history.undo(second)).toEqual(first);
    expect(history.redo(first)).toEqual(second);
  });

  it("clears redo snapshots after a new edit", () => {
    const history = createProfileDraftHistory();
    const first = snapshot({ enabledMapIds: ["a"] });
    const second = snapshot({ enabledMapIds: ["b"] });
    const third = snapshot({ enabledMapIds: ["c"] });

    history.push(first);
    expect(history.undo(second)).toEqual(first);
    history.push(first);

    expect(history.redo(third)).toBeNull();
  });

  it("does not push duplicate adjacent snapshots", () => {
    const history = createProfileDraftHistory();
    const first = snapshot({ launchArgs: "-debug" });
    const second = snapshot({ launchArgs: "-console" });

    history.push(first);
    history.push(first);

    expect(history.undo(second)).toEqual(first);
    expect(history.undo(first)).toBeNull();
  });

  it("keeps the newest snapshots within the history limit", () => {
    const history = createProfileDraftHistory(2);
    const first = snapshot({ launchArgs: "1" });
    const second = snapshot({ launchArgs: "2" });
    const third = snapshot({ launchArgs: "3" });
    const fourth = snapshot({ launchArgs: "4" });

    history.push(first);
    history.push(second);
    history.push(third);

    expect(history.undo(fourth)).toEqual(third);
    expect(history.undo(third)).toEqual(second);
    expect(history.undo(second)).toBeNull();
  });

  it("resets undo and redo stacks", () => {
    const history = createProfileDraftHistory();
    const first = snapshot({ enabledExplicitModIds: ["mod-a"] });
    const second = snapshot({ enabledExplicitModIds: ["mod-b"] });

    history.push(first);
    expect(history.undo(second)).toEqual(first);
    history.reset();

    expect(history.undo(first)).toBeNull();
    expect(history.redo(first)).toBeNull();
  });
});

function snapshot(overrides: Partial<ProfileDraftSnapshot>): ProfileDraftSnapshot {
  return {
    enabledExplicitModIds: [],
    enabledMapIds: [],
    enabledMapModIds: [],
    launchArgs: "",
    ...overrides
  };
}
