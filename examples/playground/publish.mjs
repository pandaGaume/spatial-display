/**
 * Saves an example as a snippet of the Babylon.js Playground, as its Save
 * button does, and prints the address of the snippet.
 *
 *   node examples/playground/publish.mjs xray            a new snippet
 *   node examples/playground/publish.mjs xray ABC123     a new revision of the snippet ABC123
 *
 * The examples are xray and xray360. A snippet holds two files: index.js,
 * the code of the example (examples/playground/<example>.js), and
 * spatial-display.js, the library as bundle.mjs builds it. Run bundle.mjs
 * first.
 *
 * A snippet is public, and stays: publish when the example is ready.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const r = (path) => fileURLToPath(new URL(path, import.meta.url));

const SNIPPET_SERVER = "https://snippet.babylonjs.com";

/** What the Playground shows of each snippet. */
const EXAMPLES = {
  xray: {
    name: "spatial-display: an x-ray screen, in one scene",
    description: "A portal that is a window onto its own scene: it shows what stands behind it as a wireframe, with the meshes of a layer the camera of the scene does not draw.",
    tags: "portal, render target, layers, wireframe",
  },
  xray360: {
    name: "spatial-display: an x-ray all around an object",
    description: "A ring whose wall shows, from every side, the machine it surrounds as a wireframe, with the parts inside its hull. The same lens on a polygon that is not flat, and on a sphere.",
    tags: "portal, render target, layers, wireframe, cylinder",
  },
};

const example = process.argv[2] ?? "";
const about = EXAMPLES[example];
if (!about) throw new Error(`Which example? One of: ${Object.keys(EXAMPLES).join(", ")}.`);
const snippet = (process.argv[3] ?? "").replace(/#.*$/, "");

// What the Playground calls a manifest: its files, and the one it starts from.
const manifest = {
  v: 2,
  language: "JS",
  entry: "index.js",
  imports: {},
  files: {
    "index.js": await readFile(r(`${example}.js`), "utf8"),
    "spatial-display.js": await readFile(r("out/spatial-display.js"), "utf8"),
  },
};
const code = JSON.stringify(manifest);
// The Playground adds the bytes of the manifest when some of its characters take more than one.
const bytes = new TextEncoder().encode(code);
const plain = bytes.length === code.length && bytes.every((byte) => byte < 128);

const body = JSON.stringify({
  payload: JSON.stringify({ code, ...(plain ? {} : { unicode: Buffer.from(bytes).toString("base64") }), engine: "WebGL2", version: 2 }),
  ...about,
});

const response = await fetch(snippet ? `${SNIPPET_SERVER}/${snippet}` : SNIPPET_SERVER, { method: "POST", headers: { "Content-Type": "application/json" }, body });
if (!response.ok) throw new Error(`The snippet was not saved: ${response.status} ${response.statusText}`);
const saved = await response.json();
console.log(`https://playground.babylonjs.com/#${saved.id}#${saved.version}`);
