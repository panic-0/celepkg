import { describe, expect, it } from "vitest";
import { createLatestRequestTracker } from "./latestRequest";

describe("createLatestRequestTracker", () => {
  it("treats only the most recently started request as current", () => {
    const tracker = createLatestRequestTracker();
    const first = tracker.begin();
    const second = tracker.begin();

    expect(tracker.isLatest(first)).toBe(false);
    expect(tracker.isLatest(second)).toBe(true);
  });

  it("invalidates pending requests without starting a replacement task", () => {
    const tracker = createLatestRequestTracker();
    const request = tracker.begin();

    tracker.invalidate();

    expect(tracker.isLatest(request)).toBe(false);
  });
});
