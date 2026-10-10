import type { RefObject } from "preact";
import { useRef } from "preact/hooks";

/** Narrowest the request list and the detail view get; the detail view keeps its Close button reachable. */
export const LIST_MIN_WIDTH = 50;
export const DETAIL_MIN_WIDTH = 30;
/** Narrowest the Search pane gets: its query field and buttons still fit. */
export const SEARCH_MIN_WIDTH = 150;

interface Props {
  /** `x` resizes the pane's width (a vertical divider), `y` its height (a horizontal one). */
  axis: "x" | "y";
  /** The pane it resizes, next to the splitter. */
  pane: RefObject<HTMLElement | null>;
  /** The pane comes after the splitter (right or below), so dragging towards it shrinks it. */
  after?: boolean;
  min: number;
  /** The largest size the pane may take, read when a drag starts. */
  max: () => number;
  label: string;
  /** Called with the new size while dragging, and with `done` set once the drag ends. */
  onResize: (size: number, done: boolean) => void;
}

/**
 * A draggable divider next to a pane. Like DevTools' own, it is an invisible 6px strip centered on the pane's border,
 * with no keyboard control.
 */
export function Splitter({ axis, pane, after = false, min, max, label, onResize }: Props) {
  const drag = useRef<{ start: number; startSize: number; size: number; max: number } | null>(null);
  const position = (event: PointerEvent) => (axis === "x" ? event.clientX : event.clientY);

  const onPointerDown = (event: PointerEvent) => {
    const element = pane.current;
    if (event.button !== 0 || !element) return;
    // Keeps the pointer events (and the cursor) on the splitter while dragging over the editors, and stops text selection.
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const rect = element.getBoundingClientRect();
    const startSize = axis === "x" ? rect.width : rect.height;
    drag.current = { start: position(event), startSize, size: startSize, max: max() };
  };

  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const delta = (position(event) - state.start) * (after ? -1 : 1);
    state.size = Math.round(Math.max(min, Math.min(state.startSize + delta, state.max)));
    onResize(state.size, false);
  };

  // Fires after pointerup and pointercancel alike.
  const onLostPointerCapture = () => {
    const state = drag.current;
    drag.current = null;
    if (state && state.size !== state.startSize) onResize(state.size, true);
  };

  return (
    <hr
      class="splitter"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onLostPointerCapture={onLostPointerCapture}
    />
  );
}
