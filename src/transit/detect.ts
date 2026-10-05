import type { BodyKind } from "../model";

const TRANSIT_MIME = /^application\/transit\+json/i;
const MSGPACK_MIME = /^application\/transit\+msgpack/i;
const JSON_MIME = /^(application|text)\/([\w.-]+\+)?json\b/i;

/** Transit markers in JSON: a cached-key map `"^ "`, a keyword `"~:`, or a tag `"~#`. */
const TRANSIT_MARKER = /"(\^ |~:|~#)/;
const SNIFF_LENGTH = 4096;

/** Response bodies worth fetching to check for Transit: Transit, JSON-like, or unlabeled. */
export function shouldFetchBody(mimeType: string): boolean {
  const mime = mimeType.trim();
  return mime === "" || mime === "x-unknown" || TRANSIT_MIME.test(mime) || JSON_MIME.test(mime);
}

/** Classifies a body by content type, falling back to sniffing the first few KB for Transit markers. */
export function classifyBody(mimeType: string, text: string | null | undefined, encoding = ""): BodyKind {
  if (MSGPACK_MIME.test(mimeType)) return "msgpack";
  if (text == null || text === "") return "empty";
  if (encoding === "base64") return "binary";
  if (TRANSIT_MIME.test(mimeType)) return "transit";
  const head = text.slice(0, SNIFF_LENGTH);
  const first = head.trimStart()[0];
  const looksLikeJson = first === "[" || first === "{";
  if (looksLikeJson && TRANSIT_MARKER.test(head)) return "transit";
  if (looksLikeJson || JSON_MIME.test(mimeType)) return "json";
  return "text";
}
