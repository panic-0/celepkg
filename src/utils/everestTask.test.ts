import { describe, expect, it } from "vitest";
import type { EverestRelease } from "../types";
import { createEverestInstallTaskDescriptor } from "./everestTask";

function release(version: number): EverestRelease {
  return {
    branch: "stable",
    version,
    date: "2026-01-01",
    commit: "abc123",
    mainFileSize: 1024,
    mainDownload: "https://example.test/everest.zip",
    mirrorDownload: "",
    isNative: false
  };
}

describe("everest task descriptor", () => {
  it("creates a queued Everest install item for a release", () => {
    const descriptor = createEverestInstallTaskDescriptor(release(6123));

    expect(descriptor).toMatchObject({
      id: "everest:stable:6123",
      name: "Everest 1.6123.0",
      kind: "everest",
      status: "queued",
      dependsOn: []
    });
  });
});
