import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isValidManifestVersion, manifestWithVersion } from "./manifest";

// Deliberate copies of what docs/spec.md "Privacy" allows: change the spec first, then these.
const ALLOWED_KEYS = ["content_security_policy", "description", "devtools_page", "manifest_version", "name"];
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

describe("source manifest (privacy is binding, see docs/spec.md 'Privacy')", () => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "manifest.json"), "utf8"));

  it("asks for no permissions or capabilities beyond the DevTools panel", () => {
    expect(Object.keys(manifest).sort()).toEqual(ALLOWED_KEYS);
  });

  it("keeps the CSP that blocks network access", () => {
    expect(manifest.content_security_policy).toEqual({ extension_pages: CSP });
  });
});

describe("manifestWithVersion", () => {
  it("sets the version without changing other fields", () => {
    const manifest = { manifest_version: 3, name: "Transit Inspector", devtools_page: "devtools.html" };
    expect(manifestWithVersion(manifest, "1.2.3")).toEqual({ ...manifest, version: "1.2.3" });
  });

  it("overrides a version already present in the source manifest", () => {
    expect(manifestWithVersion({ version: "0.0.1" }, "1.0.0")).toEqual({ version: "1.0.0" });
  });

  it("rejects a version Chrome won't load", () => {
    expect(() => manifestWithVersion({}, "1.0.0-beta.1")).toThrow(/not a valid extension version/);
  });
});

describe("isValidManifestVersion", () => {
  it.each(["0", "0.1.0", "1.2.3.4", "65535.0"])("accepts %s", (version) => {
    expect(isValidManifestVersion(version)).toBe(true);
  });

  it.each(["", "1.0.0-beta.1", "01.2", "1.2.3.4.5", "70000.0", "1..2", "1.2.", "v1.2"])("rejects %j", (version) => {
    expect(isValidManifestVersion(version)).toBe(false);
  });
});
