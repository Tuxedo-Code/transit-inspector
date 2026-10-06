import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/**
 * Whether Chrome (and the Web Store) accept `version` in a manifest:
 * 1-4 dot-separated integers from 0 to 65535, without leading zeros or suffixes like `-beta`.
 */
export function isValidManifestVersion(version: string): boolean {
  const parts = version.split(".");
  return parts.length <= 4 && parts.every((part) => /^(0|[1-9]\d{0,4})$/.test(part) && Number(part) <= 65535);
}

/** Returns the manifest with its version set from package.json, the single version source. */
export function manifestWithVersion(manifest: Record<string, unknown>, version: string): Record<string, unknown> {
  if (!isValidManifestVersion(version)) {
    throw new Error(`package.json version "${version}" is not a valid extension version (1-4 integers, e.g. 1.2.3)`);
  }
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
