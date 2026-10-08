import { lineCount } from "../edn/print";
import { CodeView } from "./CodeView";
import { formatLines } from "./format";
import { CloseIcon } from "./icons";

interface Props {
  /** The string's `get-in` path. */
  path: string;
  /** The string itself, unescaped. */
  text: string;
  onClose: () => void;
}

const NO_DIAGNOSTICS = [] as const;

/** Shows a string from the EDN pane as plain text: real line breaks and tabs, no escapes. */
export function TextViewer({ path, text, onClose }: Props) {
  return (
    <div class="text-viewer">
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
  );
}
