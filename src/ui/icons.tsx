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

export function FilterIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" {...stroke}>
      <path d="M3.5 5h13l-5 6v4.5l-3-1.5v-3z" stroke-linejoin="round" />
    </svg>
  );
}
