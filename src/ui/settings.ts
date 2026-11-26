export type ViewMode = "edn" | "split" | "transit";

const VIEW_MODE_KEY = "transit-inspector:view-mode";
const VIEW_MODES: readonly ViewMode[] = ["edn", "split", "transit"];

/** The remembered view mode; EDN only by default. Storage can be unavailable, so failures fall back silently. */
export function loadViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return VIEW_MODES.find((mode) => mode === stored) ?? "edn";
  } catch {
    return "edn";
  }
}

export function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Not remembering the choice is acceptable.
  }
}

const KEEP_LOG_KEY = "transit-inspector:keep-log";

/** The "Keep log" checkbox; off by default, like the Network panel's. */
export function loadKeepLog(): boolean {
  try {
    return localStorage.getItem(KEEP_LOG_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveKeepLog(keep: boolean): void {
  try {
    localStorage.setItem(KEEP_LOG_KEY, String(keep));
  } catch {
    // Not remembering the checkbox is acceptable.
  }
}

const LIST_WIDTH_KEY = "transit-inspector:list-width";

/** The request list width (px) last set by dragging the splitter; null until the user resizes it. */
export function loadListWidth(): number | null {
  try {
    const stored = Number(localStorage.getItem(LIST_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function saveListWidth(width: number): void {
  try {
    localStorage.setItem(LIST_WIDTH_KEY, String(width));
  } catch {
    // Not remembering the width is acceptable.
  }
}
