import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { manifestPlugin } from "./build/manifest.ts";

const root = import.meta.dirname;

export default defineConfig({
  publicDir: false,
  plugins: [manifestPlugin(resolve(root, "manifest.json"), resolve(root, "package.json"))],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    // Loaded from disk by the extension, not over the network: CodeMirror's size is fine.
    chunkSizeWarningLimit: 1000,
    // Bundled dependencies' licenses ship with the extension and the shared zip.
    license: { fileName: "THIRD_PARTY_LICENSES.md" },
    rollupOptions: {
      input: {
        devtools: resolve(root, "devtools.html"),
        panel: resolve(root, "panel.html"),
      },
      onLog(level, log, handler) {
        // transit-js ships Closure's debug loader. Its evals never run, except a feature probe inside try/catch.
        if (log.code === "EVAL" && log.id?.includes("/node_modules/transit-js/")) return;
        handler(level, log);
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "build/**/*.test.ts"],
  },
});
