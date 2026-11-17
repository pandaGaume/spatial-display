/**
 * Sets the next version of the two packages, which always carry the same one.
 *
 *   node scripts/bump.mjs patch        0.1.0 becomes 0.1.1
 *   node scripts/bump.mjs minor        0.1.0 becomes 0.2.0
 *   node scripts/bump.mjs major        0.1.0 becomes 1.0.0
 *   node scripts/bump.mjs 1.4.2        that very version
 *
 * Add --dry-run to see what would change and write nothing.
 *
 * It writes the version where it is told: in the manifest of each package, in
 * the range the adapter asks of the core, in the lock file, and in the line
 * of AGENTS.md that names it. It commits nothing, tags nothing and pushes
 * nothing: the release itself is the tag, pushed by hand (see README.md).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const r = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const CORE = "@spacexr/spatial-display-core";
const MANIFESTS = ["packages/core/package.json", "packages/babylon/package.json"];
const STEPS = ["major", "minor", "patch"];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [step] = args.filter((arg) => !arg.startsWith("--"));
if (!step) fail(`Which version? One of ${STEPS.join(", ")}, or a version as 1.4.2.`);

/** A file as it is read, and as it is written back: with the line ends it had. */
async function open(path) {
  const text = await readFile(r(path), "utf8");
  return { path, text, eol: text.includes("\r\n") ? "\r\n" : "\n" };
}

const json = (file) => JSON.parse(file.text);
const asJson = (file, value) => `${JSON.stringify(value, null, 2)}\n`.replace(/\n/g, file.eol);

const manifests = await Promise.all(MANIFESTS.map(open));
const versions = [...new Set(manifests.map((file) => json(file).version))];
if (versions.length !== 1) fail(`The packages are not at the same version: ${versions.join(", ")}. Set them by hand first.`);
const current = versions[0];
const next = nextVersion(current, step);

const changes = [];
/** Keeps what a file becomes, when it changes. */
const change = (file, text) => {
  if (text !== file.text) changes.push({ path: file.path, text });
};

for (const file of manifests) {
  const manifest = json(file);
  manifest.version = next;
  // The adapter asks for the core of its own version, or a later one that stays compatible.
  if (manifest.peerDependencies?.[CORE]) manifest.peerDependencies[CORE] = `^${next}`;
  change(file, asJson(file, manifest));
}

// The lock file names the packages of the workspace, with their versions.
const lock = await open("package-lock.json");
const locked = json(lock);
for (const path of MANIFESTS) {
  const entry = locked.packages?.[path.replace("/package.json", "")];
  if (!entry) continue;
  entry.version = next;
  if (entry.peerDependencies?.[CORE]) entry.peerDependencies[CORE] = `^${next}`;
}
change(lock, asJson(lock, locked));

// AGENTS.md tells an agent which version to expect on npm.
const guide = await open("AGENTS.md");
change(guide, guide.text.replace(/(Both are at version )\d+\.\d+\.\d+/, `$1${next}`));

console.log(`${current} -> ${next}${dryRun ? " (dry run: nothing is written)" : ""}`);
for (const { path, text } of changes) {
  if (!dryRun) await writeFile(r(path), text);
  console.log(`  ${path}`);
}
if (!dryRun) {
  console.log(`\nNext, when the release is ready:\n  git commit -am "Release ${next}"\n  git tag v${next}\n  git push origin main\n  git push origin v${next}`);
}

/** The version that follows `from` by a step, or `to` itself when it is a version. */
function nextVersion(from, to) {
  const parse = (version) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match) fail(`"${version}" is not a version as 1.4.2.`);
    return match.slice(1).map(Number);
  };
  const [major, minor, patch] = parse(from);
  if (to === "major") return `${major + 1}.0.0`;
  if (to === "minor") return `${major}.${minor + 1}.0`;
  if (to === "patch") return `${major}.${minor}.${patch + 1}`;
  const given = parse(to);
  // A version never goes back: npm refuses one it already has, and a tag is not moved.
  const [a, b, c] = given;
  const later = a > major || (a === major && (b > minor || (b === minor && c > patch)));
  if (!later) fail(`${to} does not come after ${from}.`);
  return given.join(".");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
