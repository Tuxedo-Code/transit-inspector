import { useRef } from "preact/hooks";
import { lineCount } from "../edn/print";
import { CodeView } from "./CodeView";
import { formatLines } from "./format";
import { CloseIcon } from "./icons";
import { Splitter } from "./Splitter";

/** Shortest the viewer and the EDN editor above it get, each about two lines of code. */
export const VIEWER_MIN_HEIGHT = 50;
export const EDITOR_MIN_HEIGHT = 50;

interface Props {
  /** The string's `get-in` path. */
  path: string;
  /** The string itself, unescaped. */
  text: string;
  /** The height set by dragging; null for half the pane. */
  height: number | null;
  onHeight: (height: number) => void;
  onClose: () => void;
}

const NO_DIAGNOSTICS = [] as const;

/** Shows a string from the EDN pane as plain text: real line breaks and tabs, no escapes. */
export function TextViewer({ path, text, height, onHeight, onClose }: Props) {
  const viewer = useRef<HTMLDivElement>(null);
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
        label="Resize text viewer"
        onResize={onHeight}
      />
      {/* A flex basis rather than a height, so the viewer shrinks when the panel gets shorter and grows back. */}
      <div class="text-viewer" ref={viewer} style={height === null ? undefined : { flex: `0 1 ${height}px` }}>
        <div class="text-viewer-header">
          <span class="label">Text</span>
          <code class="path" title={path}>
            {path}
          </code>
          <span class="label">{formatLines(lineCount(text))}</span>
          <button type="button" class="icon-button" title="Close text" aria-label="Close text" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {text === "" ? (
          <div class="message">Empty string</div>
        ) : (
          <CodeView doc={text} language="text" wrap diagnostics={NO_DIAGNOSTICS} label="String as text" />
        )}
      </div>
    </>
  );
}
