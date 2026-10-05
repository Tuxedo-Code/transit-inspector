export type ViewMode = "edn" | "split" | "transit";

const VIEW_MODE_KEY = "transit-debugger:view-mode";
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
