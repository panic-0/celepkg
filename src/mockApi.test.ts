import { describe, expect, it } from "vitest";
import { mockApi } from "./mockApi";

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
});
