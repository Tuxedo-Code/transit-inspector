import { useMemo, useRef } from "preact/hooks";
import { formatPath, lineCount, type PathNode } from "../edn/print";
import { CodeView, formsOf } from "./CodeView";
import { formatLines } from "./format";
import { CloseIcon } from "./icons";
import { Splitter } from "./Splitter";
import { viewString } from "./string-view";

/** Shortest the viewer and the EDN editor above it get, each about two lines of code. */
export const VIEWER_MIN_HEIGHT = 50;
export const EDITOR_MIN_HEIGHT = 50;

interface Props {
  /** The string, from the EDN pane's path index. */
  node: PathNode;
  /** The height set by dragging; null for half the pane. */
  height: number | null;
  onHeight: (height: number) => void;
  onClose: () => void;
}

const NO_DIAGNOSTICS = [] as const;

const LABELS = { edn: "EDN", json: "JSON", text: "Text" } as const;

/**
 * Shows a string from the EDN pane without escapes: EDN or JSON it holds pretty-printed, anything else as plain text
 * with real line breaks and tabs.
 */
export function StringViewer({ node, height, onHeight, onClose }: Props) {
  const viewer = useRef<HTMLDivElement>(null);
  const view = viewString(node);
  const doc = view.kind === "edn" ? view.printed.text : view.text;
  const forms = useMemo(() => (view.kind === "edn" ? formsOf(view.printed.index) : undefined), [view]);
  const path = formatPath(node.path);
  // As tall as the viewer and the editor together allow, leaving the editor its minimum.
  const maxHeight = () => {
    const element = viewer.current;
    const editor = element?.parentElement?.querySelector(":scope > .code-view");
    return (element?.offsetHeight ?? 0) + (editor instanceof HTMLElement ? editor.offsetHeight : 0) - EDITOR_MIN_HEIGHT;
  };
  return (
    <>
      <Splitter
        axis="y"
        pane={viewer}
        after
        min={VIEWER_MIN_HEIGHT}
        max={maxHeight}
        label="Resize string viewer"
        onResize={onHeight}
      />
      {/* A flex basis rather than a height, so the viewer shrinks when the panel gets shorter and grows back. */}
      <div class="string-viewer" ref={viewer} style={height === null ? undefined : { flex: `0 1 ${height}px` }}>
        <div class="string-viewer-header">
          <span class="label">{LABELS[view.kind]}</span>
          <code class="path" title={path}>
            {path}
          </code>
          <span class="label">{formatLines(lineCount(doc))}</span>
          <button type="button" class="icon-button" title="Close string" aria-label="Close string" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {doc === "" ? (
          <div class="message">Empty string</div>
        ) : (
          <CodeView
            doc={doc}
            language={view.kind}
            // Plain text wraps like the raw pane; pretty-printed values keep their indentation, like the EDN pane.
            wrap={view.kind === "text"}
            diagnostics={NO_DIAGNOSTICS}
            forms={forms}
            label={`String as ${LABELS[view.kind]}`}
          />
        )}
      </div>
    </>
  );
}
