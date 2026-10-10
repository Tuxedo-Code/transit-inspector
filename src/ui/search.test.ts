import { describe, expect, it } from "vitest";
import type { Body, RequestRow } from "../model";
import {
  compileQuery,
  findMatches,
  type Query,
  type RequestMatches,
  searchableText,
  searchRow,
  searchRows,
} from "./search";

function query(text: string, options: { caseSensitive?: boolean; regex?: boolean } = {}): Query {
  const compiled = compileQuery({ text, caseSensitive: false, regex: false, ...options });
  if (!compiled?.ok) throw new Error(`invalid query ${text}`);
  return compiled;
}

function body(kind: Body["kind"], text: string | null): Body {
  return { kind, mimeType: "", text };
}

function row(url: string, request: Body, response: Body): RequestRow {
  return {
    id: url,
    url,
    method: "GET",
    status: 200,
    statusText: "OK",
    startedDateTime: "",
    startedMs: 0,
    durationMs: 0,
    size: 0,
    resourceType: "fetch",
    failed: false,
    request,
    response,
  };
}

const EMPTY = body("empty", null);

describe("compileQuery", () => {
  it("is null for an empty query", () => {
    expect(compileQuery({ text: "", caseSensitive: false, regex: false })).toBeNull();
  });

  it("matches plain text literally", () => {
    expect(findMatches("a.b axb", query("a.b")).map((m) => m.from)).toEqual([0]);
  });

  it("ignores case unless asked", () => {
    expect(findMatches("Ada ada", query("ada"))).toHaveLength(2);
    expect(findMatches("Ada ada", query("ada", { caseSensitive: true }))).toHaveLength(1);
  });

  it("reports an invalid pattern", () => {
    expect(compileQuery({ text: "(", caseSensitive: false, regex: true })).toMatchObject({ ok: false });
  });

  it("uses CodeMirror's flags, so a pattern its find bar rejects is rejected here too", () => {
    // Valid without the u flag, invalid with it.
    expect(compileQuery({ text: "\\-", caseSensitive: false, regex: true })).toMatchObject({ ok: false });
  });
});

describe("findMatches", () => {
  it("returns a row per match with its line number and offsets", () => {
    const text = 'first\n{:name "Ada"\n :note "Ada and Ada"}';
    const matches = findMatches(text, query("ada"));
    expect(matches.map(({ line, from, to }) => ({ line, from, to }))).toEqual([
      { line: 2, from: 14, to: 17 },
      { line: 3, from: 27, to: 30 },
      { line: 3, from: 35, to: 38 },
    ]);
    for (const match of matches) expect(text.slice(match.from, match.to)).toBe("Ada");
  });

  it("returns every match, however many", () => {
    expect(findMatches("x\n".repeat(50_000), query("x"))).toHaveLength(50_000);
  });

  it("matches patterns line by line", () => {
    const text = "foo\nfoo bar\nbar foo";
    expect(findMatches(text, query("^foo", { regex: true })).map((m) => m.line)).toEqual([1, 2]);
    expect(findMatches(text, query("foo$", { regex: true })).map((m) => m.line)).toEqual([1, 3]);
    expect(findMatches(text, query("foo\\sbar", { regex: true })).map((m) => m.line)).toEqual([2]);
  });

  it("skips empty matches", () => {
    expect(findMatches("abc", query("x*", { regex: true }))).toEqual([]);
  });

  it("previews the line trimmed, with the match's range in it", () => {
    const [match] = findMatches('   :name "Ada"   ', query("Ada"));
    expect(match).toMatchObject({ preview: ':name "Ada"' });
    expect(match?.preview.slice(match.previewFrom, match.previewTo)).toBe("Ada");
  });

  it("cuts a long line 25 characters before the match, like DevTools", () => {
    const line = `${"x".repeat(100)} Ada ${"y".repeat(1000)}`;
    const [match] = findMatches(line, query("Ada"));
    expect(match?.preview.startsWith(`…${"x".repeat(24)} Ada`)).toBe(true);
    expect(match?.preview.length).toBeLessThan(400);
    expect(match?.preview.slice(match.previewFrom, match.previewTo)).toBe("Ada");
  });

  it("keeps a match in the indentation whole", () => {
    const [match] = findMatches("    x", query("^\\s+", { regex: true }));
    expect(match?.preview.slice(match.previewFrom, match.previewTo)).toBe("    ");
  });
});

describe("searchableText", () => {
  it("searches Transit as the EDN pane prints it", () => {
    expect(searchableText(body("transit", '["^ ","~:user/name","Ada"]'))).toEqual({
      pane: "edn",
      text: '{:user/name "Ada"}',
    });
  });

  it("finds a key in every map, though Transit sends repeats as cache codes", () => {
    const transit = '[["^ ","~:user/name","Ada"],["^ ","^0","Grace"]]';
    expect(transit).not.toMatch(/user\/name.*user\/name/);
    const searchable = searchableText(body("transit", transit));
    expect(findMatches(searchable?.text ?? "", query(":user/name"))).toHaveLength(2);
  });

  it("searches undecodable Transit and other kept bodies as received, in the raw pane", () => {
    expect(searchableText(body("transit", "[1,"))).toEqual({ pane: "raw", text: "[1," });
    expect(searchableText(body("json", '{"a":1}'))).toEqual({ pane: "raw", text: '{"a":1}' });
  });

  it("has nothing for bodies without text", () => {
    expect(searchableText(EMPTY)).toBeNull();
    expect(searchableText(body("binary", null))).toBeNull();
  });
});

describe("searchRow", () => {
  it("lists the payload's matches before the response's", () => {
    const result = searchRow(
      row("/api/users", body("json", '{"name":"Ada"}'), body("transit", '["^ ","~:name","Ada","~:x","Ada"]')),
      query("Ada"),
    );
    expect(result?.bodies.map(({ direction, pane, matches }) => [direction, pane, matches.length])).toEqual([
      ["request", "raw", 1],
      ["response", "edn", 2],
    ]);
    expect(result?.count).toBe(3);
  });

  it("is null without matches", () => {
    expect(searchRow(row("/a", EMPTY, body("transit", '["^ ","~:a",1]')), query("Ada"))).toBeNull();
  });
});

describe("searchRows", () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    row(`/api/${i}`, EMPTY, body("transit", i % 2 === 0 ? '["^ ","~:name","Ada"]' : '["^ ","~:name","Grace"]')),
  );

  it("reports matching requests in list order", async () => {
    const found: RequestMatches[] = [];
    const done = await searchRows(rows, query("Ada"), (result) => found.push(result), new AbortController().signal);
    expect(done).toBe(true);
    expect(found.map((result) => result.row.url)).toEqual(["/api/0", "/api/2", "/api/4"]);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const found: RequestMatches[] = [];
    expect(await searchRows(rows, query("Ada"), (result) => found.push(result), controller.signal)).toBe(false);
    expect(found).toEqual([]);
  });
});
