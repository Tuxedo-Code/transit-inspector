/**
 * What the body of a request or response turned out to be.
 * - `unavailable`: DevTools no longer holds the body (or reading it failed).
 * - `binary`: base64-encoded content we don't decode.
 */
export type BodyKind = "transit" | "msgpack" | "json" | "text" | "binary" | "empty" | "unavailable";

export interface Body {
  kind: BodyKind;
  mimeType: string;
  /** Kept only for selectable rows (see spec "Memory"); null otherwise. */
  text: string | null;
}

/** One captured Fetch/XHR request, independent of whether it came from DevTools or a HAR file. */
export interface RequestRow {
  /** Stable identity used to deduplicate: start time + method + URL. */
  id: string;
  url: string;
  method: string;
  /** 0 when the request never got a response. */
  status: number;
  statusText: string;
  startedDateTime: string;
  startedMs: number;
  durationMs: number;
  /** Response body size in bytes, as reported by the browser. */
  size: number;
  resourceType: string;
  /** Network error, CORS failure, or cancelled: no response at all. */
  failed: boolean;
  request: Body;
  response: Body;
}

/** Rows are selectable when either direction carries Transit. */
export function isSelectable(row: RequestRow): boolean {
  return row.request.kind === "transit" || row.response.kind === "transit";
}
