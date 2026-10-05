import { describe, expect, it } from "vitest";
import { manifestWithVersion } from "./manifest";

describe("manifestWithVersion", () => {
  it("sets the version without changing other fields", () => {
    const manifest = { manifest_version: 3, name: "Transit Debugger", devtools_page: "devtools.html" };
    expect(manifestWithVersion(manifest, "1.2.3")).toEqual({ ...manifest, version: "1.2.3" });
  });

  it("overrides a version already present in the source manifest", () => {
    expect(manifestWithVersion({ version: "0.0.1" }, "1.0.0")).toEqual({ version: "1.0.0" });
  });
});
