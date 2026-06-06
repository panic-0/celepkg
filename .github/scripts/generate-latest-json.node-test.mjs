import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { generateLatestManifest, targetsForAsset } from "./generate-latest-json.mjs";

test("targets use explicit runner architecture from artifact paths", () => {
  assert.deepEqual(targetsForAsset("release-assets/celepkg-macos-latest-ARM64/CelePkg.app.tar.gz"), [
    "darwin-aarch64",
    "darwin-aarch64-dmg"
  ]);
  assert.deepEqual(targetsForAsset("release-assets/celepkg-windows-latest-X64/CelePkg_0.5.1_x64-setup.exe.zip"), [
    "windows-x86_64-nsis",
    "windows-x86_64"
  ]);
  assert.deepEqual(targetsForAsset("release-assets/celepkg-ubuntu-24.04-X64/CelePkg_0.5.1_amd64.AppImage.tar.gz"), [
    "linux-x86_64-appimage",
    "linux-x86_64"
  ]);
});

test("targets fail when platform is known but architecture is missing", () => {
  assert.throws(() => targetsForAsset("release-assets/celepkg-macos-latest/CelePkg.app.tar.gz"), /Cannot infer updater architecture/);
});

test("manifest rejects duplicate release asset names", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "celepkg-release-"));
  try {
    const firstDir = path.join(root, "celepkg-windows-latest-X64");
    const secondDir = path.join(root, "celepkg-ubuntu-24.04-X64");
    const firstAsset = path.join(firstDir, "CelePkg.zip");
    const secondAsset = path.join(secondDir, "CelePkg.zip");
    await mkdir(firstDir, { recursive: true });
    await mkdir(secondDir, { recursive: true });
    await writeFile(firstAsset, "first");
    await writeFile(firstAsset + ".sig", "sig-first");
    await writeFile(secondAsset, "second");
    await writeFile(secondAsset + ".sig", "sig-second");

    await assert.rejects(
      generateLatestManifest({
        files: [firstAsset, firstAsset + ".sig", secondAsset, secondAsset + ".sig"],
        notes: "notes",
        repo: "panic-0/celepkg",
        tag: "v0.5.1"
      }),
      /Release asset names must be unique/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
