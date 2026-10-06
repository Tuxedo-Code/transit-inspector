import { describe, expect, it } from "vitest";
import { isValidManifestVersion, manifestWithVersion } from "./manifest";

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
