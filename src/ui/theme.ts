type Panels = typeof chrome.devtools.panels & {
  setThemeChangeHandler?: (callback: (themeName: string) => void) => void;
};

/**
 * Follows the DevTools theme ("default" is light, "dark" is dark), including live changes.
 * Outside DevTools (development, tests) nothing is set and the CSS falls back to prefers-color-scheme.
 */
export function followDevtoolsTheme(): void {
  const panels = (globalThis.chrome?.devtools?.panels ?? null) as Panels | null;
  if (!panels) return;
  const apply = (themeName: string) => {
    document.documentElement.dataset.theme = themeName === "dark" ? "dark" : "light";
  };
  apply(panels.themeName);
  panels.setThemeChangeHandler?.(apply);
}
