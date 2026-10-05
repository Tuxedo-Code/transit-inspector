import { useEffect, useState } from "preact/hooks";
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
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [path]);

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
          <button type="button" class="text-button" onClick={async () => setCopied(await copyText(path))}>
            {copied ? "Copied" : "Copy"}
          </button>
        </>
      )}
    </div>
  );
}
