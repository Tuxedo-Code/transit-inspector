import { type Printed, printEdn } from "../edn/print";
import type { Body } from "../model";
import { decodeTransit } from "../transit/decode";

export type Direction = "request" | "response";

/** What the EDN pane shows. */
export type EdnView = { kind: "edn"; printed: Printed } | { kind: "message"; text: string; error?: boolean };

/** What the raw pane shows: the body exactly as received, or a message. */
export type RawView =
  | { kind: "text"; text: string; error?: { position: number; message: string } }
  | { kind: "message"; text: string };

export interface BodyView {
  edn: EdnView;
  raw: RawView;
}

const cache = new WeakMap<Body, BodyView>();

/** Decodes a body for display; cached per body so switching tabs or rows doesn't decode again. */
export function viewBody(body: Body, direction: Direction): BodyView {
  let view = cache.get(body);
  if (!view) {
    view = computeView(body, direction);
    cache.set(body, view);
  }
  return view;
}

function computeView(body: Body, direction: Direction): BodyView {
  const both = (text: string): BodyView => ({ edn: { kind: "message", text }, raw: { kind: "message", text } });
  switch (body.kind) {
    case "empty":
      return both(direction === "request" ? "No request payload" : "No response body");
    case "unavailable":
      return both("This body is no longer available in DevTools");
    case "binary":
      return both("Binary body, not shown");
    case "msgpack":
      return both("transit+msgpack is not supported");
    case "json":
    case "text":
      return { edn: { kind: "message", text: "Not Transit" }, raw: { kind: "text", text: body.text ?? "" } };
    case "transit": {
      const text = body.text ?? "";
      const result = decodeTransit(text);
      if (result.ok) return { edn: { kind: "edn", printed: printEdn(result.value) }, raw: { kind: "text", text } };
      return {
        edn: { kind: "message", text: `Could not decode Transit: ${result.message}`, error: true },
        raw: {
          kind: "text",
          text,
          ...(result.position === undefined ? {} : { error: { position: result.position, message: result.message } }),
        },
      };
    }
  }
}
