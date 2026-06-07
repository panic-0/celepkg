import { describe, expect, it } from "vitest";
import { delayNextMockGameLaunchStatusChecks, mockApi, setMockGameRunningForTests } from "./mockApi";
import { buildLocalDependencyTree } from "./utils/dependencyTree";

describe("mock staged downloads", () => {
  it("persists the app update startup setting in mock config", async () => {
    const disabled = await mockApi.setAutoCheckAppUpdatesOnStartup(false);
    expect(disabled.autoCheckAppUpdatesOnStartup).toBe(false);

    const enabled = await mockApi.setAutoCheckAppUpdatesOnStartup(true);
    expect(enabled.autoCheckAppUpdatesOnStartup).toBe(true);
  });

  it("tracks mock game running status across launch and stop", async () => {
    await mockApi.stopGame("D:\\Games\\Celeste");
    await expect(mockApi.getGameStatus("D:\\Games\\Celeste")).resolves.toMatchObject({ running: false, stopped: false });

    await mockApi.launchGame("D:\\Games\\Celeste", "-debug");
    await expect(mockApi.getGameStatus("D:\\Games\\Celeste")).resolves.toMatchObject({ running: true, stopped: false, pid: 1234 });

    await expect(mockApi.stopGame("D:\\Games\\Celeste")).resolves.toMatchObject({ running: false, stopped: true, pid: null });
  });

  it("can delay mock game running status after launch", async () => {
    setMockGameRunningForTests(false);
    delayNextMockGameLaunchStatusChecks(2);

    await mockApi.launchGame("D:\\Games\\Celeste", "-debug");

    await expect(mockApi.getGameStatus("D:\\Games\\Celeste")).resolves.toMatchObject({ running: false, pid: null });
    await expect(mockApi.getGameStatus("D:\\Games\\Celeste")).resolves.toMatchObject({ running: false, pid: null });
    await expect(mockApi.getGameStatus("D:\\Games\\Celeste")).resolves.toMatchObject({ running: true, pid: 1234 });
  });

  it("downloads and installs a staged mod once", async () => {
    const result = await mockApi.searchModCatalog("Aqua Shrine", ["wegfan"]);
    const entry = result.entries.find((item) => item.name === "Aqua Shrine");
    expect(entry).toBeTruthy();

    const staged = await mockApi.downloadModToStaging("D:\\Games\\Celeste", entry!, "mock-stage-mod");
    expect(staged.kind).toBe("mod");
    expect(staged.name).toBe("Aqua Shrine");

    const installed = await mockApi.installStagedMod("D:\\Games\\Celeste", staged.stagedId, entry!);
    expect(installed.scan.maps.some((item) => item.name === "Aqua Shrine")).toBe(true);
    await expect(mockApi.installStagedMod("D:\\Games\\Celeste", staged.stagedId, entry!)).rejects.toThrow("staged");
  });

  it("exposes a mock mod that fails during install", async () => {
    const result = await mockApi.searchModCatalog("Mock Install Failure", ["everestMirror"]);
    const entry = result.entries.find((item) => item.name === "Mock Install Failure");
    expect(entry).toBeTruthy();

    const staged = await mockApi.downloadModToStaging("D:\\Games\\Celeste", entry!, "mock-install-failure");

    await expect(mockApi.installStagedMod("D:\\Games\\Celeste", staged.stagedId, entry!)).rejects.toThrow(
      "暂存旧 Mod 失败：另一个程序正在使用此文件，进程无法访问。 (os error 32)"
    );
  });

  it("exposes a mock mod that fails during download", async () => {
    const result = await mockApi.searchModCatalog("Mock Download Failure", ["everestMirror"]);
    const entry = result.entries.find((item) => item.name === "Mock Download Failure");
    expect(entry).toBeTruthy();

    await expect(mockApi.downloadModToStaging("D:\\Games\\Celeste", entry!, "mock-download-failure")).rejects.toThrow(
      "下载 Mod 失败：网络连接已中断，无法继续读取远端文件。"
    );
    await expect(mockApi.downloadModToStaging("D:\\Games\\Celeste", entry!, "mock-download-failure-retry")).resolves.toMatchObject({
      kind: "mod",
      name: "Mock Download Failure"
    });
  });

  it("downloads and installs a staged everest release once", async () => {
    const releases = await mockApi.listEverestReleases();
    const release = releases.releases[0];
    const staged = await mockApi.downloadEverestToStaging("D:\\Games\\Celeste", release, "mock-stage-everest");

    expect(staged.kind).toBe("everest");
    expect(staged.name).toBe("Everest");

    const installed = await mockApi.installStagedEverest("D:\\Games\\Celeste", staged.stagedId, release);
    expect(installed.scan.otherMods.some((item) => item.name === "EverestCore" && item.metadata.version === `1.${release.version}.0`)).toBe(
      true
    );
    await expect(mockApi.installStagedEverest("D:\\Games\\Celeste", staged.stagedId, release)).rejects.toThrow("staged");
  });

  it("includes a catalog entry that requires a newer Everest build", async () => {
    const result = await mockApi.searchModCatalog("Everest Gate", ["everestMirror"]);
    const entry = result.entries.find((item) => item.name === "Everest Gate");
    expect(entry).toBeTruthy();

    const metadata = await mockApi.previewModUpdateMetadata("D:\\Games\\Celeste", entry!);
    expect(metadata.dependencies).toContainEqual({ name: "EverestCore", version: "1.5033.0" });
    expect(metadata.dependencies).toContainEqual({ name: "CommunalHelper", version: "1.24.0" });
  });

  it("stages and deletes a mod preview download", async () => {
    const result = await mockApi.searchModCatalog("Galactica", ["everestMirror"]);
    const entry = result.entries.find((item) => item.name === "Galactica");
    expect(entry).toBeTruthy();

    const preview = await mockApi.stageModPreview("D:\\Games\\Celeste", entry!, "mock-preview");
    expect(preview.staged.kind).toBe("mod");
    expect(preview.metadata.dependencies).toContainEqual({ name: "CommunalHelper", version: "1.24.0" });
    await expect(mockApi.readStagedModMetadata("D:\\Games\\Celeste", preview.staged.stagedId)).resolves.toMatchObject({
      name: "Galactica"
    });
    expect(await mockApi.deleteStagedDownload("D:\\Games\\Celeste", preview.staged.stagedId)).toBe(true);
    await expect(mockApi.readStagedModMetadata("D:\\Games\\Celeste", preview.staged.stagedId)).rejects.toThrow("staged");
    expect(await mockApi.deleteStagedDownload("D:\\Games\\Celeste", preview.staged.stagedId)).toBe(false);
  });

  it("resolves catalog dependencies in a batch", async () => {
    const result = await mockApi.resolveModCatalogDependencies(
      [
        { name: "CommunalHelper", version: "1.0.0" },
        { name: "Missing Helper", version: "" }
      ],
      ["everestMirror", "wegfan"]
    );

    expect(result.resolutions[0].entry?.name).toBe("CommunalHelper");
    expect(result.resolutions[1].entry).toBeNull();
  });

  it("includes local mock mods that exercise dependency tree states", async () => {
    const scan = await mockApi.scanCeleste("D:\\Games\\Celeste");
    const records = [...scan.maps, ...scan.otherMods];
    const root = scan.otherMods.find((item) => item.name === "Mock Dependency Tree Root");
    expect(root).toBeTruthy();

    const tree = buildLocalDependencyTree(root!, records);
    const statuses = new Map(tree.children.map((node) => [node.name, node.status]));

    expect(statuses.get("Mock Dependency Tree Helper")).toBe("installed");
    expect(statuses.get("Mock Dependency Tree Outdated")).toBe("tooLow");
    expect(statuses.get("Mock Dependency Tree Missing")).toBe("missing");
    expect(statuses.get("EverestCore")).toBe("everest");
    expect(statuses.get("Mock Dependency Tree Optional")).toBe("installed");
    expect(
      tree.children.some((node) => node.name === "Mock Dependency Tree Cycle A" && node.children[0]?.children[0]?.status === "cycle")
    ).toBe(true);
  });

  it("uses real local mock mods for update candidates and exposes dependency tree update preview", async () => {
    const result = await mockApi.checkModUpdates("D:\\Games\\Celeste", ["everestMirror", "wegfan"]);
    const updateNames = result.updates.map((item) => item.installed.name);

    expect(updateNames).toContain("Mock Install Failure");
    expect(updateNames).toContain("Mock Download Failure");
    expect(updateNames).toContain("Mock Helper 001");
    expect(updateNames).toContain("Mock Dependency Tree Root");
    expect(updateNames).not.toContain("MockBulkUpdate1");

    const dependencyTreeUpdate = result.updates.find((item) => item.installed.name === "Mock Dependency Tree Root");
    expect(dependencyTreeUpdate?.entry.version).toBe("1.1.0");

    const preview = await mockApi.stageModPreview("D:\\Games\\Celeste", dependencyTreeUpdate!.entry, "mock-tree-update");
    expect(preview.metadata.dependencies).toContainEqual({ name: "Mock Dependency Tree Outdated", version: "2.0.0" });
    expect(preview.metadata.optionalDependencies).toContainEqual({ name: "Mock Dependency Tree Cycle A", version: "1.0.0" });
  });
});
