import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite";

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * How an example is served to a headset, with `--mode headset`: to the whole
 * network, and over https, which a headset asks of a page before it lets it
 * in. The certificate is one the developer made for themselves, in
 * `examples/.cert` (see README.md): the browser of the headset warns about it
 * once.
 */
const headset = (): UserConfig["server"] => {
  const key = r("./.cert/key.pem");
  const cert = r("./.cert/cert.pem");
  if (!existsSync(key) || !existsSync(cert)) throw new Error("spatial-display: no certificate in examples/.cert. README.md tells how to make one.");
  return { host: true, https: { key: readFileSync(key), cert: readFileSync(cert) } };
};

/** What the examples share: they run on the sources of the packages, so no build is needed first. */
export const exampleConfig = (port: number) => ({ mode }: { mode: string }): UserConfig => ({
  resolve: {
    alias: {
      "@spacexr/spatial-display-core": r("../packages/core/src/index.ts"),
      "@spacexr/spatial-display-babylon": r("../packages/babylon/src/index.ts"),
    },
  },
  optimizeDeps: {
    // Babylon.js is served as the modules it is made of, not bundled ahead by Vite. Its modules share state, its
    // shader store for one, and its materials import their shaders on demand: once bundled, those late imports
    // come with a second copy of that state, and the materials fail to find the shaders they just loaded. The
    // page asks for more files this way, and loads a little slower.
    exclude: ["@babylonjs/core"],
  },
  server: { port, strictPort: true, ...(mode === "headset" ? headset() : {}) },
});
