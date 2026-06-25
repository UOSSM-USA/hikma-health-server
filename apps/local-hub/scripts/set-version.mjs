#!/usr/bin/env node
// Sets the local-hub version across package.json, tauri.conf.json, Cargo.toml.
// Invoked by the release workflow and runnable locally:
//   node apps/local-hub/scripts/set-version.mjs 2026.5.4
//
// Also stamps an MSI-legal version into tauri.conf.json `bundle.windows.wix.version`.
// Windows Installer caps the major/minor version fields at 255, so a raw CalVer like
// 2026.6.25 (major 2026) is rejected by the WiX bundler. We map it monotonically to
// `(YYYY-2000).M.D[.N]`, which stays within MSI limits (major <= 255 until year 2255)
// and preserves upgrade ordering. The auto-updater still compares the real CalVer from
// latest.json, so this mapping only affects Windows' internal installer version.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "..");

const version = process.argv[2];
if (!version) {
  console.error("Usage: set-version.mjs <version>");
  process.exit(1);
}

// CalVer YYYY.M.D with optional `-N` for multiple-per-day (semver pre-release).
if (!/^\d{4}\.\d{1,2}\.\d{1,2}(-[A-Za-z0-9.]+)?$/.test(version)) {
  console.error(`Bad version "${version}" — expected YYYY.M.D or YYYY.M.D-N`);
  process.exit(1);
}

// Map CalVer YYYY.M.D[-N] → MSI version (YYYY-2000).M.D[.N]. The day-granular
// first three fields drive MSI upgrade detection; a numeric `-N` same-day counter
// goes in the 4th (build) field. Note: Windows Installer ignores the 4th field for
// upgrade comparison, so same-day MSI rebuilds aren't distinctly upgrade-detected —
// acceptable, since same-day re-releases are rare and the day field still advances.
const [, yyyy, mm, dd, pre] = version.match(
  /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(.+))?$/,
);
const msiMajor = Number(yyyy) - 2000;
if (msiMajor < 1 || msiMajor > 255) {
  console.error(
    `Cannot derive MSI version: major field ${msiMajor} (from year ${yyyy}) is out of the 1..255 range.`,
  );
  process.exit(1);
}
const msiBuild = pre && /^\d+$/.test(pre) ? `.${Number(pre)}` : "";
const msiVersion = `${msiMajor}.${Number(mm)}.${Number(dd)}${msiBuild}`;

const setJsonVersion = (relPath, mutate) => {
  const p = resolve(APP_ROOT, relPath);
  const data = JSON.parse(readFileSync(p, "utf8"));
  data.version = version;
  if (mutate) mutate(data);
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
  console.log(`  ${relPath} → ${version}`);
};

setJsonVersion("package.json");
setJsonVersion("src-tauri/tauri.conf.json", (data) => {
  data.bundle ??= {};
  data.bundle.windows ??= {};
  data.bundle.windows.wix ??= {};
  data.bundle.windows.wix.version = msiVersion;
  console.log(`  src-tauri/tauri.conf.json → bundle.windows.wix.version ${msiVersion}`);
});

const cargoPath = resolve(APP_ROOT, "src-tauri/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
const next = cargo.replace(
  /^version\s*=\s*"[^"]+"/m,
  `version = "${version}"`,
);
if (next === cargo) {
  console.error("Failed to update Cargo.toml [package].version");
  process.exit(1);
}
writeFileSync(cargoPath, next);
console.log(`  src-tauri/Cargo.toml → ${version}`);
