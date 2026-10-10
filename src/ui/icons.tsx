// Small inline icons in the style of DevTools' toolbar icons (20px box, currentColor).
// Decorative: the buttons around them carry the labels.

const stroke = { fill: "none", stroke: "currentColor", "stroke-width": 1.5 } as const;

export function ClearIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" {...stroke}>
      <circle cx="10" cy="10" r="6.25" />
      <path d="M5.6 14.4 14.4 5.6" />
    </svg>
  );
}

export function SidebarIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" {...stroke}>
      <rect x="3.75" y="4.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M8.25 4.75v10.5" />
      {open ? <path d="M13.5 8 11.5 10l2 2" /> : <path d="M11.5 8l2 2-2 2" />}
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" {...stroke}>
      <path d="M6 6l8 8M14 6l-8 8" />
    </svg>
  );
}

export function SearchIcon({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" {...stroke}>
      <circle cx="8.5" cy="8.5" r="4.75" />
      <path d="m12 12 4.25 4.25" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" {...stroke}>
      <path d="M15.25 10a5.25 5.25 0 1 1-1.54-3.71" />
      <path d="M14.5 3.5v3.25h-3.25" stroke-linejoin="round" />
    </svg>
  );
}

/** The filled "x" inside a text field that clears it, like DevTools' search fields. */
export function ClearFieldIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14">
      <circle cx="7" cy="7" r="6" fill="currentColor" />
      <path d="m4.75 4.75 4.5 4.5m0-4.5-4.5 4.5" fill="none" stroke="var(--bg)" stroke-width="1.5" />
    </svg>
  );
}

/** A tree item's disclosure triangle, pointing down when expanded. */
export function DisclosureIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg aria-hidden="true" width="15" height="16" viewBox="0 0 15 16" fill="currentColor">
      {expanded ? <path d="M4 6.5h7L7.5 10z" /> : <path d="M6 4.5v7L9.5 8z" />}
    </svg>
  );
}

export function FilterIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" {...stroke}>
      <path d="M3.5 5h13l-5 6v4.5l-3-1.5v-3z" stroke-linejoin="round" />
    </svg>
  );
}
