import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { RequestRow } from "../model";
import type { RequestStore } from "../store";
import { DetailView } from "./DetailView";
import { matchesFilter } from "./format";
import { ClearIcon, FilterIcon, SidebarIcon } from "./icons";
import { RequestList } from "./RequestList";
import { DETAIL_MIN_WIDTH, LIST_MIN_WIDTH, Splitter } from "./Splitter";
import { loadListWidth, loadViewMode, saveListWidth, saveViewMode, type ViewMode } from "./settings";

function useRows(store: RequestStore): readonly RequestRow[] {
  const [rows, setRows] = useState(store.getRows());
  useEffect(() => store.subscribe(setRows), [store]);
  return rows;
}

export function App({ store }: { store: RequestStore }) {
  const rows = useRows(store);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listHidden, setListHidden] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [listWidth, setListWidth] = useState(loadListWidth);
  const listPane = useRef<HTMLDivElement>(null);

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
                onSelect={setSelectedId}
                compact={selected !== null}
              />
            )}
          </div>
        )}
        {showList && selected && <Splitter pane={listPane} onResize={resizeList} />}
        {selected && (
          <DetailView
            key={selected.id}
            row={selected}
            viewMode={viewMode}
            onViewMode={changeViewMode}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
