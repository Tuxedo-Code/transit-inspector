import { describe, expect, it } from "vitest";
import { printEdn } from "./print";
import { readEdn } from "./read";

/** Reads EDN and prints it back, so expectations read as EDN. */
function roundTrip(text: string): string {
  const result = readEdn(text);
  if (!result.ok) throw new Error(result.message);
  return printEdn(result.value).text;
}

const fails = (text: string) => expect(readEdn(text).ok, text).toBe(false);

describe("readEdn", () => {
  it("reads scalars", () => {
    expect(readEdn("nil")).toEqual({ ok: true, value: { type: "nil" } });
    expect(readEdn("true")).toEqual({ ok: true, value: { type: "boolean", value: true } });
    expect(readEdn(":user/id")).toEqual({ ok: true, value: { type: "keyword", value: "user/id" } });
    expect(readEdn("my.ns/sym")).toEqual({ ok: true, value: { type: "symbol", value: "my.ns/sym" } });
    expect(readEdn("-")).toEqual({ ok: true, value: { type: "symbol", value: "-" } });
  });

  it("reads numbers, keeping integers exact and floats as written", () => {
    expect(readEdn("123456789012345678901234567890")).toEqual({
      ok: true,
      value: { type: "integer", value: "123456789012345678901234567890" },
    });
    expect(roundTrip("[0 -7 +7 42N -1/3 1.0 -0.0 1.5e10 1.2345678E7 10.00M 3M ##Inf ##-Inf ##NaN]")).toBe(
      "[0 -7 7 42N -1/3 1.0 -0.0 1.5e10 1.2345678E7 10.00M 3M ##Inf ##-Inf ##NaN]",
    );
    expect(roundTrip("[0x1a2B -0xff]")).toBe("[0x1a2B -0xff]");
    for (const bad of ["007", "1x", "0xG", "2r101", "1/0", "1.2.3"]) fails(bad);
  });

  it("reads strings with escapes, and characters", () => {
    // EDN's \u escape, built from parts so the source holds no \u sequence that tools might decode.
    const u = "\\u";
    expect(readEdn(String.raw`"a\"b\\c\n\t\r\b\f${u}00e9"`)).toEqual({
      ok: true,
      value: { type: "string", value: 'a"b\\c\n\t\r\b\fé' },
    });
    expect(roundTrip(String.raw`[\a \( \newline \space \tab ${u}00e9 \é]`)).toBe(
      String.raw`[\a \( \newline \space \tab \é \é]`,
    );
    for (const bad of ['"open', String.raw`"\q"`, String.raw`"\u12"`, String.raw`\nope`, "\\"]) fails(bad);
  });

  it("reads collections, keeping map and set order", () => {
    expect(roundTrip('{:b 1, :a [1 2 (3)], "k" #{:z :y}}')).toBe('{:b 1 :a [1 2 (3)] "k" #{:z :y}}');
    expect(roundTrip("{[1 2] {:nested {}}}")).toBe("{[1 2] {:nested {}}}");
    for (const bad of ["{:a}", "[1 2", "[1 2)", "(1", "}"]) fails(bad);
  });

  it("reads tagged values, with #inst and #uuid as their own types", () => {
    expect(readEdn('#inst "2026-10-09T12:00:00.000-00:00"')).toEqual({
      ok: true,
      value: { type: "inst", value: "2026-10-09T12:00:00.000-00:00" },
    });
    expect(readEdn('#uuid "550e8400-e29b-41d4-a716-446655440000"')).toEqual({
      ok: true,
      value: { type: "uuid", value: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(roundTrip('#error {:cause "boom" :via [{:type clojure.lang.ExceptionInfo}]}')).toBe(
      '#error {:cause "boom" :via [{:type clojure.lang.ExceptionInfo}]}',
    );
    expect(roundTrip('#object[java.time.Instant 0x1a2b "2026-10-09T12:00:00Z"]')).toBe(
      '#object [java.time.Instant 0x1a2b "2026-10-09T12:00:00Z"]',
    );
    expect(roundTrip("#my.app.Rec{:a 1}")).toBe("#my.app.Rec {:a 1}");
    fails("#app/tag");
  });

  it("reads Clojure's namespaced maps", () => {
    expect(roundTrip('#:user{:id 1 :name "Ada" :_/raw 2 :other/x 3 sym 4 "s" 5}')).toBe(
      '{:user/id 1 :user/name "Ada" :raw 2 :other/x 3 user/sym 4 "s" 5}',
    );
    fails("#:user[1]");
  });

  it("skips whitespace, commas, comments and discarded values", () => {
    expect(roundTrip(" ; a comment\n[1, #_ 2 #_#_ 3 4 5 ; trailing\n] ")).toBe("[1 5]");
  });

  it("reads exactly one value", () => {
    for (const bad of ["", "  ", "; only a comment", "1 2", "[1] [2]", "[1]]", "#_ 1"]) fails(bad);
  });

  it("rejects reader syntax that isn't data", () => {
    for (const bad of ['#"regex"', "#'my/var", "@atom", "'quoted", "^:meta {}", "`sym", "::auto", ":", ":ns/"]) {
      fails(bad);
    }
  });

  it("fails instead of throwing on very deep nesting", () => {
    fails("[".repeat(100_000) + "]".repeat(100_000));
  });
});
