import type { Diagnostic } from "@codemirror/lint";
import { useMemo, useState } from "preact/hooks";
import type { RequestRow } from "../model";
import { type BodyView, type Direction, type RawView, viewBody } from "./body-view";
import { CodeView } from "./CodeView";
import { CloseIcon } from "./icons";
import { PathFooter } from "./PathFooter";
import type { ViewMode } from "./settings";

interface Props {
  row: RequestRow;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  onClose: () => void;
}

// Named like the Network panel's own detail tabs.
const DIRECTIONS: { id: Direction; label: string }[] = [
  { id: "request", label: "Payload" },
  { id: "response", label: "Response" },
];

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "edn", label: "EDN" },
  { id: "split", label: "Side by side" },
  { id: "transit", label: "Transit" },
];

/** Open the side that carries Transit; the response when both do. */
function initialDirection(row: RequestRow): Direction {
  return row.response.kind !== "transit" && row.request.kind === "transit" ? "request" : "response";
}

export function DetailView({ row, viewMode, onViewMode, onClose }: Props) {
  const [direction, setDirection] = useState<Direction>(() => initialDirection(row));
  const body = direction === "request" ? row.request : row.response;
  const view = viewBody(body, direction);

  return (
    <div class="detail">
      <div class="tab-bar" role="tablist">
        <button type="button" class="icon-button" title="Close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
        {DIRECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            class={`tab${id === direction ? " selected" : ""}`}
            aria-selected={id === direction}
            onClick={() => setDirection(id)}
          >
            {label}
          </button>
        ))}
        <div class="spacer" />
        <div class="segmented">
          {VIEW_MODES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              class={id === viewMode ? "selected" : ""}
              aria-pressed={id === viewMode}
              onClick={() => onViewMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div class="summary">
        <span class="method">{row.method}</span>
        <span class="url">{row.url}</span>
        <span class={`status${row.failed || row.status >= 400 ? " error" : ""}`}>
          {row.failed ? "(failed)" : `${row.status} ${row.statusText}`.trim()}
        </span>
      </div>
      <div class={`panes ${viewMode}`}>
        {viewMode !== "transit" && <EdnPane key={`${row.id}:${direction}:edn`} view={view} />}
        {viewMode !== "edn" && <RawPane key={`${row.id}:${direction}:raw`} view={view.raw} />}
      </div>
    </div>
  );
}

function EdnPane({ view }: { view: BodyView }) {
  const [offset, setOffset] = useState(-1);
  const { edn } = view;
  const diagnostics = useMemo<Diagnostic[]>(
    () =>
      edn.kind === "edn"
        ? edn.printed.marks.map(({ from, to, severity, message }) => ({ from, to, severity, message }))
        : [],
    [edn],
  );
  if (edn.kind === "message") return <Message text={edn.text} error={edn.error} />;
  return (
    <div class="pane">
      <CodeView
        doc={edn.printed.text}
        language="edn"
        diagnostics={diagnostics}
        onCursor={setOffset}
        label="Decoded EDN"
      />
      <PathFooter index={edn.printed.index} offset={offset} />
    </div>
  );
}

function RawPane({ view }: { view: RawView }) {
  const diagnostics = useMemo<Diagnostic[]>(() => {
    if (view.kind !== "text" || !view.error) return [];
    // Underline the character at the error; for truncated input that's past the end, the last character.
    const from = Math.max(0, Math.min(view.error.position, view.text.length - 1));
    return [{ from, to: Math.min(from + 1, view.text.length), severity: "error", message: view.error.message }];
  }, [view]);
  if (view.kind === "message") return <Message text={view.text} />;
  return (
    <div class="pane">
      <CodeView doc={view.text} language="json" wrap diagnostics={diagnostics} label="Raw Transit" />
    </div>
  );
}

function Message({ text, error = false }: { text: string; error?: boolean | undefined }) {
  return (
    <div class="pane">
      <div class={`message${error ? " error" : ""}`}>{text}</div>
    </div>
  );
}
