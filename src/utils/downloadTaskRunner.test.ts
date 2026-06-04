import { describe, expect, it } from "vitest";
import { DownloadTaskRunner, type ExecutableDownloadTaskItem } from "./downloadTaskRunner";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function staged(id: string) {
  return { stagedId: `${id}.download`, name: id, kind: id === "everest" ? ("everest" as const) : ("mod" as const), size: 1, hash: null };
}

function baseItem(id: string, partial: Partial<ExecutableDownloadTaskItem> = {}): ExecutableDownloadTaskItem {
  return {
    id,
    name: id,
    kind: id === "everest" ? "everest" : "mod",
    status: "queued",
    download: async () => staged(id),
    install: async () => undefined,
    ...partial
  };
}

describe("download task runner", () => {
  it("starts downloads up to the concurrency limit", async () => {
    const downloads = [deferred<ReturnType<typeof staged>>(), deferred<ReturnType<typeof staged>>(), deferred<ReturnType<typeof staged>>()];
    const started: string[] = [];
    const runner = new DownloadTaskRunner(
      "task",
      downloads.map((download, index) =>
        baseItem(`mod-${index + 1}`, {
          download: async () => {
            started.push(`mod-${index + 1}`);
            return await download.promise;
          }
        })
      ),
      { concurrencyLimit: 2, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const done = runner.start();
    await Promise.resolve();
    expect(started).toEqual(["mod-1", "mod-2"]);

    downloads[0].resolve(staged("mod-1"));
    downloads[1].resolve(staged("mod-2"));
    downloads[2].resolve(staged("mod-3"));
    await done;

    expect(started).toEqual(["mod-1", "mod-2", "mod-3"]);
  });

  it("installs downloaded items serially", async () => {
    let activeInstalls = 0;
    let maxActiveInstalls = 0;
    const installOrder: string[] = [];
    const runner = new DownloadTaskRunner(
      "task",
      ["mod-1", "mod-2", "mod-3"].map((id) =>
        baseItem(id, {
          install: async () => {
            activeInstalls += 1;
            maxActiveInstalls = Math.max(maxActiveInstalls, activeInstalls);
            installOrder.push(id);
            await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
            activeInstalls -= 1;
          }
        })
      ),
      { concurrencyLimit: 3, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const result = await runner.start();

    expect(maxActiveInstalls).toBe(1);
    expect(installOrder).toEqual(["mod-1", "mod-2", "mod-3"]);
    expect(result.status).toBe("done");
  });

  it("adds dependencies during install preparation before installing the target", async () => {
    const installed: string[] = [];
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("target", {
          prepareInstall: async () => [
            baseItem("helper", {
              install: async () => {
                installed.push("helper");
              }
            })
          ],
          install: async () => {
            installed.push("target");
          }
        })
      ],
      { concurrencyLimit: 2, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const result = await runner.start();

    expect(installed).toEqual(["helper", "target"]);
    expect(result.items.map((item) => [item.id, item.status])).toEqual([
      ["target", "installed"],
      ["helper", "installed"]
    ]);
  });

  it("skips targets when a dependency install fails", async () => {
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("helper", {
          install: async () => {
            throw new Error("helper failed");
          }
        }),
        baseItem("map", { dependsOn: ["helper"] })
      ],
      { concurrencyLimit: 2, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const result = await runner.start();

    expect(result.items.find((item) => item.id === "helper")?.status).toBe("installFailed");
    expect(result.items.find((item) => item.id === "map")?.status).toBe("skipped");
    expect(result.status).toBe("failed");
  });

  it("cancels active downloads and does not start queued downloads", async () => {
    const first = deferred<ReturnType<typeof staged>>();
    const cancelledOperations: string[] = [];
    const started: string[] = [];
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("mod-1", {
          download: async () => {
            started.push("mod-1");
            return await first.promise;
          }
        }),
        baseItem("mod-2", {
          download: async () => {
            started.push("mod-2");
            return staged("mod-2");
          }
        })
      ],
      {
        concurrencyLimit: 1,
        createOperationId: (item) => `op-${item.id}`,
        cancelOperation: async (operationId) => {
          cancelledOperations.push(operationId);
        }
      }
    );

    const done = runner.start();
    await Promise.resolve();
    await runner.cancel();
    first.reject(new Error("cancelled"));
    const result = await done;

    expect(cancelledOperations).toEqual(["op-mod-1"]);
    expect(started).toEqual(["mod-1"]);
    expect(result.items.map((item) => [item.id, item.status])).toEqual([
      ["mod-1", "cancelled"],
      ["mod-2", "cancelled"]
    ]);
    expect(result.status).toBe("cancelled");
  });
});
