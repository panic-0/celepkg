import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}

export async function main(args) {
  const options = parseArgs(args);
  const assetsDir = requiredOption(options, "--assets");
  const notesFile = requiredOption(options, "--notes");
  const repo = requiredOption(options, "--repo");
  const tag = requiredOption(options, "--tag");
  const outFile = requiredOption(options, "--out");

  const files = await listFiles(assetsDir);
  const notes = await readFile(notesFile, "utf8").catch(() => "");
  const manifest = await generateLatestManifest({ files, notes, repo, tag });

  await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${outFile} with ${Object.keys(manifest.platforms).length} platform entries.`);
}

export async function generateLatestManifest({ files, notes, repo, tag }) {
  assertUniqueReleaseAssetNames(files);

  const platforms = {};
  const fileSet = new Set(files);

  for (const sigFile of files.filter((file) => file.endsWith(".sig"))) {
    const assetFile = sigFile.slice(0, -4);
    if (!fileSet.has(assetFile)) continue;
    const signature = (await readFile(assetFile + ".sig", "utf8")).trim();
    const targets = targetsForAsset(assetFile);
    const url = releaseAssetUrl(repo, tag, path.basename(assetFile));
    for (const target of targets) {
      platforms[target] = { signature, url };
    }
  }

  if (!Object.keys(platforms).length) {
    throw new Error("No signed updater assets were found.");
  }

  return {
    version: tag.replace(/^v/, ""),
    notes: notes.trim(),
    pub_date: new Date().toISOString(),
    platforms
  };
}

function parseArgs(args) {
  const parsed = new Map();
  for (let index = 0; index < args.length; index += 2) {
    parsed.set(args[index], args[index + 1]);
  }
  return parsed;
}

function requiredOption(optionsMap, name) {
  const value = optionsMap.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(fullPath)));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export function releaseAssetUrl(repoName, releaseTag, fileName) {
  return `https://github.com/${repoName}/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(fileName)}`;
}

export function targetsForAsset(file) {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  const arch = archForAsset(normalized);
  const ext = assetExtension(normalized);

  if (normalized.includes("windows")) {
    if (ext === "msi") return [`windows-${arch}-msi`, `windows-${arch}`];
    if (ext === "zip" && normalized.includes("msi")) return [`windows-${arch}-msi`, `windows-${arch}`];
    return [`windows-${arch}-nsis`, `windows-${arch}`];
  }
  if (normalized.includes("linux") || normalized.includes("ubuntu") || normalized.includes("appimage") || ext === "deb" || ext === "rpm") {
    if (normalized.includes("appimage")) return [`linux-${arch}-appimage`, `linux-${arch}`];
    if (ext === "deb") return [`linux-${arch}-deb`, `linux-${arch}`];
    if (ext === "rpm") return [`linux-${arch}-rpm`, `linux-${arch}`];
    return [`linux-${arch}`];
  }
  if (normalized.includes("macos") || normalized.includes("darwin") || ext === "dmg") {
    if (ext === "dmg") return [`darwin-${arch}-dmg`, `darwin-${arch}`];
    return [`darwin-${arch}`, `darwin-${arch}-dmg`];
  }
  return [];
}

export function archForAsset(normalizedFile) {
  if (/(^|[^a-z0-9])(aarch64|arm64)([^a-z0-9]|$)/.test(normalizedFile)) return "aarch64";
  if (/(^|[^a-z0-9])(x86_64|amd64|x64)([^a-z0-9]|$)/.test(normalizedFile)) return "x86_64";

  const ext = assetExtension(normalizedFile);
  if (
    normalizedFile.includes("windows") ||
    normalizedFile.includes("linux") ||
    normalizedFile.includes("ubuntu") ||
    normalizedFile.includes("macos") ||
    normalizedFile.includes("darwin") ||
    ext === "deb" ||
    ext === "rpm" ||
    ext === "dmg"
  ) {
    throw new Error(`Cannot infer updater architecture from asset path: ${normalizedFile}`);
  }

  return "x86_64";
}

export function assetExtension(file) {
  if (file.endsWith(".appimage")) return "appimage";
  if (file.endsWith(".tar.gz")) return "tar.gz";
  return path.extname(file).slice(1);
}

export function assertUniqueReleaseAssetNames(files) {
  const seen = new Map();
  for (const file of files) {
    const name = path.basename(file);
    const previous = seen.get(name);
    if (previous) {
      throw new Error(`Release asset names must be unique: ${name} appears in ${previous} and ${file}`);
    }
    seen.set(name, file);
  }
}
