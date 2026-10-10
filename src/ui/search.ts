import { printEdn } from "../edn/print";
import type { Body, RequestRow } from "../model";
import { decodeTransit } from "../transit/decode";
import type { Direction } from "./body-view";

/** The pane that shows a searched text: the decoded EDN, or the body as received (not Transit, or undecodable). */
export type SearchedPane = "edn" | "raw";

export interface SearchOptions {
  text: string;
  caseSensitive: boolean;
  regex: boolean;
}

/** A compiled query. `literal` is set for plain text, which (unlike a pattern) can't depend on line boundaries. */
export interface Query {
  re: RegExp;
  literal: boolean;
}

export type CompiledQuery = ({ ok: true } & Query) | { ok: false; message: string };

/** One match, as the Network panel's Search pane lists it: a row per match, even on a line with several. */
export interface Match {
  /** 1-based line number. */
  line: number;
  /** The match's range in the searched text. */
  from: number;
  to: number;
  /** The line around the match, trimmed and cut like DevTools does, and the match's range in it. */
  preview: string;
  previewFrom: number;
  previewTo: number;
}

export interface BodyMatches {
  direction: Direction;
  pane: SearchedPane;
  matches: Match[];
}

export interface RequestMatches {
  row: RequestRow;
  /** Payload first, then response; only bodies with matches. */
  bodies: BodyMatches[];
  count: number;
}

/** Where a clicked result points: the request, its body, the pane showing the match, and the match's range there. */
export interface Reveal {
  rowId: string;
  direction: Direction;
  pane: SearchedPane;
  from: number;
  to: number;
  /** The search that found it, to carry over to that pane's find bar. */
  search: SearchOptions;
}

/**
 * The flags of CodeMirror's own search (`gmu`, plus `i`), so a pattern means the same here and in a pane's find bar.
 * `m` doesn't matter: lines are searched one at a time.
 */
const FLAGS = "gu";

/** Compiles a query; null for an empty one. Plain text matches literally. */
export function compileQuery({ text, caseSensitive, regex }: SearchOptions): CompiledQuery | null {
  if (text === "") return null;
  const source = regex ? text : text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return { ok: true, re: new RegExp(source, FLAGS + (caseSensitive ? "" : "i")), literal: !regex };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Characters kept before a match in its preview; DevTools keeps 25 and marks the cut with "…". */
const PREVIEW_BEFORE = 25;
/** Characters kept after a match: more than any pane is wide, without copying a whole long line. */
const PREVIEW_AFTER = 300;

function preview(line: string, column: number, length: number): Pick<Match, "preview" | "previewFrom" | "previewTo"> {
  const indent = line.length - line.trimStart().length;
  const start = column < indent ? column : Math.max(indent, column - PREVIEW_BEFORE);
  const end = Math.min(line.trimEnd().length, column + length + PREVIEW_AFTER);
  const prefix = start > indent ? "…" : "";
  return {
    preview: prefix + line.slice(start, Math.max(end, column + length)),
    previewFrom: prefix.length + column - start,
    previewTo: prefix.length + column - start + length,
  };
}

/** Every match in `text`, line by line, like DevTools: a pattern never spans lines. Empty matches are skipped. */
export function findMatches(text: string, { re, literal }: Query): Match[] {
  const matches: Match[] = [];
  // Plain text has no line breaks, so one pass over the whole text tells whether there is anything to find. A pattern
  // can't be pre-checked that way: `^a` matches at every line start, but only at the start of the whole text.
  re.lastIndex = 0;
  if (literal && !re.test(text)) return matches;
  let line = 1;
  let start = 0;
  while (start <= text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline < 0 ? text.length : newline;
    const content = text.slice(start, end);
    re.lastIndex = 0;
    for (let found = re.exec(content); found; found = re.exec(content)) {
      const length = found[0].length;
      if (length === 0) {
        re.lastIndex++;
        continue;
      }
      matches.push({
        line,
        from: start + found.index,
        to: start + found.index + length,
        ...preview(content, found.index, length),
      });
    }
    if (newline < 0) break;
    start = newline + 1;
    line++;
  }
  return matches;
}

interface Searchable {
  pane: SearchedPane;
  text: string;
}

const searchables = new WeakMap<Body, Searchable | null>();

/**
 * The text a body is searched in: Transit as the EDN pane prints it (raw Transit replaces repeated keys with cache
 * codes like `^1`, so it would miss them), anything else kept as received. Only the text is cached, not the path
 * index the EDN pane builds, so searching every request doesn't hold every index in memory.
 */
export function searchableText(body: Body): Searchable | null {
  let searchable = searchables.get(body);
  if (searchable === undefined) {
    searchable = computeSearchable(body);
    searchables.set(body, searchable);
  }
  return searchable;
}

function computeSearchable(body: Body): Searchable | null {
  if (body.text === null) return null;
  switch (body.kind) {
    case "transit": {
      const result = decodeTransit(body.text);
      return result.ok ? { pane: "edn", text: printEdn(result.value).text } : { pane: "raw", text: body.text };
    }
    case "json":
    case "text":
      return { pane: "raw", text: body.text };
    default:
      return null;
  }
}

/** The matches in a request's payload and response; null when there are none. */
export function searchRow(row: RequestRow, query: Query): RequestMatches | null {
  const bodies: BodyMatches[] = [];
  for (const direction of ["request", "response"] as const) {
    const searchable = searchableText(direction === "request" ? row.request : row.response);
    if (!searchable) continue;
    const matches = findMatches(searchable.text, query);
    if (matches.length > 0) bodies.push({ direction, pane: searchable.pane, matches });
  }
  if (bodies.length === 0) return null;
  return { row, bodies, count: bodies.reduce((sum, body) => sum + body.matches.length, 0) };
}

/** How long the search runs before letting the panel handle input and paint. */
const SLICE_MS = 16;

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Searches the rows in order, reporting each request with matches as it is found. Gives the event loop a turn about
 * every frame, so the panel stays responsive. Resolves true once done, false when aborted.
 */
export async function searchRows(
  rows: readonly RequestRow[],
  query: Query,
  onResult: (result: RequestMatches) => void,
  signal: AbortSignal,
): Promise<boolean> {
  let sliceStart = performance.now();
  for (const row of rows) {
    if (performance.now() - sliceStart > SLICE_MS) {
      await nextTask();
      sliceStart = performance.now();
    }
    if (signal.aborted) return false;
    const result = searchRow(row, query);
    if (result) onResult(result);
  }
  return !signal.aborted;
}
