import type { Diagnostic } from "@codemirror/lint";
import { useEffect, useMemo, useState } from "preact/hooks";
import { nodeAt, type PathNode, strings } from "../edn/print";
import type { RequestRow } from "../model";
import { type BodyView, type Direction, type RawView, viewBody } from "./body-view";
import { CodeView, formsOf, type StringChips } from "./CodeView";
import { CloseIcon } from "./icons";
import { PathFooter } from "./PathFooter";
import { StringViewer } from "./StringViewer";
import type { Reveal } from "./search";
import type { ViewMode } from "./settings";
import { chipLabel } from "./string-view";

interface Props {
  row: RequestRow;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  /** The string viewer's height once dragged; null for its default, half the pane. */
  viewerHeight: number | null;
  onViewerHeight: (height: number) => void;
  /** A search result in this request to show: its body is opened and the match selected. */
  reveal: Reveal | null;
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

export function DetailView({ row, viewMode, onViewMode, viewerHeight, onViewerHeight, reveal, onClose }: Props) {
  const [direction, setDirection] = useState<Direction>(() => reveal?.direction ?? initialDirection(row));
  useEffect(() => {
    if (reveal) setDirection(reveal.direction);
  }, [reveal]);
  const body = direction === "request" ? row.request : row.response;
  const view = viewBody(body, direction);
  // Until the effect above switches to its body, a result in the other body isn't this body's to show.
  const shown = reveal?.direction === direction ? reveal : null;

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
        {viewMode !== "transit" && (
          <EdnPane
            key={`${row.id}:${direction}:edn`}
            view={view}
            viewerHeight={viewerHeight}
            onViewerHeight={onViewerHeight}
            reveal={shown?.pane === "edn" ? shown : null}
          />
        )}
        {viewMode !== "edn" && (
          <RawPane key={`${row.id}:${direction}:raw`} view={view.raw} reveal={shown?.pane === "raw" ? shown : null} />
        )}
      </div>
    </div>
  );
}

function EdnPane({
  view,
  viewerHeight,
  onViewerHeight,
  reveal,
}: {
  view: BodyView;
  viewerHeight: number | null;
  onViewerHeight: (height: number) => void;
  reveal: Reveal | null;
}) {
  /** The value at the cursor; null before the cursor was placed. */
  const [node, setNode] = useState<PathNode | null>(null);
  /** The string shown in the string viewer: the last one the cursor was on since it opened. Null while closed. */
  const [shown, setShown] = useState<PathNode | null>(null);
  const { edn } = view;
  const diagnostics = useMemo<Diagnostic[]>(
    () =>
      edn.kind === "edn"
        ? edn.printed.marks.map(({ from, to, severity, message }) => ({ from, to, severity, message }))
        : [],
    [edn],
  );
  const forms = useMemo(() => (edn.kind === "edn" ? formsOf(edn.printed.index) : undefined), [edn]);
  const chips = useMemo<StringChips | undefined>(() => {
    if (edn.kind !== "edn") return undefined;
    const { index } = edn.printed;
    return {
      at: strings(index).flatMap((string) => {
        const label = chipLabel(string);
        return label ? [{ from: string.from, label }] : [];
      }),
      open: (offset) => {
        const at = nodeAt(index, offset);
        if (at?.text === undefined) return false;
        setShown(at);
        return true;
      },
    };
  }, [edn]);
  if (edn.kind === "message") return <Message text={edn.text} error={edn.error} />;
  const { index } = edn.printed;
  const onCursor = (offset: number) => {
    const at = nodeAt(index, offset);
    setNode(at);
    // While open, the viewer follows the cursor from string to string.
    if (at?.text !== undefined) setShown((current) => current && at);
  };
  return (
    <div class="pane">
      <CodeView
        doc={edn.printed.text}
        language="edn"
        diagnostics={diagnostics}
        forms={forms}
        chips={chips}
        onCursor={onCursor}
        reveal={reveal}
        label="Decoded EDN"
      />
      {shown && (
        <StringViewer node={shown} height={viewerHeight} onHeight={onViewerHeight} onClose={() => setShown(null)} />
      )}
      <PathFooter node={node} />
    </div>
  );
}

function RawPane({ view, reveal }: { view: RawView; reveal: Reveal | null }) {
  const diagnostics = useMemo<Diagnostic[]>(() => {
    if (view.kind !== "text" || !view.error) return [];
    // Underline the character at the error; for truncated input that's past the end, the last character.
    const from = Math.max(0, Math.min(view.error.position, view.text.length - 1));
    return [{ from, to: Math.min(from + 1, view.text.length), severity: "error", message: view.error.message }];
  }, [view]);
  if (view.kind === "message") return <Message text={view.text} />;
  return (
    <div class="pane">
      <CodeView doc={view.text} language="json" wrap diagnostics={diagnostics} reveal={reveal} label="Raw Transit" />
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
