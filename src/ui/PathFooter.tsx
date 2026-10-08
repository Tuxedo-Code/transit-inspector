import { useState } from "preact/hooks";
import { formatPath, type PathNode } from "../edn/print";
import { copyText } from "./clipboard";

interface Props {
  /** The value at the cursor; null when the cursor isn't on one, or wasn't placed yet. */
  node: PathNode | null;
  /** Given while the text viewer is closed: opens it, offered when the cursor is on a string. */
  onShowText?: (() => void) | undefined;
}

/** Shows the `get-in` path of the value at the cursor, with a Copy button. */
export function PathFooter({ node, onShowText }: Props) {
  const path = node ? formatPath(node.path) : null;
  // The path last copied rather than a flag reset by an effect: effects run after the next frame, so a reset could
  // land after a quick click and undo its "Copied".
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const copied = path !== null && path === copiedPath;

  return (
    <div class="path-footer">
      {path === null ? (
        <span class="hint">Place the cursor on a value to see its path</span>
      ) : (
        <>
          <span class="label">Path</span>
          <code class="path" title={path}>
            {path}
          </code>
          <button
            type="button"
            class="text-button"
            onClick={async () => setCopiedPath((await copyText(path)) ? path : null)}
          >
            {copied ? "Copied" : "Copy path"}
          </button>
          {node?.text !== undefined && onShowText && (
            <button type="button" class="text-button" onClick={onShowText}>
              Show text
            </button>
          )}
        </>
      )}
    </div>
  );
}
