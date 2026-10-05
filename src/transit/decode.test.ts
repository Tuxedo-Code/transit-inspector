import { describe, expect, it } from "vitest";
import { printEdn } from "../edn/print";
import { decodeTransit } from "./decode";

/** Decodes Transit and prints it as EDN; fails the test on decode errors. */
function edn(transit: string): string {
  const result = decodeTransit(transit);
  if (!result.ok) throw new Error(result.message);
  return printEdn(result.value).text;
}

describe("decodeTransit + printEdn: one case per type", () => {
  it.each([
    ["nil", "[null]", "[nil]"],
    ["booleans", "[true,false]", "[true false]"],
    ["small integers", "[1,-2]", "[1 -2]"],
    ["integers above 2^53, exactly", '["~i9007199254740993"]', "[9007199254740993]"],
    ["floats", "[9.5,-0.25]", "[9.5 -0.25]"],
    ["special floats", '["~zNaN","~zINF","~z-INF"]', "[##NaN ##Inf ##-Inf]"],
    ["big integers", '["~n123456789012345678901234567890"]', "[123456789012345678901234567890N]"],
    ["big decimals, keeping scale", '["~f1.50"]', "[1.50M]"],
    ["ratios", '[["~#ratio",["~n1","~n3"]]]', "[1/3]"],
    ["strings, escaped", '["a\\"b\\\\c\\nd"]', '["a\\"b\\\\c\\nd"]'],
    ["Transit-escaped strings", '["~~tilde","~^caret"]', '["~tilde" "^caret"]'],
    ["chars", '["~cA","~c "]', "[\\A \\space]"],
    ["keywords", '["~:a","~:user/id"]', "[:a :user/id]"],
    ["symbols", '["~$foo/bar"]', "[foo/bar]"],
    ["uuids", '["~u550e8400-e29b-41d4-a716-446655440000"]', '[#uuid "550e8400-e29b-41d4-a716-446655440000"]'],
    ["insts from millis", '["~m0"]', '[#inst "1970-01-01T00:00:00.000Z"]'],
    ["insts from strings", '["~t2026-10-05T09:30:00.000Z"]', '[#inst "2026-10-05T09:30:00.000Z"]'],
    ["URIs", '["~rhttps://x.test/a"]', '[#uri "https://x.test/a"]'],
    ["vectors", "[[1,[2]]]", "[[1 [2]]]"],
    ["lists", '[["~#list",[1,2]]]', "[(1 2)]"],
    ["sets, in wire order", '[["~#set",["~:b","~:a"]]]', "[#{:b :a}]"],
    ["maps, in wire order", '["^ ","~:b",1,"~:a",2]', "{:b 1 :a 2}"],
    ["verbose maps", '{"~:a":1}', "{:a 1}"],
    ["cached keys", '[["^ ","~:user/id",1],["^ ","^0",2]]', "[{:user/id 1} {:user/id 2}]"],
    ["maps with non-scalar keys", '["~#cmap",[["^ ","~:x",1],"one"]]', '{{:x 1} "one"}'],
    ["quoted top-level scalars", '["~#\'",42]', "42"],
    ["unknown tags", '["~#money/amount",["^ ","~:cents",1999]]', "#money/amount {:cents 1999}"],
  ])("%s", (_name, transit, expected) => {
    expect(edn(transit)).toBe(expected);
  });
});

describe("problems", () => {
  it("reports malformed input with its position", () => {
    const result = decodeTransit('["^ ","~:a",1,"~:b",[1,2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.position).toBe(24);
  });

  it("marks unknown tags", () => {
    const result = decodeTransit('["~#money",5]');
    if (!result.ok) throw new Error(result.message);
    const { text, marks } = printEdn(result.value);
    expect(marks).toHaveLength(1);
    expect(text.slice(marks[0]?.from, marks[0]?.to)).toBe("#money 5");
    expect(marks[0]?.message).toContain('Unknown Transit tag "money"');
  });

  it("marks integers that lost precision as plain JSON numbers", () => {
    const result = decodeTransit("[9007199254740993]");
    if (!result.ok) throw new Error(result.message);
    const { marks } = printEdn(result.value);
    expect(marks[0]?.severity).toBe("warning");
    expect(marks[0]?.message).toContain("precision");
  });
});
