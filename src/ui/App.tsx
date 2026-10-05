import { useEffect, useMemo, useState } from "preact/hooks";
import type { RequestRow } from "../model";
import type { RequestStore } from "../store";
import { DetailView } from "./DetailView";
import { matchesFilter } from "./format";
import { ClearIcon, FilterIcon, SidebarIcon } from "./icons";
import { RequestList } from "./RequestList";
import { loadViewMode, saveViewMode, type ViewMode } from "./settings";

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
  const showList = !(listHidden && selected);

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
        {showList &&
          (rows.length === 0 ? (
            <div class="empty">No Transit requests yet</div>
          ) : visible.length === 0 ? (
            <div class="empty">No requests match the filter</div>
          ) : (
            <RequestList rows={visible} selectedId={selectedId} onSelect={setSelectedId} compact={selected !== null} />
          ))}
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
