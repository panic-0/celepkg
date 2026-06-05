import { describe, expect, it } from "vitest";
import { emptyLoadingState, nextLoadingState } from "./loadingState";

describe("nextLoadingState", () => {
  it("keeps loading active until overlapping operations finish", () => {
    const firstStarted = nextLoadingState(emptyLoadingState, true, "扫描");
    const secondStarted = nextLoadingState(firstStarted, true, "下载");
    const firstFinished = nextLoadingState(secondStarted, false);

    expect(firstFinished).toEqual({
      activeCount: 1,
      loading: true,
      message: "下载"
    });

    expect(nextLoadingState(firstFinished, false)).toEqual(emptyLoadingState);
  });

  it("does not underflow when a stale completion arrives", () => {
    expect(nextLoadingState(emptyLoadingState, false)).toEqual(emptyLoadingState);
  });

  it("keeps the current message when an operation starts without one", () => {
    const firstStarted = nextLoadingState(emptyLoadingState, true, "检查更新");
    const secondStarted = nextLoadingState(firstStarted, true);

    expect(secondStarted.message).toBe("检查更新");
  });
});
