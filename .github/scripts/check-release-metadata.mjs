import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export async function main() {
  const [packageJson, tauriConfig, cargoToml] = await Promise.all([
    readJson("package.json"),
    readJson("src-tauri/tauri.conf.json"),
    readFile("src-tauri/Cargo.toml", "utf8")
  ]);

  assertReleaseMetadata({
    packageVersion: packageJson.version,
    tauriVersion: tauriConfig.version,
    cargoVersion: cargoField(cargoToml, "version"),
    cargoRepository: cargoField(cargoToml, "repository"),
    cargoPublish: cargoField(cargoToml, "publish"),
    updaterEndpoints: tauriConfig.plugins?.updater?.endpoints ?? []
  });

  console.log(`Release metadata is consistent for v${packageJson.version}.`);
}

export function assertReleaseMetadata({ packageVersion, tauriVersion, cargoVersion, cargoRepository, cargoPublish, updaterEndpoints }) {
  const versions = new Set([packageVersion, tauriVersion, cargoVersion]);
  if (versions.size !== 1) {
    throw new Error(`Version mismatch: package.json=${packageVersion}, tauri.conf.json=${tauriVersion}, Cargo.toml=${cargoVersion}`);
  }

  if (!isSemver(packageVersion)) {
    throw new Error(`Version must use x.y.z format: ${packageVersion}`);
  }

  if (!cargoRepository || !cargoRepository.startsWith("https://github.com/")) {
    throw new Error("Cargo repository must be a GitHub HTTPS URL.");
  }

  if (cargoPublish !== "false") {
    throw new Error("Cargo package must set publish = false.");
  }

  if (!updaterEndpoints.some((endpoint) => endpoint.startsWith(`${cargoRepository}/releases/`))) {
    throw new Error("Updater endpoint must point at the configured Cargo repository releases.");
  }
}

export function cargoField(text, name) {
  const match = text.match(new RegExp(`^${escapeRegex(name)}\\s*=\\s*(.+)$`, "m"));
  if (!match) return "";
  const raw = match[1].trim();
  const quoted = raw.match(/^"(.*)"$/);
  return quoted ? quoted[1] : raw;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+$/.test(value);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
