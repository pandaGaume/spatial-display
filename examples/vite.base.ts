import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite";

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/** What the examples share: they run on the sources of the packages, so no build is needed first. */
export const exampleConfig = (port: number): UserConfig => ({
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
  server: { port, strictPort: true },
});
