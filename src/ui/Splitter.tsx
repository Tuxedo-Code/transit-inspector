import type { RefObject } from "preact";
import { useRef } from "preact/hooks";

/** Narrowest the request list and the detail view get; the detail view keeps its Close button reachable. */
export const LIST_MIN_WIDTH = 50;
export const DETAIL_MIN_WIDTH = 30;

interface Props {
  /** The request list pane, left of the splitter. */
  pane: RefObject<HTMLElement | null>;
  /** Called with the new list width while dragging, and with `done` set once the drag ends. */
  onResize: (width: number, done: boolean) => void;
}

/**
 * The draggable divider between the request list and the detail view. Like the Network panel's, it is an invisible
 * 6px strip centered on the list's border, with no keyboard control.
 */
export function Splitter({ pane, onResize }: Props) {
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null);

  const onPointerDown = (event: PointerEvent) => {
    const element = pane.current;
    if (event.button !== 0 || !element) return;
    // Keeps the pointer events (and the cursor) on the splitter while dragging over the editors, and stops text selection.
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const startWidth = element.getBoundingClientRect().width;
    drag.current = { startX: event.clientX, startWidth, width: startWidth };
  };

  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current;
    const container = pane.current?.parentElement;
    if (!state || !container) return;
    const max = container.clientWidth - DETAIL_MIN_WIDTH;
    state.width = Math.round(Math.max(LIST_MIN_WIDTH, Math.min(state.startWidth + event.clientX - state.startX, max)));
    onResize(state.width, false);
  };

  // Fires after pointerup and pointercancel alike.
  const onLostPointerCapture = () => {
    const state = drag.current;
    drag.current = null;
    if (state && state.width !== state.startWidth) onResize(state.width, true);
  };

  return (
    <hr
      class="splitter"
      aria-orientation="vertical"
      aria-label="Resize request list"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onLostPointerCapture={onLostPointerCapture}
    />
  );
}
