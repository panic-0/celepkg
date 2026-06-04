import { describe, expect, it } from "vitest";
import { mockApi } from "./mockApi";

describe("mock staged downloads", () => {
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
});
