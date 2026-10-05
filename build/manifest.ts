import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** Returns the manifest with its version set from package.json, the single version source. */
export function manifestWithVersion(manifest: Record<string, unknown>, version: string): Record<string, unknown> {
  return { ...manifest, version };
}

/** Emits manifest.json into the build output with the package.json version filled in. */
export function manifestPlugin(manifestPath: string, packagePath: string): Plugin {
  return {
    name: "transit-inspector:manifest",
    apply: "build",
    buildStart() {
      this.addWatchFile(manifestPath);
      this.addWatchFile(packagePath);
    },
    generateBundle() {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const { version } = JSON.parse(readFileSync(packagePath, "utf8"));
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(manifestWithVersion(manifest, version), null, 2)}\n`,
      });
    },
  };
}
