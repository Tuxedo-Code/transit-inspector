import { describe, expect, it } from "vitest";
import type { PathNode } from "../edn/print";
import { chipLabel, formatJson, LONG_STRING, viewString } from "./string-view";

/** A string node as the path index has it. */
const node = (text: string): PathNode => ({ from: 0, to: 0, path: [], children: [], text });

/** The kind of view and the text the viewer shows. */
function shown(text: string): [string, string] {
  const view = viewString(node(text));
  return [view.kind, view.kind === "edn" ? view.printed.text : view.text];
}

describe("viewString", () => {
  it("pretty-prints a string holding one EDN collection", () => {
    expect(shown('{:job/id 7, :job/tags #{:a}, :at #inst "2026-10-09T12:00:00.000-00:00", :rate 1.0}')).toEqual([
      "edn",
      '{:job/id 7 :job/tags #{:a} :at #inst "2026-10-09T12:00:00.000-00:00" :rate 1.0}',
    ]);
    expect(shown('  #error {:cause "boom"}\n')).toEqual(["edn", '#error {:cause "boom"}']);
    expect(shown("(1 2)")[0]).toBe("text");
  });

  it("re-indents a string holding a JSON object or array", () => {
    expect(shown('{"id":12345678901234567890,"amount":12.50,"tags":[],"meta":{}}')).toEqual([
      "json",
      '{\n  "id": 12345678901234567890,\n  "amount": 12.50,\n  "tags": [],\n  "meta": {}\n}',
    ]);
  });

  it("reads JSON as JSON, even when it would also read as (wrong) EDN", () => {
    expect(shown('{"a":true}')).toEqual(["json", '{\n  "a": true\n}']);
    expect(shown("[1, 2]")).toEqual(["json", "[\n  1,\n  2\n]"]);
  });

  it("shows other strings as text", () => {
    for (const text of [
      "",
      "hello",
      "42",
      "true",
      '"quoted"',
      ":keyword",
      '#inst "2026-10-09"',
      "[1 2",
      "{:a}",
      '#"regex"',
      "[see below]: a note",
      "(not clojure",
      "[1 2] [3 4]",
    ]) {
      expect(shown(text), text).toEqual(["text", text]);
    }
  });

  it("shows a collection as text when the EDN pane already shows it as it would be pretty-printed", () => {
    expect(shown("[1 2]")).toEqual(["text", "[1 2]"]);
    expect(shown("[]")).toEqual(["text", "[]"]);
    // The EDN pane escapes the quotes, the viewer doesn't.
    expect(shown('{:a "x"}')).toEqual(["edn", '{:a "x"}']);
  });
});

describe("formatJson", () => {
  it("keeps strings as sent, including escapes and delimiters inside them", () => {
    expect(formatJson(String.raw`{"a,b":"x\"}:[,","c":[ "d" , null ]}`)).toBe(
      String.raw`{
  "a,b": "x\"}:[,",
  "c": [
    "d",
    null
  ]
}`,
    );
  });

  it("indents nested collections and ignores the original whitespace", () => {
    expect(formatJson('\n [ {"a" : [ 1 ,{ }] } ]  ')).toBe('[\n  {\n    "a": [\n      1,\n      {}\n    ]\n  }\n]');
  });
});

describe("chipLabel", () => {
  it("labels structured, multi-line and long strings, and nothing else", () => {
    expect(chipLabel(node("{:a [1 2 3] :b {:c 1}}\n"))).toBe("EDN");
    expect(chipLabel(node('{"a":1}'))).toBe("JSON");
    expect(chipLabel(node("one\ntwo\r\nthree"))).toBe("3 lines");
    expect(chipLabel(node("x".repeat(LONG_STRING + 1)))).toBe("121 chars");
    expect(chipLabel(node("x".repeat(LONG_STRING)))).toBeNull();
    expect(chipLabel(node("short"))).toBeNull();
    expect(chipLabel(node("[1 2]"))).toBeNull();
  });
});
