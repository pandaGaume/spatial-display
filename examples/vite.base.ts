import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin, UserConfig } from "vite";

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

/**
 * Writes to the terminal what a page tells of the headset it runs in (see
 * `xr.ts`): its cadence, the size of its images, what goes wrong. A headset
 * has no console to look at.
 */
const headsetLog = (): Plugin => ({
  name: "spatial-display:headset-log",
  configureServer(server) {
    server.middlewares.use("/__headset", (request, response) => {
      let told = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        if (told.length < 4096) told += chunk;
      });
      request.on("end", () => {
        // Anything on the network can write here: only what prints is let through to the terminal.
        const text = told.slice(0, 4096).replace(/[^\x20-\x7e -￿]/g, "?");
        console.log(`[headset ${new Date().toLocaleTimeString("en-GB")}] ${text}`);
        response.statusCode = 204;
        response.end();
      });
    });
  },
});

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
  plugins: mode === "headset" ? [headsetLog()] : [],
  server: { port, strictPort: true, ...(mode === "headset" ? headset() : {}) },
});
