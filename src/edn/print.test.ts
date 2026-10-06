import { describe, expect, it } from "vitest";
import { decodeTransit } from "../transit/decode";
import { enclosingForm, formAt, formatPath, pathAt, printEdn } from "./print";

function printed(transit: string) {
  const result = decodeTransit(transit);
  if (!result.ok) throw new Error(result.message);
  return printEdn(result.value);
}

/** The path at the first occurrence of `needle` in the printed text. */
function pathOf(transit: string, needle: string, nth = 0): string | null {
  const { text, index } = printed(transit);
  let at = -1;
  for (let i = 0; i <= nth; i++) at = text.indexOf(needle, at + 1);
  if (at < 0) throw new Error(`${needle} not in ${text}`);
  const path = pathAt(index, at);
  return path && formatPath(path);
}

const NESTED =
  '["^ ","~:user/orders",[["^ ","~:order/id",1,"~:order/tags",["~#set",["~:new"]],"~:order/log",["~#list",["created","paid"]]]],"~:user/name","Ada"]';

describe("layout", () => {
  it("keeps short collections on one line and breaks long ones", () => {
    const long = `["^ ",${Array.from({ length: 8 }, (_, i) => `"~:key-number-${i}","value-${i}"`).join(",")}]`;
    const { text } = printed(long);
    expect(text.split("\n")).toHaveLength(8);
    expect(text.split("\n")[1]).toBe(' :key-number-1 "value-1"');
  });

  it("aligns nested values under their opening bracket", () => {
    const { text } = printed(
      `["^ ","~:items",[${Array.from({ length: 6 }, (_, i) => `["^ ","~:long-name",${i},"~:other",${i}]`).join(",")}]]`,
    );
    expect(text.split("\n")[1]?.startsWith("         {:long-name 1")).toBe(true);
  });
});

describe("formAt", () => {
  /** The form selected by double-clicking the character at `offset`, or null. */
  function formText(transit: string, offset: (text: string) => number): string | null {
    const { text, index } = printed(transit);
    const form = formAt(index, offset(text));
    return form && text.slice(form.from, form.to);
  }

  it("selects a collection from its opening or closing bracket", () => {
    for (const [transit, expected] of [
      ['["^ ","~:a",1]', "{:a 1}"],
      ["[1,2]", "[1 2]"],
      ['["~#list",[1,2]]', "(1 2)"],
    ] as const) {
      expect(formText(transit, () => 0)).toBe(expected);
      expect(formText(transit, (text) => text.length - 1)).toBe(expected);
    }
  });

  it("selects a set from either character of #{", () => {
    for (const offset of [0, 1, 4]) expect(formText('["~#set",["~:x"]]', () => offset)).toBe("#{:x}");
  });

  it("picks the innermost form for nested brackets, also when a bracket follows a value directly", () => {
    expect([0, 1, 3, 4].map((offset) => formText("[[1]]", () => offset))).toEqual(["[[1]]", "[1]", "[1]", "[[1]]"]);
  });

  it("selects the value of a tagged collection, not the tag", () => {
    expect(formText('["~#point",["^ ","~:x",1]]', (text) => text.indexOf("{"))).toBe("{:x 1}");
    expect(formText('["~#point",["^ ","~:x",1]]', () => 0)).toBeNull();
  });

  it("ignores scalars, brackets inside strings and offsets outside the text", () => {
    expect(formText("[[1]]", () => 2)).toBeNull();
    expect(formText('["~:a","{[("]', (text) => text.indexOf("{"))).toBeNull();
    expect(formText("[1]", () => 3)).toBeNull();
  });
});

describe("enclosingForm", () => {
  it("expands a cursor step by step to the whole document", () => {
    const { text, index } = printed(NESTED);
    const cursor = text.indexOf(":order/id") + 2;
    const steps: string[] = [];
    for (let range = enclosingForm(index, cursor, cursor); range; range = enclosingForm(index, range.from, range.to)) {
      steps.push(text.slice(range.from, range.to));
    }
    expect(steps).toEqual([
      ":order/id",
      '{:order/id 1 :order/tags #{:new} :order/log ("created" "paid")}',
      '[{:order/id 1 :order/tags #{:new} :order/log ("created" "paid")}]',
      text,
    ]);
  });

  it("expands a selection that already covers a value to the value around it", () => {
    const { text, index } = printed('["^ ","~:a",[1,2]]');
    const from = text.indexOf("1");
    const range = enclosingForm(index, from, from + 1);
    expect(range && text.slice(range.from, range.to)).toBe("[1 2]");
  });
});

describe("pathAt", () => {
  it("finds paths through maps, vectors, sets and lists", () => {
    expect(pathOf(NESTED, ":order/id")).toBe("[:user/orders 0 :order/id]");
    expect(pathOf(NESTED, ":new")).toBe("[:user/orders 0 :order/tags :new]");
    expect(pathOf(NESTED, '"paid"')).toBe("[:user/orders 0 :order/log 1]");
    expect(pathOf(NESTED, '"Ada"')).toBe("[:user/name]");
  });

  it("gives a key the path of its entry", () => {
    expect(pathOf(NESTED, ":user/name")).toBe("[:user/name]");
  });

  it("counts a cursor right after a value as on that value", () => {
    expect(pathOf(NESTED, " :order/tags")).toBe("[:user/orders 0 :order/id]");
  });

  it("returns the enclosing collection in the indentation between entries", () => {
    const { text, index } = printed(NESTED);
    const indentation = text.indexOf("\n :user/name") + 1;
    expect(formatPath(pathAt(index, indentation) ?? [])).toBe("[]");
  });

  it("gives the root an empty path and returns null outside the text", () => {
    const { index, text } = printed('["^ ","~:a",1]');
    expect(formatPath(pathAt(index, 0) ?? [])).toBe("[]");
    expect(pathAt(index, text.length + 5)).toBeNull();
  });

  it("prints non-scalar keys flat in paths", () => {
    expect(pathOf('["~#cmap",[["^ ","~:x",1],"one"]]', '"one"')).toBe("[{:x 1}]");
  });
});
