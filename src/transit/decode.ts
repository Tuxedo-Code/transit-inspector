import transit from "transit-js";
import type { EdnNode } from "../edn/ast";

export type DecodeResult =
  | { ok: true; value: EdnNode }
  | { ok: false; message: string /** Offset in the raw text, when the JSON parser reports one. */; position?: number };

// transit-js builds its own map/set/list types (hash-ordered). These markers keep wire order instead.
class OrderedMap {
  constructor(readonly entries: [unknown, unknown][]) {}
}
class Collection {
  constructor(
    readonly kind: "set" | "list",
    readonly items: unknown[],
  ) {}
}
class Char {
  constructor(readonly value: string) {}
}

function pairs(flat: unknown[]): [unknown, unknown][] {
  const out: [unknown, unknown][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

const reader = transit.reader("json", {
  mapBuilder: {
    init: () => [] as [unknown, unknown][],
    add: (entries: [unknown, unknown][], key: unknown, value: unknown) => {
      entries.push([key, value]);
      return entries;
    },
    finalize: (entries: [unknown, unknown][]) => new OrderedMap(entries),
  },
  handlers: {
    set: (rep: unknown[]) => new Collection("set", rep),
    list: (rep: unknown[]) => new Collection("list", rep),
    cmap: (rep: unknown[]) => new OrderedMap(pairs(rep)),
    c: (rep: string) => new Char(rep),
  },
});

const KNOWN_TAGS = new Set(["link", "b"]);

/** Decodes Transit JSON into an EDN tree. Never throws. */
export function decodeTransit(text: string): DecodeResult {
  let decoded: unknown;
  try {
    decoded = reader.read(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = /at position (\d+)/.exec(message)?.[1];
    return { ok: false, message, ...(position ? { position: Number(position) } : {}) };
  }
  return { ok: true, value: toNode(decoded) };
}

function toNode(value: unknown): EdnNode {
  if (value === null || value === undefined) return { type: "nil" };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value === "string") return { type: "string", value };
  if (typeof value === "number") return numberNode(value);
  if (Array.isArray(value)) return { type: "vector", items: value.map(toNode) };
  if (value instanceof OrderedMap)
    return { type: "map", entries: value.entries.map(([k, v]) => [toNode(k), toNode(v)]) };
  if (value instanceof Collection) return { type: value.kind, items: value.items.map(toNode) };
  if (value instanceof Char) return { type: "char", value: value.value };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { type: "inst", value: "invalid", problem: { severity: "error", message: "Invalid date" } }
      : { type: "inst", value: value.toISOString() };
  }
  if (transit.isKeyword(value)) return { type: "keyword", value: String(value).replace(/^:/, "") };
  if (transit.isSymbol(value)) return { type: "symbol", value: String(value) };
  if (transit.isUUID(value)) return { type: "uuid", value: String(value) };
  if (transit.isInteger(value)) return { type: "integer", value: String(value) };
  if (transit.isBigInt(value)) return { type: "bigint", value: (value as { rep: string }).rep };
  if (transit.isBigDec(value)) return { type: "bigdec", value: (value as { rep: string }).rep };
  if (transit.isURI(value)) return { type: "uri", value: (value as { rep: string }).rep };
  if (transit.isTaggedValue(value)) {
    const { tag, rep } = value as { tag: string; rep: unknown };
    if (tag === "ratio") {
      const ratio = ratioNode(rep);
      if (ratio) return ratio;
    }
    const node: EdnNode = { type: "tagged", tag, value: toNode(rep) };
    if (!KNOWN_TAGS.has(tag))
      node.problem = { severity: "warning", message: `Unknown Transit tag "${tag}": shown as #${tag}` };
    return node;
  }
  return {
    type: "string",
    value: String(value),
    problem: { severity: "warning", message: "Unrecognized decoded value, shown as a string" },
  };
}

function numberNode(value: number): EdnNode {
  if (!Number.isInteger(value)) return { type: "float", value };
  const node: EdnNode = { type: "integer", value: String(value) };
  if (!Number.isSafeInteger(value)) {
    node.problem = {
      severity: "warning",
      message: "Integer above 2^53 sent as a plain JSON number: it may have lost precision before reaching here",
    };
  }
  return node;
}

function ratioNode(rep: unknown): EdnNode | null {
  if (!Array.isArray(rep) || rep.length !== 2) return null;
  const [n, d] = rep.map((part) =>
    transit.isBigInt(part) ? (part as { rep: string }).rep : typeof part === "number" ? String(part) : null,
  );
  return n && d ? { type: "ratio", numerator: n, denominator: d } : null;
}
