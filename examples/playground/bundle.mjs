/**
 * Builds the library as one module for the Babylon.js Playground:
 * examples/playground/out/spatial-display.js.
 *
 * The Playground already holds Babylon.js, as the BABYLON global. A package
 * imported there by its name would come from a CDN with a Babylon.js of its
 * own, and two of them do not work together: this build reads every module of
 * Babylon.js the library imports from that global instead. The file it writes
 * is added to a snippet as a second file, next to the code of an example.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, transformWithEsbuild } from "vite";

const r = (path) => fileURLToPath(new URL(path, import.meta.url));

const BABYLON_GLOBAL = "\0babylon-global";

/** Every import of a module of Babylon.js becomes a read of a member of the BABYLON global. */
const babylonFromGlobal = {
  name: "babylon-from-global",
  enforce: "pre",
  resolveId(id) {
    if (id === "@babylonjs/core" || id.startsWith("@babylonjs/core/")) return { id: BABYLON_GLOBAL, syntheticNamedExports: true };
    return null;
  },
  load(id) {
    return id === BABYLON_GLOBAL ? "export default globalThis.BABYLON;" : null;
  },
};

const output = r("out/spatial-display.js");

await build({
  configFile: false,
  root: r("."),
  logLevel: "warn",
  plugins: [babylonFromGlobal],
  // The library is built from its sources: no build of the packages is needed first.
  resolve: { alias: { "@spacexr/spatial-display-core": r("../../packages/core/src/index.ts") } },
  build: {
    lib: { entry: r("../../packages/babylon/src/index.ts"), formats: ["es"], fileName: () => "spatial-display.js" },
    outDir: r("out"),
    emptyOutDir: true,
    minify: "esbuild",
    target: "es2020",
    sourcemap: false,
  },
});

// A build of a library keeps its line breaks and its comments. A snippet is lighter without them: the sources are
// where the code is read.
const { version } = JSON.parse(await readFile(r("../../packages/babylon/package.json"), "utf8"));
const { code } = await transformWithEsbuild(await readFile(output, "utf8"), output, { minifyWhitespace: true, legalComments: "none", target: "es2020" });
const banner = [
  `// spatial-display ${version}, built for the Babylon.js Playground: it reads Babylon.js from the BABYLON global.`,
  "// Sources, documentation and license (Apache-2.0): https://github.com/pandaGaume/spatial-display",
  "// Do not edit: this file is written by examples/playground/bundle.mjs.",
].join("\n");
await writeFile(output, `${banner}\n${code}`);
console.log(`${output}: ${Math.round((banner.length + code.length) / 1024)} kB`);
