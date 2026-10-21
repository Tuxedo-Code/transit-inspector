import { SearchQuery } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { MatchCounter, matchLabel } from "./find-bar";

type Options = { caseSensitive?: boolean; regexp?: boolean; wholeWord?: boolean };

/** What one cursor over the whole document finds, which is what CodeMirror highlights. */
function cursorMatches(doc: string, search: string, options: Options = {}): [number, number][] {
  const cursor = new SearchQuery({ search, ...options }).getCursor(EditorState.create({ doc }));
  const matches: [number, number][] = [];
  for (let next = cursor.next(); !next.done; next = cursor.next()) matches.push([next.value.from, next.value.to]);
  return matches;
}

function count(doc: string, search: string, options: Options = {}, chunk?: number): MatchCounter {
  const counter = new MatchCounter(EditorState.create({ doc }), new SearchQuery({ search, ...options }), chunk);
  counter.step(Number.POSITIVE_INFINITY);
  return counter;
}

const ranges = (counter: MatchCounter) => counter.from.map((from, i): [number, number] => [from, counter.to[i] ?? -1]);

describe("MatchCounter", () => {
  const cases: { name: string; doc: string; search: string; options?: Options }[] = [
    { name: "plain text", doc: "order :order/id :order/total", search: "order" },
    { name: "case-insensitive", doc: "order Order ORDER", search: "order" },
    { name: "match case", doc: "order Order ORDER", search: "Order", options: { caseSensitive: true } },
    { name: "overlapping candidates", doc: "aaaa aa aaa aaaaa", search: "aa" },
    { name: "an escaped line break", doc: "a\nb a\nb\na\nb", search: "a\\nb" },
    { name: "by word", doc: "id ids xid idx id :id/x", search: "id", options: { wholeWord: true } },
    { name: "by word, from a space", doc: "a a xa a ax a a", search: "a a", options: { wholeWord: true } },
    { name: "by word, over lines", doc: "xid\nid\nidx id\n:id", search: "id", options: { wholeWord: true } },
    {
      name: "by word, astral characters",
      doc: "\u{1D400}\u{1D400} \u{1D400} A\u{1D400} \u{1D400}A",
      search: "A",
      options: { wholeWord: true },
    },
    { name: "a ligature in the text", doc: "ﬁle file", search: "fi" },
    { name: "a ligature in the query", doc: "file ﬁle", search: "ﬁ" },
    { name: "astral characters", doc: "\u{1D400}\u{1D400} A", search: "A" },
    { name: "no match", doc: "order", search: "zzz" },
    { name: "a regular expression", doc: "a1 b22 c333", search: "\\d+", options: { regexp: true } },
    { name: "a pattern at line starts", doc: " :a\n :b\n:c", search: "^\\s*:", options: { regexp: true } },
    { name: "a pattern across lines", doc: "a\nb a\nb", search: "a\\nb", options: { regexp: true } },
  ];

  for (const { name, doc, search, options } of cases) {
    it(`finds what CodeMirror's cursor finds: ${name}`, () => {
      const expected = cursorMatches(doc, search, options);
      expect(ranges(count(doc, search, options))).toEqual(expected);
      // Chunks of every size, so matches straddle chunk boundaries everywhere.
      for (let chunk = 1; chunk <= doc.length; chunk++) {
        expect(ranges(count(doc, search, options, chunk)), `chunk ${chunk}`).toEqual(expected);
      }
    });
  }

  it("finds the cases' matches", () => {
    // The cases above only compare with CodeMirror; pin a few counts so they also prove something on their own.
    expect(cursorMatches("aaaa aa aaa aaaaa", "aa")).toHaveLength(6);
    expect(cursorMatches("a\nb a\nb\na\nb", "a\\nb")).toHaveLength(3);
    expect(cursorMatches("\u{1D400}\u{1D400} A", "A")).toEqual([
      [0, 2],
      [2, 4],
      [5, 6],
    ]);
  });

  it("counts in steps, and resumes where it stopped", () => {
    const doc = "order\n".repeat(100);
    const counter = new MatchCounter(EditorState.create({ doc }), new SearchQuery({ search: "order" }), 16);
    let steps = 0;
    // A deadline in the past: one chunk per step.
    while (!counter.step(Number.NEGATIVE_INFINITY)) steps++;
    expect(steps).toBeGreaterThan(10);
    expect(counter.done).toBe(true);
    expect(ranges(counter)).toEqual(cursorMatches(doc, "order"));
  });

  it("counts a regular expression a match per step", () => {
    const counter = new MatchCounter(
      EditorState.create({ doc: "a1 b22 c333" }),
      new SearchQuery({ search: "\\d+", regexp: true }),
    );
    expect(counter.step(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(counter.from).toEqual([1]);
    while (!counter.step(Number.NEGATIVE_INFINITY));
    expect(counter.from).toEqual([1, 4, 8]);
  });

  it("knows which match a selection selects exactly", () => {
    const counter = count("order order order", "order");
    expect(counter.indexOf(EditorSelection.range(6, 11))).toBe(1);
    expect(counter.indexOf(EditorSelection.range(11, 6))).toBe(1);
    expect(counter.indexOf(EditorSelection.range(12, 17))).toBe(2);
    expect(counter.indexOf(EditorSelection.cursor(6))).toBe(-1);
    expect(counter.indexOf(EditorSelection.range(6, 10))).toBe(-1);
    expect(counter.indexOf(EditorSelection.range(5, 11))).toBe(-1);
    expect(count("order", "zzz").indexOf(EditorSelection.range(0, 5))).toBe(-1);
  });
});

describe("matchLabel", () => {
  it("uses DevTools' wording", () => {
    expect(matchLabel(0, -1)).toEqual({ text: "0 of 0", label: "Shows result 0 of 0" });
    expect(matchLabel(1, -1)).toEqual({ text: "1 match", label: "1 match" });
    expect(matchLabel(12, -1)).toEqual({ text: "12 matches", label: "12 matches" });
    expect(matchLabel(12, 2)).toEqual({ text: "3 of 12", label: "Shows result 3 of 12" });
    // No digit grouping, as in DevTools.
    expect(matchLabel(1234, 0).text).toBe("1 of 1234");
  });
});
