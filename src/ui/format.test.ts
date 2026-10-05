import { describe, expect, it } from "vitest";
import { formatSize, formatTime, matchesFilter, requestName } from "./format";

describe("requestName", () => {
  it("shows the last path segment plus query string", () => {
    expect(requestName("https://app.test/api/orders?status=open")).toBe("orders?status=open");
    expect(requestName("https://app.test/api/users/42")).toBe("42");
    expect(requestName("https://app.test/api/users/")).toBe("users");
  });

  it("falls back to the host for the root path", () => {
    expect(requestName("https://app.test/")).toBe("app.test");
    expect(requestName("http://localhost:8080/?x=1")).toBe("localhost:8080?x=1");
  });

  it("returns unparseable URLs as they are", () => {
    expect(requestName("not a url")).toBe("not a url");
  });
});

describe("formatSize", () => {
  it.each([
    [0, "0 B"],
    [37, "37 B"],
    [300, "0.3 kB"],
    [12_500, "12.5 kB"],
    [340_000, "340 kB"],
    [1_234_567, "1.2 MB"],
    [250_000_000, "250 MB"],
  ])("%d bytes -> %s", (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});

describe("formatTime", () => {
  it("uses ms below a second and seconds above", () => {
    expect(formatTime(2.4)).toBe("2 ms");
    expect(formatTime(1234)).toBe("1.23 s");
    expect(formatTime(-1)).toBe("");
  });
});

describe("matchesFilter", () => {
  it("matches a case-insensitive substring anywhere in the URL", () => {
    expect(matchesFilter("https://app.test/api/v2/Orders/123?x=1", "orders")).toBe(true);
    expect(matchesFilter("https://app.test/api/v2/orders/123?x=1", "x=1")).toBe(true);
    expect(matchesFilter("https://app.test/api/users", "orders")).toBe(false);
  });

  it("matches everything when the filter is blank", () => {
    expect(matchesFilter("https://app.test/a", "  ")).toBe(true);
  });
});
