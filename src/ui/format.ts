/** Like the Network panel's Name column: last path segment plus query string; the host for a bare "/". */
export function requestName(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  return `${segments.at(-1) ?? parsed.host}${parsed.search}`;
}

/** Like the Network panel's Size column ("0.3 kB", "12.5 kB", "340 kB", "1.2 MB"), with bytes below 100 B. */
export function formatSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 100) return `${bytes} B`;
  const kilobytes = bytes / 1000;
  if (kilobytes < 100) return `${kilobytes.toFixed(1)} kB`;
  if (kilobytes < 1000) return `${Math.round(kilobytes)} kB`;
  const megabytes = kilobytes / 1000;
  return megabytes < 100 ? `${megabytes.toFixed(1)} MB` : `${Math.round(megabytes)} MB`;
}

/** Like the Network panel's Time column: "2 ms", "1.23 s". */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Case-insensitive substring match on the full URL. */
export function matchesFilter(url: string, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  return needle === "" || url.toLowerCase().includes(needle);
}
