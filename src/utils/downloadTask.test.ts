import { describe, expect, it } from "vitest";
import {
  activeDownloadOperationIds,
  createDownloadTask,
  groupDownloadTaskItems,
  markTaskCancelling,
  selectNextInstallItem,
  selectQueuedItemsForDownload,
  skipItemsWithFailedDependencies,
  summarizeDownloadTask,
  type DownloadTaskItem
} from "./downloadTask";

function item(id: string, status: DownloadTaskItem["status"], dependsOn: string[] = []): DownloadTaskItem {
  return {
    id,
    name: id,
    kind: id === "everest" ? "everest" : "mod",
    status,
    dependsOn
  };
}

describe("download task model", () => {
  it("groups items into the five task lists", () => {
    const groups = groupDownloadTaskItems([
      item("queued", "queued"),
      item("downloading", "downloading"),
      item("downloadFailed", "downloadFailed"),
      item("cancelled", "cancelled"),
      item("downloaded", "downloaded"),
      item("waitingInstall", "waitingInstall"),
      item("installing", "installing"),
      item("installed", "installed"),
      item("installFailed", "installFailed"),
      item("skipped", "skipped")
    ]);

    expect(groups.downloading.map((entry) => entry.id)).toEqual(["queued", "downloading"]);
    expect(groups.downloadFailed.map((entry) => entry.id)).toEqual(["downloadFailed", "cancelled"]);
    expect(groups.waitingInstall.map((entry) => entry.id)).toEqual(["downloaded", "waitingInstall", "installing"]);
    expect(groups.installed.map((entry) => entry.id)).toEqual(["installed"]);
    expect(groups.installFailed.map((entry) => entry.id)).toEqual(["installFailed", "skipped"]);
  });

  it("selects queued downloads up to the concurrency limit", () => {
    const active = { ...item("active", "downloading"), operationId: "op-active" };
    const task = createDownloadTask("task", [active, item("next-1", "queued"), item("next-2", "queued"), item("next-3", "queued")], 3);

    expect(selectQueuedItemsForDownload(task).map((entry) => entry.id)).toEqual(["next-1", "next-2"]);
    expect(activeDownloadOperationIds(task)).toEqual(["op-active"]);
  });

  it("installs one downloaded item at a time after dependencies are installed", () => {
    const task = createDownloadTask("task", [item("everest", "downloaded"), item("map", "downloaded", ["everest"])]);

    expect(selectNextInstallItem(task)?.id).toBe("everest");
    expect(selectNextInstallItem({ ...task, items: [{ ...item("everest", "installed") }, item("map", "downloaded", ["everest"])] })?.id).toBe(
      "map"
    );
    expect(selectNextInstallItem({ ...task, items: [item("everest", "installing"), item("map", "downloaded", ["everest"])] })).toBeNull();
  });

  it("cancels queued and waiting items without changing active downloads or installs", () => {
    const task = createDownloadTask("task", [
      { ...item("downloading", "downloading"), operationId: "op-1" },
      item("queued", "queued"),
      item("downloaded", "downloaded"),
      item("installing", "installing"),
      item("installed", "installed")
    ]);

    const cancelling = markTaskCancelling(task);

    expect(cancelling.status).toBe("cancelling");
    expect(activeDownloadOperationIds(cancelling)).toEqual(["op-1"]);
    expect(cancelling.items.map((entry) => [entry.id, entry.status])).toEqual([
      ["downloading", "downloading"],
      ["queued", "cancelled"],
      ["downloaded", "cancelled"],
      ["installing", "installing"],
      ["installed", "installed"]
    ]);
    expect(selectQueuedItemsForDownload(cancelling)).toEqual([]);
    expect(selectNextInstallItem(cancelling)).toBeNull();
  });

  it("skips targets whose dependencies failed", () => {
    const task = createDownloadTask("task", [item("helper", "installFailed"), item("map", "downloaded", ["helper"])]);
    const skipped = skipItemsWithFailedDependencies(task);

    expect(skipped.items.find((entry) => entry.id === "map")?.status).toBe("skipped");
    expect(summarizeDownloadTask(skipped)).toEqual({
      downloading: 0,
      downloadFailed: 0,
      waitingInstall: 0,
      installed: 0,
      installFailed: 2
    });
  });
});
