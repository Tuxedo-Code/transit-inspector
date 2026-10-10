import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { RequestRow } from "../model";
import type { RequestStore } from "../store";
import { DetailView } from "./DetailView";
import { matchesFilter } from "./format";
import { ClearIcon, FilterIcon, SearchIcon, SidebarIcon } from "./icons";
import { RequestList } from "./RequestList";
import { SearchPane } from "./SearchPane";
import { DETAIL_MIN_WIDTH, LIST_MIN_WIDTH, SEARCH_MIN_WIDTH, Splitter } from "./Splitter";
import type { Reveal } from "./search";
import { loadListWidth, loadViewMode, saveListWidth, saveViewMode, type ViewMode } from "./settings";

function useRows(store: RequestStore): readonly RequestRow[] {
  const [rows, setRows] = useState(store.getRows());
  useEffect(() => store.subscribe(setRows), [store]);
  return rows;
}

const IS_MAC = /Mac/.test(navigator.userAgent);

/**
 * Cmd+F (Ctrl+F) outside the editors, the Network panel's search shortcut: calls `open`, which opens the Search pane.
 * Inside an editor, CodeMirror opens its find bar and CodeView stops the key. DevTools' own search bar never opens
 * from the panel: it can't search an extension panel (docs/spec.md "Search").
 * Listens on the document in the capture phase: with focus on no control the key targets <body>, and DevTools'
 * forwarding listener sits on the document too.
 */
function onModF(open: () => void) {
  return (event: KeyboardEvent) => {
    const mod = IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!mod || event.shiftKey || event.altKey || event.key.toLowerCase() !== "f") return;
    if ((event.target as Element).closest(".cm-editor")) return;
    event.preventDefault();
    event.stopPropagation();
    open();
  };
}

export function App({ store }: { store: RequestStore }) {
  const rows = useRows(store);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listHidden, setListHidden] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [listWidth, setListWidth] = useState(loadListWidth);
  /** The string viewer's height (px) once dragged. Kept for every request until the panel closes, never stored. */
  const [viewerHeight, setViewerHeight] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Bumped to focus the Search pane's input. */
  const [searchFocus, setSearchFocus] = useState(0);
  /** The Search pane's width (px) once dragged. Kept until the panel closes, never stored, like `viewerHeight`. */
  const [searchWidth, setSearchWidth] = useState<number | null>(null);
  /** The search result last clicked, for the detail view to show. */
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const listPane = useRef<HTMLDivElement>(null);
  const searchPane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const listener = onModF(() => {
      setSearchOpen(true);
      setSearchFocus((count) => count + 1);
    });
    document.addEventListener("keydown", listener, { capture: true });
    return () => document.removeEventListener("keydown", listener, { capture: true });
  }, []);

  const visible = useMemo(() => rows.filter((row) => matchesFilter(row.url, filter)), [rows, filter]);
  const selected = selectedId === null ? null : (rows.find((row) => row.id === selectedId) ?? null);

  // Navigation or Clear removed the selected request: reset the detail view.
  useEffect(() => {
    if (selectedId !== null && selected === null) {
      setSelectedId(null);
      setListHidden(false);
    }
  }, [selectedId, selected]);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    saveViewMode(mode);
  };
  const resizeList = (width: number, done: boolean) => {
    setListWidth(width);
    if (done) saveListWidth(width);
  };
  const toggleSearch = () => {
    setSearchOpen(!searchOpen);
    if (!searchOpen) setSearchFocus((count) => count + 1);
  };
  // Opens the clicked result's request at the match. A view mode that hides the match's pane switches to side by
  // side, which shows it without hiding the pane the user chose.
  const revealMatch = (target: Reveal) => {
    setSelectedId(target.rowId);
    if ((target.pane === "edn" && viewMode === "transit") || (target.pane === "raw" && viewMode === "edn")) {
      changeViewMode("split");
    }
    setReveal(target);
  };
  const showList = !(listHidden && selected);
  // With a request open, the list narrows to a resizable side pane. The width is clamped by CSS rather than when
  // saved, so it comes back once the panel is wide enough again, like the Network panel's. (Preact 11 doesn't add
  // "px" to numbers.)
  const paneStyle = selected
    ? {
        width: listWidth === null ? undefined : `${listWidth}px`,
        minWidth: `${LIST_MIN_WIDTH}px`,
        maxWidth: `calc(100% - ${DETAIL_MIN_WIDTH}px)`,
      }
    : undefined;

  return (
    <div class="app">
      {/* Kept mounted while closed, so the query and results are still there when it opens again. */}
      <div
        class="search-sidebar"
        ref={searchPane}
        hidden={!searchOpen}
        style={searchWidth === null ? undefined : { width: `${searchWidth}px` }}
      >
        <SearchPane rows={rows} focusSignal={searchFocus} onReveal={revealMatch} onClose={() => setSearchOpen(false)} />
      </div>
      {searchOpen && (
        <Splitter
          axis="x"
          pane={searchPane}
          min={SEARCH_MIN_WIDTH}
          max={() => (searchPane.current?.parentElement?.clientWidth ?? 0) - LIST_MIN_WIDTH - DETAIL_MIN_WIDTH}
          label="Resize search"
          onResize={setSearchWidth}
        />
      )}
      <div class="workspace">
        <div class="toolbar">
          <button
            type="button"
            class="icon-button"
            title={showList ? "Hide request list" : "Show request list"}
            aria-label={showList ? "Hide request list" : "Show request list"}
            aria-pressed={!showList}
            disabled={!selected}
            onClick={() => setListHidden(!listHidden)}
          >
            <SidebarIcon open={showList} />
          </button>
          <button type="button" class="icon-button" title="Clear" aria-label="Clear" onClick={() => store.clear()}>
            <ClearIcon />
          </button>
          <div class="separator" />
          <button
            type="button"
            class="icon-button"
            title="Search"
            aria-label="Search"
            aria-pressed={searchOpen}
            onClick={toggleSearch}
          >
            <SearchIcon />
          </button>
          <label class="filter">
            <FilterIcon />
            <input
              type="search"
              placeholder="Filter"
              aria-label="Filter by URL"
              value={filter}
              onInput={(event) => setFilter(event.currentTarget.value)}
            />
          </label>
        </div>
        <div class="main">
          {/* Always the first child, so opening a request doesn't remount the list and lose its scroll position. */}
          {showList && (
            <div class={`list-pane${selected ? " compact" : ""}`} ref={listPane} style={paneStyle}>
              {rows.length === 0 ? (
                <div class="empty">No Transit requests yet</div>
              ) : visible.length === 0 ? (
                <div class="empty">No requests match the filter</div>
              ) : (
                <RequestList
                  rows={visible}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setReveal(null);
                    setSelectedId(id);
                  }}
                  compact={selected !== null}
                />
              )}
            </div>
          )}
          {showList && selected && (
            <Splitter
              axis="x"
              pane={listPane}
              min={LIST_MIN_WIDTH}
              max={() => (listPane.current?.parentElement?.clientWidth ?? 0) - DETAIL_MIN_WIDTH}
              label="Resize request list"
              onResize={resizeList}
            />
          )}
          {selected && (
            <DetailView
              key={selected.id}
              row={selected}
              viewMode={viewMode}
              onViewMode={changeViewMode}
              viewerHeight={viewerHeight}
              onViewerHeight={setViewerHeight}
              reveal={reveal?.rowId === selected.id ? reveal : null}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
