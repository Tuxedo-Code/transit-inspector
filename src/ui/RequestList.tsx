import { useLayoutEffect, useRef } from "preact/hooks";
import { isSelectable, type RequestRow } from "../model";
import { formatSize, formatTime, requestName } from "./format";

interface Props {
  rows: readonly RequestRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** With a request open, the list narrows to the Name column, like the Network panel. */
  compact: boolean;
}

function statusText(row: RequestRow): string {
  return row.failed ? "(failed)" : String(row.status);
}

function note(row: RequestRow): string | null {
  if (row.response.kind === "msgpack") return "transit+msgpack (not supported)";
  return null;
}

export function RequestList({ rows, selectedId, onSelect, compact }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Follow new requests only when already scrolled to the bottom.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && pinnedToBottom.current) element.scrollTop = element.scrollHeight;
  }, [rows]);

  const onScroll = () => {
    const element = scroller.current;
    if (element) pinnedToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 4;
  };

  return (
    <div class="request-list" ref={scroller} onScroll={onScroll}>
      <table>
        <thead>
          <tr>
            <th class="name">Name</th>
            {!compact && (
              <>
                <th class="method">Method</th>
                <th class="status">Status</th>
                <th class="size">Size</th>
                <th class="time">Time</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selectable = isSelectable(row);
            const classes = [
              selectable ? "selectable" : "disabled",
              row.id === selectedId ? "selected" : "",
              selectable && (row.failed || row.status >= 400) ? "error" : "",
            ];
            const extra = note(row);
            return (
              <tr
                key={row.id}
                class={classes.filter(Boolean).join(" ")}
                title={row.url}
                aria-disabled={!selectable}
                onClick={selectable ? () => onSelect(row.id) : undefined}
              >
                <td class="name">
                  {requestName(row.url)}
                  {extra && <span class="note"> {extra}</span>}
                </td>
                {!compact && (
                  <>
                    <td class="method">{row.method}</td>
                    <td class="status">{statusText(row)}</td>
                    <td class="size">{row.failed ? "" : formatSize(row.size)}</td>
                    <td class="time">{formatTime(row.durationMs)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
