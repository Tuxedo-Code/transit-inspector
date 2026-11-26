import { ClearIcon, FilterIcon, SearchIcon, SidebarIcon } from "./icons";

interface Props {
  /** Whether the request list is shown; it can be hidden only while a request is open. */
  showList: boolean;
  canHideList: boolean;
  onToggleList: () => void;
  onClear: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  keepLog: boolean;
  onKeepLog: (keep: boolean) => void;
  filter: string;
  onFilter: (filter: string) => void;
}

export function Toolbar(props: Props) {
  const listLabel = props.showList ? "Hide request list" : "Show request list";
  return (
    <div class="toolbar">
      <button
        type="button"
        class="icon-button"
        title={listLabel}
        aria-label={listLabel}
        aria-pressed={!props.showList}
        disabled={!props.canHideList}
        onClick={props.onToggleList}
      >
        <SidebarIcon open={props.showList} />
      </button>
      <button type="button" class="icon-button" title="Clear" aria-label="Clear" onClick={props.onClear}>
        <ClearIcon />
      </button>
      <div class="separator" />
      <button
        type="button"
        class="icon-button"
        title="Search"
        aria-label="Search"
        aria-pressed={props.searchOpen}
        onClick={props.onToggleSearch}
      >
        <SearchIcon />
      </button>
      <div class="separator" />
      {/* Named, placed and worded like the Network panel's (Chrome 154). */}
      <label class="checkbox" title="Don’t clear the list on page reload / navigation">
        <input
          type="checkbox"
          checked={props.keepLog}
          onChange={(event) => props.onKeepLog(event.currentTarget.checked)}
        />
        Keep log
      </label>
      <div class="separator" />
      <label class="filter">
        <FilterIcon />
        <input
          type="search"
          placeholder="Filter"
          aria-label="Filter by URL"
          value={props.filter}
          onInput={(event) => props.onFilter(event.currentTarget.value)}
        />
      </label>
    </div>
  );
}
