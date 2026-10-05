import { describe, expect, it } from "vitest";
import { decodeTransit } from "../transit/decode";
import { formatPath, pathAt, printEdn } from "./print";

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
