import { describe, expect, it } from "vitest";
import { gameRunningNoticeForTransition, shouldWatchGameLaunch, watchGameLaunch, type GameLaunchWatchOptions } from "./gameStatusWatcher";

describe("game status watcher", () => {
  it("keeps polling until a delayed launch becomes visible", async () => {
    const statuses = [{ running: false }, { running: false }, { running: true }];
    let statusIndex = 0;

    const outcome = await watchGameLaunch({
      getStatus: async () => statuses[statusIndex++] ?? { running: true },
      ...instantClock()
    });

    expect(outcome).toBe("running");
    expect(statusIndex).toBe(3);
  });

  it("times out when the game process never appears", async () => {
    const clock = instantClock();
    let checks = 0;

    const outcome = await watchGameLaunch({
      getStatus: async () => {
        checks += 1;
        return { running: false };
      },
      pollIntervalMs: 1000,
      timeoutMs: 2500,
      ...clock
    });

    expect(outcome).toBe("timeout");
    expect(checks).toBe(4);
  });

  it("uses background transitions for manual launch notices", () => {
    expect(gameRunningNoticeForTransition(false, true, "background", false)).toBe("detected");
    expect(gameRunningNoticeForTransition(true, true, "background", false)).toBeNull();
    expect(gameRunningNoticeForTransition(false, true, "background", true)).toBe("launch");
    expect(gameRunningNoticeForTransition(false, true, "initial", false)).toBeNull();
  });

  it("only starts launch watching after a successful launch result", () => {
    expect(shouldWatchGameLaunch({ launched: true })).toBe(true);
    expect(shouldWatchGameLaunch({ launched: false })).toBe(false);
    expect(shouldWatchGameLaunch(null)).toBe(false);
  });
});

function instantClock(): Pick<Required<GameLaunchWatchOptions<{ running: boolean }>>, "now" | "sleep"> {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
      return "completed";
    }
  };
}
