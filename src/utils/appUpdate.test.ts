import { describe, expect, it } from "vitest";
import {
  appUpdateAvailableState,
  appUpdateDownloadProgressState,
  appUpdateDownloadStartedState,
  appUpdateErrorState,
  appUpdateReadyState,
  appUpdateUnavailableState,
  emptyAppUpdateState
} from "./appUpdate";

describe("app update state", () => {
  it("represents no update with the current version", () => {
    expect(appUpdateUnavailableState("0.5.0")).toMatchObject({
      status: "idle",
      currentVersion: "0.5.0",
      latestVersion: null
    });
  });

  it("represents an available update", () => {
    expect(appUpdateAvailableState({ currentVersion: "0.5.0", version: "0.5.1", body: "notes" })).toMatchObject({
      status: "available",
      currentVersion: "0.5.0",
      latestVersion: "0.5.1",
      notes: "notes"
    });
  });

  it("tracks download progress and ready state", () => {
    const started = appUpdateDownloadStartedState(appUpdateAvailableState({ currentVersion: "0.5.0", version: "0.5.1" }), 100);
    const progressed = appUpdateDownloadProgressState(appUpdateDownloadProgressState(started, 30), 40);
    const ready = appUpdateReadyState(progressed);

    expect(progressed).toMatchObject({ status: "downloading", downloaded: 70, total: 100 });
    expect(ready).toMatchObject({ status: "ready", downloaded: 100, total: 100 });
  });

  it("keeps error messages in state", () => {
    expect(appUpdateErrorState(emptyAppUpdateState, new Error("download failed"))).toMatchObject({
      status: "error",
      error: "download failed"
    });
  });
});
