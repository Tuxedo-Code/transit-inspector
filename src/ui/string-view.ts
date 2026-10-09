import type { EdnNode } from "../edn/ast";
import { lineCount, type PathNode, type Printed, printEdn } from "../edn/print";
import { readEdn } from "../edn/read";
import { formatChars, formatLines } from "./format";

/** How the string viewer shows a string: EDN or JSON pretty-printed, or as plain text. */
export type StringView =
  | { kind: "edn"; printed: Printed }
  | { kind: "json"; text: string }
  | { kind: "text"; text: string };

/** Single-line strings longer than this get a chip: they run past the edge of most panes. */
export const LONG_STRING = 120;

const cache = new WeakMap<PathNode, StringView>();

/** The view of a string from the EDN pane's path index; cached, since chips and the viewer both ask. */
export function viewString(node: PathNode): StringView {
  let view = cache.get(node);
  if (!view) {
    view = computeView(node.text ?? "");
    cache.set(node, view);
  }
  return view;
}

/**
 * EDN or JSON when the string holds exactly one collection that pretty-printing makes easier to read; otherwise text.
 * JSON is tried first: some JSON also reads as EDN, wrongly (`{"a":true}` as the map `{"a" :true}`).
 */
function computeView(text: string): StringView {
  if (!looksStructured(text)) return { kind: "text", text };
  if (isJsonCollection(text)) {
    const formatted = formatJson(text);
    return readsTheSame(text, formatted) ? { kind: "text", text } : { kind: "json", text: formatted };
  }
  const read = readEdn(text);
  if (read.ok && isCollection(read.value)) {
    const printed = printEdn(read.value);
    return readsTheSame(text, printed.text) ? { kind: "text", text } : { kind: "edn", printed };
  }
  return { kind: "text", text };
}

/** The EDN pane already shows the string as it would be pretty-printed: same text, and nothing to escape. */
function readsTheSame(text: string, formatted: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters print escaped
  return formatted === text && !/["\\\u0000-\u001f]/.test(text);
}

/** Starts and ends like a collection: a cheap check that rules out almost every string before parsing. */
function looksStructured(text: string): boolean {
  const start = text.search(/\S/);
  if (start < 0 || !"{[(#".includes(text[start] as string)) return false;
  let end = text.length - 1;
  while (/\s/.test(text[end] as string)) end--;
  return "}])".includes(text[end] as string);
}

function isJsonCollection(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}

/** A collection, or a tagged one such as `#error {...}`. */
function isCollection(node: EdnNode): boolean {
  if (node.type === "tagged") return isCollection(node.value);
  return node.type === "map" || node.type === "vector" || node.type === "list" || node.type === "set";
}

/** JSON's tokens: a string, a delimiter, or a literal (number, true, false, null). */
const JSON_TOKEN = /"(?:[^"\\]|\\.)*"|[{}[\],:]|[^\s{}[\],:"]+/g;

/**
 * Re-indents valid JSON like `JSON.stringify(value, null, 2)`, but token by token, so every number and string keeps
 * the text it was sent with: big integers aren't rounded and `1.0` stays `1.0`.
 */
export function formatJson(text: string): string {
  const tokens = text.match(JSON_TOKEN) ?? [];
  const parts: string[] = [];
  let depth = 0;
  const newline = () => `\n${"  ".repeat(depth)}`;
  tokens.forEach((token, i) => {
    switch (token) {
      case "{":
      case "[": {
        const next = tokens[i + 1];
        // Empty: `{}` and `[]` stay on one line.
        if (next === "}" || next === "]") {
          parts.push(token);
          return;
        }
        depth++;
        parts.push(token, newline());
        return;
      }
      case "}":
      case "]": {
        const previous = tokens[i - 1];
        if (previous === "{" || previous === "[") {
          parts.push(token);
          return;
        }
        depth--;
        parts.push(newline(), token);
        return;
      }
      case ",":
        parts.push(",", newline());
        return;
      case ":":
        parts.push(": ");
        return;
      default:
        parts.push(token);
    }
  });
  return parts.join("");
}

/** The label of a string's chip in the EDN pane, or null for strings that read fine there. */
export function chipLabel(node: PathNode): string | null {
  const view = viewString(node);
  if (view.kind === "edn") return "EDN";
  if (view.kind === "json") return "JSON";
  const text = node.text ?? "";
  if (/[\n\r]/.test(text)) return formatLines(lineCount(text));
  if (text.length > LONG_STRING) return formatChars(text.length);
  return null;
}
