import { useState } from "preact/hooks";
import { formatPath, type PathNode, pathAt } from "../edn/print";
import { copyText } from "./clipboard";

interface Props {
  index: PathNode;
  /** Cursor offset in the EDN pane; -1 before the cursor was placed. */
  offset: number;
}

/** Shows the `get-in` path of the value at the cursor, with a Copy button. */
export function PathFooter({ index, offset }: Props) {
  const steps = offset < 0 ? null : pathAt(index, offset);
  const path = steps ? formatPath(steps) : null;
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
            {copied ? "Copied" : "Copy"}
          </button>
        </>
      )}
    </div>
  );
}
