import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { RequestRow } from "../model";
import { ClearFieldIcon, ClearIcon, CloseIcon, DisclosureIcon, RefreshIcon, SearchIcon } from "./icons";
import {
  type BodyMatches,
  compileQuery,
  type Match,
  type RequestMatches,
  type Reveal,
  type SearchOptions,
  searchRows,
} from "./search";

interface Props {
  /** The captured rows: searched on Enter, and used to drop results for requests that are gone. */
  rows: readonly RequestRow[];
  /** Changes each time the pane should take focus (Cmd+F, the toolbar button). */
  focusSignal: number;
  onReveal: (target: Reveal) => void;
  onClose: () => void;
}

type Status = { kind: "idle" } | { kind: "searching" } | { kind: "done" } | { kind: "error"; message: string };

/** A request's name in the results: its last path segment, without the query, like the Network panel's Search pane. */
function fileName(url: string): string {
  try {
    const { pathname, host } = new URL(url);
    return pathname.split("/").filter(Boolean).at(-1) ?? host;
  } catch {
    return url;
  }
}

/** The URL without its scheme, shown dimmed after the name. */
function qualifier(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
}

const DIRECTION_LABELS = { request: "Payload", response: "Response" } as const;

/**
 * The Search pane: searches every captured request's bodies and lists each match under its request. Looks and works
 * like the Network panel's Search pane (measured in Chrome 154): runs on Enter, a result row per match, results kept
 * until the next search.
 */
export function SearchPane({ rows, focusSignal, onReveal, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [results, setResults] = useState<readonly RequestMatches[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  /** The search the results are for, carried over to a pane's find bar on reveal. */
  const [searched, setSearched] = useState<SearchOptions | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<Match | null>(null);
  const running = useRef<AbortController | null>(null);

  // A layout effect, so the input has focus as soon as the pane shows, not a frame later.
  useLayoutEffect(() => {
    if (focusSignal === 0) return;
    input.current?.focus();
    input.current?.select();
  }, [focusSignal]);

  useEffect(() => () => running.current?.abort(), []);

  const search = (options: SearchOptions) => {
    running.current?.abort();
    running.current = null;
    setResults([]);
    setCollapsed(new Set());
    setSelected(null);
    const query = compileQuery(options);
    if (!query) {
      setSearched(null);
      setStatus({ kind: "idle" });
      return;
    }
    if (!query.ok) {
      setSearched(null);
      setStatus({ kind: "error", message: query.message });
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    setSearched(options);
    setStatus({ kind: "searching" });
    void searchRows(rows, query, (result) => setResults((found) => [...found, result]), controller.signal).then(
      (done) => {
        if (done) setStatus({ kind: "done" });
      },
    );
  };

  const run = () => search({ text, caseSensitive, regex });
  const clear = () => {
    setText("");
    search({ text: "", caseSensitive, regex });
  };

  // Requests that Clear or a navigation removed drop out of the results.
  const shown = useMemo(() => {
    const ids = new Set(rows.map((row) => row.id));
    return results.filter((result) => ids.has(result.row.id));
  }, [rows, results]);
  const matchCount = shown.reduce((sum, result) => sum + result.count, 0);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const reveal = (row: RequestRow, body: BodyMatches, match: Match) => {
    if (!searched) return;
    setSelected(match);
    onReveal({
      rowId: row.id,
      direction: body.direction,
      pane: body.pane,
      from: match.from,
      to: match.to,
      search: searched,
    });
  };

  return (
    <div class="search-pane">
      <div class="search-header">
        <span class="tab selected">Search</span>
        <div class="spacer" />
        <button type="button" class="icon-button" title="Close" aria-label="Close search" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div class="search-query">
        <label class="search-field">
          <SearchIcon size={16} />
          <input
            ref={input}
            type="text"
            placeholder="Find"
            aria-label="Find"
            spellcheck={false}
            value={text}
            onInput={(event) => setText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              run();
            }}
          />
          {text !== "" && (
            <button type="button" class="field-button" title="Clear" aria-label="Clear query" onClick={clear}>
              <ClearFieldIcon />
            </button>
          )}
          <button
            type="button"
            class="field-button text-glyph"
            title="Enable regular expressions"
            aria-label="Enable regular expressions"
            aria-pressed={regex}
            onClick={() => setRegex(!regex)}
          >
            (.*)
          </button>
          <button
            type="button"
            class="field-button text-glyph"
            title="Enable case sensitive search"
            aria-label="Enable case sensitive search"
            aria-pressed={caseSensitive}
            onClick={() => setCaseSensitive(!caseSensitive)}
          >
            Aa
          </button>
        </label>
        <button type="button" class="icon-button" title="Refresh" aria-label="Refresh" onClick={run}>
          <RefreshIcon />
        </button>
        <button type="button" class="icon-button" title="Clear search" aria-label="Clear search" onClick={clear}>
          <ClearIcon />
        </button>
      </div>
      {status.kind === "idle" ? (
        <div class="search-empty">
          <div class="title">No search results</div>
          <div>Type and press ↩ to search</div>
        </div>
      ) : status.kind === "done" && matchCount === 0 ? (
        // As in DevTools, without a summary.
        <div class="search-empty" role="status">
          <div class="title">No matches found</div>
          <div>Nothing matched your search query</div>
        </div>
      ) : (
        <>
          <SearchResults
            results={shown}
            collapsed={collapsed}
            selected={selected}
            onToggle={toggle}
            onReveal={reveal}
          />
          <div class="search-summary" role="status">
            {status.kind === "error" ? (
              <span class="message error">{status.message}</span>
            ) : status.kind === "searching" ? (
              <span class="message">Searching…</span>
            ) : (
              <>
                <span class="message">Search finished.</span>
                <span class="message">Found {matchCountText(matchCount, shown.length)}.</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function matchCountText(matches: number, requests: number): string {
  const count = (n: number, noun: string) => `${n.toLocaleString("en-US")} ${noun}${n === 1 ? "" : "es"}`;
  return `${count(matches, "match")} in ${requests.toLocaleString("en-US")} request${requests === 1 ? "" : "s"}`;
}

/** A row of the results: a request, a "Payload"/"Response" label inside it, or a match. */
type Item =
  | { kind: "request"; result: RequestMatches; expanded: boolean }
  | { kind: "label"; key: string; text: string }
  | { kind: "match"; result: RequestMatches; body: BodyMatches; match: Match };

/** Row heights, measured from the Network panel's Search pane: 20px rows, 8px above each request. */
const REQUEST_HEIGHT = 28;
const ROW_HEIGHT = 20;
/** Rows drawn beyond each edge of the viewport, so fast scrolling doesn't show blanks. */
const OVERSCAN_PX = 400;

function itemsOf(results: readonly RequestMatches[], collapsed: ReadonlySet<string>): Item[] {
  const items: Item[] = [];
  for (const result of results) {
    const expanded = !collapsed.has(result.row.id);
    items.push({ kind: "request", result, expanded });
    if (!expanded) continue;
    // Most matches are in responses, so only a request with payload matches labels its parts.
    const labelled = result.bodies.some((body) => body.direction === "request");
    for (const body of result.bodies) {
      if (labelled)
        items.push({
          kind: "label",
          key: `${result.row.id}:${body.direction}`,
          text: DIRECTION_LABELS[body.direction],
        });
      for (const match of body.matches) items.push({ kind: "match", result, body, match });
    }
  }
  return items;
}

const heightOf = (item: Item) => (item.kind === "request" ? REQUEST_HEIGHT : ROW_HEIGHT);

/**
 * The results, drawn as a window over all rows: a request can have tens of thousands of matches, and all of them are
 * listed, so only the rows in view are in the DOM.
 */
function SearchResults({
  results,
  collapsed,
  selected,
  onToggle,
  onReveal,
}: {
  results: readonly RequestMatches[];
  collapsed: ReadonlySet<string>;
  selected: Match | null;
  onToggle: (id: string) => void;
  onReveal: (row: RequestRow, body: BodyMatches, match: Match) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const items = useMemo(() => itemsOf(results, collapsed), [results, collapsed]);
  const offsets = useMemo(() => {
    const tops = new Array<number>(items.length + 1);
    tops[0] = 0;
    for (let i = 0; i < items.length; i++) tops[i + 1] = (tops[i] as number) + heightOf(items[i] as Item);
    return tops;
  }, [items]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The first row that ends below the window's top, by binary search over the row offsets.
  const windowTop = viewport.top - OVERSCAN_PX;
  const windowBottom = viewport.top + viewport.height + OVERSCAN_PX;
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((offsets[mid + 1] as number) <= windowTop) low = mid + 1;
    else high = mid;
  }
  const visible: JSX.Element[] = [];
  for (let i = low; i < items.length && (offsets[i] as number) < windowBottom; i++) {
    const item = items[i] as Item;
    const style = { top: `${offsets[i]}px` };
    if (item.kind === "request") {
      const { row, count } = item.result;
      visible.push(
        <div key={`r:${row.id}`} class="search-request" style={style}>
          <button
            type="button"
            class="search-request-title"
            title={row.url}
            aria-expanded={item.expanded}
            onClick={() => onToggle(row.id)}
          >
            <DisclosureIcon expanded={item.expanded} />
            <span class="name">
              {fileName(row.url)}
              <span class="dash">—</span>
              <span class="qualifier">{qualifier(row.url)}</span>
            </span>
            {!item.expanded && <span class="count">{count.toLocaleString("en-US")}</span>}
          </button>
        </div>,
      );
    } else if (item.kind === "label") {
      visible.push(
        <div key={`l:${item.key}`} class="search-label" style={style}>
          {item.text}
        </div>,
      );
    } else {
      const { result, body, match } = item;
      visible.push(
        <button
          key={`m:${result.row.id}:${body.direction}:${match.from}`}
          type="button"
          class={`search-match${match === selected ? " selected" : ""}`}
          style={style}
          onClick={() => onReveal(result.row, body, match)}
        >
          <span class="line-number">{match.line}</span>
          <span class="content">
            {match.preview.slice(0, match.previewFrom)}
            <mark>{match.preview.slice(match.previewFrom, match.previewTo)}</mark>
            {match.preview.slice(match.previewTo)}
          </span>
        </button>,
      );
    }
  }

  return (
    <div
      class="search-results"
      ref={scroller}
      onScroll={(event) =>
        setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })
      }
    >
      <div class="search-results-content" style={{ height: `${offsets[items.length]}px` }}>
        {visible}
      </div>
    </div>
  );
}
