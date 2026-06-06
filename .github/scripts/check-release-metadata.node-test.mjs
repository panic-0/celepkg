import test from "node:test";
import assert from "node:assert/strict";
import { assertReleaseMetadata, cargoField } from "./check-release-metadata.mjs";

test("cargo fields read quoted strings and booleans", () => {
  const text = 'version = "0.5.1"\nrepository = "https://github.com/panic-0/celepkg"\npublish = false\n';

  assert.equal(cargoField(text, "version"), "0.5.1");
  assert.equal(cargoField(text, "repository"), "https://github.com/panic-0/celepkg");
  assert.equal(cargoField(text, "publish"), "false");
});

test("release metadata accepts matching versions and repository endpoint", () => {
  assert.doesNotThrow(() =>
    assertReleaseMetadata({
      packageVersion: "0.5.1",
      tauriVersion: "0.5.1",
      cargoVersion: "0.5.1",
      cargoRepository: "https://github.com/panic-0/celepkg",
      cargoPublish: "false",
      updaterEndpoints: ["https://github.com/panic-0/celepkg/releases/latest/download/latest.json"]
    })
  );
});

test("release metadata rejects version mismatch", () => {
  assert.throws(
    () =>
      assertReleaseMetadata({
        packageVersion: "0.5.1",
        tauriVersion: "0.5.2",
        cargoVersion: "0.5.1",
        cargoRepository: "https://github.com/panic-0/celepkg",
        cargoPublish: "false",
        updaterEndpoints: ["https://github.com/panic-0/celepkg/releases/latest/download/latest.json"]
      }),
    /Version mismatch/
  );
});
