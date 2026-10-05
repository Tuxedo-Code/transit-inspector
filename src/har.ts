import type { Entry } from "har-format";
import { type Body, isSelectable, type RequestRow } from "./model";
import { classifyBody, shouldFetchBody } from "./transit/detect";

/** A HAR entry as Chrome produces it, including its non-standard fields. */
export type HarEntry = Entry & {
  _resourceType?: string;
  response: Entry["response"] & { _error?: string | null };
};

export interface Content {
  content: string | null;
  encoding: string;
}

/** A HAR entry plus a way to read its response body: the shape shared by DevTools and HAR files. */
export interface RawEntry {
  entry: HarEntry;
  getContent: () => Promise<Content>;
}

const LISTED_TYPES = new Set(["fetch", "xhr"]);

export function entryId(entry: HarEntry): string {
  return `${entry.startedDateTime} ${entry.request.method} ${entry.request.url}`;
}

export function isListed(entry: HarEntry): boolean {
  return LISTED_TYPES.has(entry._resourceType ?? "");
}

const BINARY_MIME = /^(image|audio|video|font)\/|^application\/(octet-stream|pdf|zip)/i;

/** Classifies a body we deliberately don't read (it can't be Transit). */
function kindWithoutReading(mimeType: string, size: number): Body["kind"] {
  const kind = classifyBody(mimeType, null);
  if (kind === "msgpack" || size <= 0) return kind;
  return BINARY_MIME.test(mimeType) ? "binary" : "text";
}

function headerValue(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
}

/** Converts a Fetch/XHR entry into a row, reading the response body only when it could be Transit. */
export async function toRow(raw: RawEntry): Promise<RequestRow> {
  const { entry } = raw;
  const failed = entry.response.status === 0 || Boolean(entry.response._error);

  const requestText = entry.request.postData?.text ?? null;
  const requestMime = entry.request.postData?.mimeType || headerValue(entry.request.headers, "content-type");
  const request: Body = { kind: classifyBody(requestMime, requestText), mimeType: requestMime, text: requestText };

  const responseMime = entry.response.content.mimeType || headerValue(entry.response.headers, "content-type");
  const response: Body = { kind: "empty", mimeType: responseMime, text: null };
  if (!failed) {
    if (shouldFetchBody(responseMime)) {
      try {
        const { content, encoding } = await raw.getContent();
        response.kind = classifyBody(responseMime, content, encoding);
        response.text = content;
      } catch {
        response.kind = "unavailable";
      }
    } else {
      response.kind = kindWithoutReading(responseMime, entry.response.content.size);
    }
  }

  const row: RequestRow = {
    id: entryId(entry),
    url: entry.request.url,
    method: entry.request.method,
    status: entry.response.status,
    statusText: entry.response.statusText,
    startedDateTime: entry.startedDateTime,
    startedMs: Date.parse(entry.startedDateTime),
    durationMs: entry.time,
    size: Math.max(entry.response.content.size, 0),
    resourceType: entry._resourceType ?? "",
    failed,
    request,
    response,
  };
  if (!isSelectable(row)) {
    row.request.text = null;
    row.response.text = null;
  }
  return row;
}
