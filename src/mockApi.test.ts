import { describe, expect, it } from "vitest";
import { mockApi } from "./mockApi";
import { buildLocalDependencyTree } from "./utils/dependencyTree";

describe("mock staged downloads", () => {
  it("persists the app update startup setting in mock config", async () => {
    const disabled = await mockApi.setAutoCheckAppUpdatesOnStartup(false);
    expect(disabled.autoCheckAppUpdatesOnStartup).toBe(false);

    const enabled = await mockApi.setAutoCheckAppUpdatesOnStartup(true);
    expect(enabled.autoCheckAppUpdatesOnStartup).toBe(true);
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
    expect(await mockApi.deleteStagedDownload("D:\\Games\\Celeste", preview.staged.stagedId)).toBe(true);
    expect(await mockApi.deleteStagedDownload("D:\\Games\\Celeste", preview.staged.stagedId)).toBe(false);
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
