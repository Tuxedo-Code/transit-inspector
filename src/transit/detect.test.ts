import { describe, expect, it } from "vitest";
import { classifyBody, shouldFetchBody } from "./detect";

const TRANSIT = '["^ ","~:user/id",42]';

describe("classifyBody", () => {
  it("trusts the Transit content type, with parameters", () => {
    expect(classifyBody("application/transit+json", TRANSIT)).toBe("transit");
    expect(classifyBody("application/transit+json; charset=UTF-8", "[1,2]")).toBe("transit");
  });

  it("sniffs Transit served as plain JSON", () => {
    expect(classifyBody("application/json", TRANSIT)).toBe("transit");
    expect(classifyBody("application/json", '["~#set",[1,2]]')).toBe("transit");
    expect(classifyBody("", '  {"~:a":1}')).toBe("transit");
  });

  it("treats JSON without Transit markers as plain JSON", () => {
    expect(classifyBody("application/json", '{"plain":true}')).toBe("json");
    expect(classifyBody("application/vnd.api+json", '{"a":"~not-a-marker"}')).toBe("json");
  });

  it("only sniffs the first few KB", () => {
    const late = `[${'"x",'.repeat(2000)}"~:late"]`;
    expect(classifyBody("application/json", late)).toBe("json");
  });

  it("recognizes non-JSON, empty, binary and msgpack bodies", () => {
    expect(classifyBody("text/plain", "ok")).toBe("text");
    expect(classifyBody("application/json", "")).toBe("empty");
    expect(classifyBody("application/json", null)).toBe("empty");
    expect(classifyBody("application/json", "eyJ9", "base64")).toBe("binary");
    expect(classifyBody("application/transit+msgpack", "gqFh", "base64")).toBe("msgpack");
  });
});

describe("shouldFetchBody", () => {
  it("fetches Transit, JSON-like and unlabeled bodies only", () => {
    expect(shouldFetchBody("application/transit+json")).toBe(true);
    expect(shouldFetchBody("application/json")).toBe(true);
    expect(shouldFetchBody("application/problem+json")).toBe(true);
    expect(shouldFetchBody("")).toBe(true);
    expect(shouldFetchBody("x-unknown")).toBe(true);
    expect(shouldFetchBody("text/html")).toBe(false);
    expect(shouldFetchBody("image/png")).toBe(false);
    expect(shouldFetchBody("application/transit+msgpack")).toBe(false);
  });
});
