import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// The example runs on the sources of the packages: no build is needed first.
export default defineConfig({
  resolve: {
    alias: {
      "@spacexr/spatial-display-core": r("../../packages/core/src/index.ts"),
      "@spacexr/spatial-display-babylon": r("../../packages/babylon/src/index.ts"),
    },
  },
  server: { port: 5183, strictPort: true },
});
