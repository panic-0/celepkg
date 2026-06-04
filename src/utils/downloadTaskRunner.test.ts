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

  it("reuses existing dependency items and merges their dependency edges", async () => {
    const installed: string[] = [];
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("target", {
          prepareInstall: async () => [
            baseItem("helper", {
              dependsOn: ["core"],
              install: async () => {
                installed.push("helper");
              }
            }),
            baseItem("core", {
              install: async () => {
                installed.push("core");
              }
            })
          ],
          install: async () => {
            installed.push("target");
          }
        }),
        baseItem("helper", {
          install: async () => {
            installed.push("helper");
          }
        })
      ],
      { concurrencyLimit: 2, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const result = await runner.start();

    expect(installed).toEqual(["core", "helper", "target"]);
    expect(result.items.map((item) => item.id)).toEqual(["target", "helper", "core"]);
    expect(result.items.find((item) => item.id === "helper")?.dependsOn).toEqual(["core"]);
    expect(result.items.map((item) => [item.id, item.status])).toEqual([
      ["target", "installed"],
      ["helper", "installed"],
      ["core", "installed"]
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

  it("skips targets when a dynamically reused dependency fails", async () => {
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("target", {
          prepareInstall: async () => [baseItem("helper")],
          install: async () => {
            throw new Error("target should wait for helper");
          }
        }),
        baseItem("helper", {
          install: async () => {
            throw new Error("helper failed");
          }
        })
      ],
      { concurrencyLimit: 2, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const result = await runner.start();

    expect(result.items.find((item) => item.id === "helper")?.status).toBe("installFailed");
    expect(result.items.find((item) => item.id === "target")?.status).toBe("skipped");
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

  it("pauses downloads without failing queued or active items and resumes later", async () => {
    const first = deferred<ReturnType<typeof staged>>();
    const cancelledOperations: string[] = [];
    const started: string[] = [];
    let modOneAttempts = 0;
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("mod-1", {
          download: async () => {
            modOneAttempts += 1;
            started.push("mod-1");
            if (modOneAttempts > 1) return staged("mod-1");
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
    await runner.pauseDownloads();
    first.reject(new Error("cancelled"));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(cancelledOperations).toEqual(["op-mod-1"]);
    expect(runner.snapshot().downloadPaused).toBe(true);
    expect(runner.snapshot().items.map((item) => [item.id, item.status])).toEqual([
      ["mod-1", "queued"],
      ["mod-2", "queued"]
    ]);

    runner.resumeDownloads();
    const result = await done;

    expect(result.status).toBe("done");
    expect(started).toEqual(["mod-1", "mod-1", "mod-2"]);
  });

  it("resumes downloads cleanly when the cancelled operation settles after resume", async () => {
    const first = deferred<ReturnType<typeof staged>>();
    const started: string[] = [];
    let modOneAttempts = 0;
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("mod-1", {
          download: async () => {
            modOneAttempts += 1;
            started.push(`mod-1:${modOneAttempts}`);
            if (modOneAttempts > 1) return staged("mod-1");
            return await first.promise;
          }
        })
      ],
      { concurrencyLimit: 1, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const done = runner.start();
    await Promise.resolve();
    await runner.pauseDownloads();
    runner.resumeDownloads();
    first.reject(new Error("cancelled"));
    const result = await done;

    expect(result.status).toBe("done");
    expect(started).toEqual(["mod-1:1", "mod-1:2"]);
  });

  it("pauses installs while allowing downloaded items to wait for install", async () => {
    const installed: string[] = [];
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("mod-1", {
          install: async () => {
            installed.push("mod-1");
          }
        })
      ],
      { concurrencyLimit: 1, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const done = runner.start();
    runner.pauseInstalls();
    await Promise.resolve();
    await Promise.resolve();

    expect(runner.snapshot().installPaused).toBe(true);
    expect(runner.snapshot().items[0].status).toBe("downloaded");
    expect(installed).toEqual([]);

    runner.resumeInstalls();
    const result = await done;

    expect(result.status).toBe("done");
    expect(installed).toEqual(["mod-1"]);
  });

  it("cancels current downloads into the failure list without pausing future downloads", async () => {
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
    await runner.cancelPendingDownloads();
    first.reject(new Error("cancelled"));
    const result = await done;

    expect(cancelledOperations).toEqual(["op-mod-1"]);
    expect(runner.snapshot().downloadPaused).toBe(false);
    expect(started).toEqual(["mod-1"]);
    expect(result.status).toBe("cancelled");
    expect(result.items.map((item) => [item.id, item.status, item.error])).toEqual([
      ["mod-1", "cancelled", "已取消下载"],
      ["mod-2", "cancelled", "已取消下载"]
    ]);
  });

  it("cancels current install queue without pausing future installs", async () => {
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
      { concurrencyLimit: 1, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const done = runner.start();
    runner.pauseInstalls();
    await Promise.resolve();
    await Promise.resolve();
    runner.cancelPendingInstalls();
    runner.resumeInstalls();
    const result = await done;

    expect(runner.snapshot().installPaused).toBe(false);
    expect(installed).toEqual([]);
    expect(result.status).toBe("failed");
    expect(result.items.map((item) => [item.id, item.status, item.error])).toEqual([["target", "installFailed", "已取消安装"]]);
  });

  it("retries failed installs while the task is still running but paused", async () => {
    const installed: string[] = [];
    let installAttempts = 0;
    const runnerRef: { current?: DownloadTaskRunner } = {};
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("flaky", {
          install: async () => {
            installAttempts += 1;
            if (installAttempts === 1) {
              runnerRef.current?.pauseInstalls();
              throw new Error("install failed");
            }
            installed.push("flaky");
          }
        }),
        baseItem("later", {
          install: async () => {
            installed.push("later");
          }
        })
      ],
      { concurrencyLimit: 2, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );
    runnerRef.current = runner;

    const done = runner.start();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    expect(runner.snapshot().status).toBe("running");
    expect(runner.snapshot().installPaused).toBe(true);
    expect(runner.snapshot().items.map((item) => [item.id, item.status])).toEqual([
      ["flaky", "installFailed"],
      ["later", "downloaded"]
    ]);

    const retried = await runner.retryFailed();
    expect(retried.status).toBe("running");
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    expect(runner.snapshot().items.find((item) => item.id === "flaky")?.status).toBe("downloaded");

    runner.resumeInstalls();
    const result = await done;

    expect(result.status).toBe("done");
    expect(installed).toEqual(["flaky", "later"]);
  });

  it("retries failed items without reinstalling successful items", async () => {
    let failingDownloadAttempts = 0;
    let installedSuccessCount = 0;
    const installed: string[] = [];
    const runner = new DownloadTaskRunner(
      "task",
      [
        baseItem("success", {
          install: async () => {
            installedSuccessCount += 1;
            installed.push("success");
          }
        }),
        baseItem("flaky", {
          download: async () => {
            failingDownloadAttempts += 1;
            if (failingDownloadAttempts === 1) throw new Error("network failed");
            return staged("flaky");
          },
          install: async () => {
            installed.push("flaky");
          }
        })
      ],
      { concurrencyLimit: 2, createOperationId: (item) => `op-${item.id}`, cancelOperation: async () => undefined }
    );

    const failed = await runner.start();
    expect(failed.status).toBe("failed");
    expect(failed.items.find((item) => item.id === "flaky")?.status).toBe("downloadFailed");

    const retried = await runner.retryFailed();

    expect(retried.status).toBe("done");
    expect(installedSuccessCount).toBe(1);
    expect(installed).toEqual(["success", "flaky"]);
    expect(retried.items.map((item) => [item.id, item.status])).toEqual([
      ["success", "installed"],
      ["flaky", "installed"]
    ]);
  });
});
