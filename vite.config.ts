import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { manifestPlugin } from "./build/manifest";

const root = import.meta.dirname;

export default defineConfig({
  publicDir: false,
  plugins: [manifestPlugin(resolve(root, "manifest.json"), resolve(root, "package.json"))],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        devtools: resolve(root, "devtools.html"),
        panel: resolve(root, "panel.html"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "build/**/*.test.ts"],
  },
});
