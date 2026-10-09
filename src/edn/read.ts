import type { EdnNode } from "./ast";

export type ReadResult = { ok: true; value: EdnNode } | { ok: false; message: string };

/**
 * Reads EDN text holding exactly one value, e.g. a string from a payload that carries EDN. Never throws.
 *
 * Covers EDN plus what Clojure's printer writes for data: ratios, `##Inf` and namespaced maps (`#:user{:id 1}`).
 * Unknown tags such as `#error` or `#object` become tagged values. Reader-only syntax (`#"regex"`, `#'var`, `@`, `^`,
 * `` ` ``) is not data, so it fails the read.
 */
export function readEdn(text: string): ReadResult {
  const reader = new Reader(text);
  try {
    const value = reader.form();
    if (value === END) throw new ReadError("Expected a value");
    // A stray closing delimiter also ends `form`, so check that all of the input was read.
    if (reader.form() !== END || !reader.done()) throw new ReadError("More than one value");
    return { ok: true, value };
  } catch (error) {
    // A RangeError is the stack running out on very deep nesting.
    if (error instanceof ReadError || error instanceof RangeError) return { ok: false, message: error.message };
    throw error;
  }
}

class ReadError extends Error {}

/** No more values: the end of the input, or a closing delimiter (which the caller checks). */
const END = Symbol("end");

const WHITESPACE = /[\s,]/;
/** Ends a token (number, symbol, keyword, character name). */
const DELIMITER = /[\s,()[\]{}";]/;

const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

const CHAR_NAMES: Record<string, string> = {
  newline: "\n",
  space: " ",
  tab: "\t",
  return: "\r",
  backspace: "\b",
  formfeed: "\f",
};

const STRING_ESCAPES: Record<string, string> = { t: "\t", r: "\r", n: "\n", "\\": "\\", '"': '"', b: "\b", f: "\f" };

class Reader {
  private pos = 0;

  constructor(private readonly text: string) {}

  done(): boolean {
    return this.pos >= this.text.length;
  }

  /** The next value, or END at the end of the input or before a closing delimiter. */
  form(): EdnNode | typeof END {
    for (;;) {
      this.skipWhitespace();
      const c = this.text[this.pos];
      if (c === undefined || c === ")" || c === "]" || c === "}") return END;
      if (c === "#" && this.text[this.pos + 1] === "_") {
        this.pos += 2;
        this.required();
        continue;
      }
      return this.value(c);
    }
  }

  private value(c: string): EdnNode {
    switch (c) {
      case "(":
        return { type: "list", items: this.items(c) };
      case "[":
        return { type: "vector", items: this.items(c) };
      case "{":
        return { type: "map", entries: pairs(this.items(c)) };
      case '"':
        return { type: "string", value: this.string() };
      case "\\":
        return { type: "char", value: this.char() };
      case "#":
        return this.dispatch();
      default:
        return this.atom(this.token());
    }
  }

  /** A value that must be there, e.g. after a tag. */
  private required(): EdnNode {
    const value = this.form();
    if (value === END) throw new ReadError(`Expected a value at ${this.pos}`);
    return value;
  }

  /** The values up to the closing delimiter of the collection opened at `pos`. */
  private items(open: string): EdnNode[] {
    const close = CLOSERS[open] ?? "}";
    this.pos += open === "#" ? 2 : 1;
    const items: EdnNode[] = [];
    for (;;) {
      const item = this.form();
      if (item !== END) {
        items.push(item);
        continue;
      }
      if (this.text[this.pos] !== close) throw new ReadError(`Expected ${close} at ${this.pos}`);
      this.pos++;
      return items;
    }
  }

  private dispatch(): EdnNode {
    const next = this.text[this.pos + 1];
    if (next === "{") return { type: "set", items: this.items("#") };
    if (next === "#") {
      this.pos += 2;
      const name = this.token();
      if (name === "Inf") return { type: "float", value: Number.POSITIVE_INFINITY };
      if (name === "-Inf") return { type: "float", value: Number.NEGATIVE_INFINITY };
      if (name === "NaN") return { type: "float", value: Number.NaN };
      throw new ReadError(`Unknown symbolic value ##${name}`);
    }
    if (next === ":") {
      this.pos += 2;
      return this.namespacedMap(this.token());
    }
    if (next === undefined || !/[A-Za-z]/.test(next)) throw new ReadError(`Unsupported #${next ?? ""} at ${this.pos}`);
    this.pos++;
    const tag = this.token();
    const value = this.required();
    if (tag === "inst" && value.type === "string") return { type: "inst", value: value.value };
    if (tag === "uuid" && value.type === "string") return { type: "uuid", value: value.value };
    return { type: "tagged", tag, value };
  }

  /** `#:user{:id 1 :_/raw 2}` is `{:user/id 1 :raw 2}`: unqualified keys get the namespace, `_/` drops it. */
  private namespacedMap(namespace: string): EdnNode {
    if (namespace === "" || this.text[this.pos] !== "{") throw new ReadError(`Expected a map after #:${namespace}`);
    const qualify = (key: EdnNode): EdnNode => {
      if (key.type !== "keyword" && key.type !== "symbol") return key;
      if (key.value.startsWith("_/")) return { ...key, value: key.value.slice(2) };
      return key.value.includes("/") ? key : { ...key, value: `${namespace}/${key.value}` };
    };
    return { type: "map", entries: pairs(this.items("{")).map(([key, value]) => [qualify(key), value]) };
  }

  private string(): string {
    let value = "";
    let start = ++this.pos;
    for (;;) {
      const c = this.text[this.pos];
      if (c === undefined) throw new ReadError("Unterminated string");
      if (c === '"') {
        value += this.text.slice(start, this.pos++);
        return value;
      }
      if (c !== "\\") {
        this.pos++;
        continue;
      }
      value += this.text.slice(start, this.pos);
      const escaped = this.text[this.pos + 1] ?? "";
      if (escaped === "u") {
        const hex = this.text.slice(this.pos + 2, this.pos + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new ReadError(`Bad \\u escape at ${this.pos}`);
        value += String.fromCharCode(Number.parseInt(hex, 16));
        this.pos += 6;
      } else {
        const unescaped = STRING_ESCAPES[escaped];
        if (unescaped === undefined) throw new ReadError(`Unknown escape \\${escaped} at ${this.pos}`);
        value += unescaped;
        this.pos += 2;
      }
      start = this.pos;
    }
  }

  /** `\a`, `\(`, `\newline`, `é`: the first character is taken whatever it is, so `\(` is a char. */
  private char(): string {
    const start = ++this.pos;
    if (this.pos >= this.text.length) throw new ReadError("Character name missing");
    this.pos++;
    while (this.pos < this.text.length && !DELIMITER.test(this.text[this.pos] as string)) this.pos++;
    const name = this.text.slice(start, this.pos);
    if ([...name].length === 1) return name;
    const named = CHAR_NAMES[name];
    if (named !== undefined) return named;
    if (/^u[0-9a-fA-F]{4}$/.test(name)) return String.fromCharCode(Number.parseInt(name.slice(1), 16));
    throw new ReadError(`Unknown character \\${name}`);
  }

  private token(): string {
    const start = this.pos;
    while (this.pos < this.text.length && !DELIMITER.test(this.text[this.pos] as string)) this.pos++;
    if (this.pos === start) throw new ReadError(`Unexpected ${this.text[this.pos]} at ${this.pos}`);
    return this.text.slice(start, this.pos);
  }

  private atom(token: string): EdnNode {
    if (/^[+-]?\d/.test(token)) return number(token);
    if (token === "nil") return { type: "nil" };
    if (token === "true" || token === "false") return { type: "boolean", value: token === "true" };
    if (token.startsWith(":")) {
      const name = token.slice(1);
      if (name === "" || name.startsWith(":") || name.endsWith("/")) throw new ReadError(`Invalid keyword ${token}`);
      return { type: "keyword", value: name };
    }
    if (/^['`~@^]/.test(token)) throw new ReadError(`Reader syntax ${token} is not data`);
    return { type: "symbol", value: token };
  }

  private skipWhitespace(): void {
    for (;;) {
      const c = this.text[this.pos];
      if (c === ";") {
        while (this.pos < this.text.length && this.text[this.pos] !== "\n") this.pos++;
      } else if (c !== undefined && WHITESPACE.test(c)) {
        this.pos++;
      } else {
        return;
      }
    }
  }
}

function pairs(items: EdnNode[]): [EdnNode, EdnNode][] {
  if (items.length % 2 !== 0) throw new ReadError("A map needs an even number of forms");
  const entries: [EdnNode, EdnNode][] = [];
  for (let i = 0; i < items.length; i += 2) entries.push([items[i] as EdnNode, items[i + 1] as EdnNode]);
  return entries;
}

/**
 * Integers keep their exact digits. Hex ones, like the identity hashes in Clojure's `#object[Foo 0x1a2b ...]`, stay
 * as written. Leading zeros (octal in Clojure) and other radixes are not read.
 */
function number(token: string): EdnNode {
  let match = /^([+-]?)(0|[1-9]\d*|0[xX][0-9a-fA-F]+)(N?)$/.exec(token);
  if (match) {
    const digits = `${match[1] === "-" ? "-" : ""}${match[2]}`;
    return match[3] ? { type: "bigint", value: digits } : { type: "integer", value: digits };
  }
  match = /^([+-]?(?:0|[1-9]\d*))\/([1-9]\d*)$/.exec(token);
  if (match)
    return { type: "ratio", numerator: (match[1] as string).replace(/^\+/, ""), denominator: match[2] as string };
  match = /^[+-]?(?:0|[1-9]\d*)(?:\.\d*)?(?:[eE][+-]?\d+)?(M?)$/.exec(token);
  if (match) {
    const text = token.replace(/^\+/, "");
    return match[1] ? { type: "bigdec", value: text.slice(0, -1) } : { type: "float", value: Number(text), text };
  }
  throw new ReadError(`Invalid number ${token}`);
}
