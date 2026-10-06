import type { EdnNode, Problem } from "./ast";

/** A step into a collection: a map key, a set element, or a vector/list position. */
export type PathStep = EdnNode | number;

/** Text range of a printed value and its path; children are the ranges of nested values, in order. */
export interface PathNode {
  from: number;
  to: number;
  path: PathStep[];
  children: PathNode[];
  /** Collections only: the opening delimiter's length (2 for `#{`). The closing one is always one character. */
  open?: number;
}

export interface Range {
  from: number;
  to: number;
}

export interface Mark extends Problem {
  from: number;
  to: number;
}

export interface Printed {
  text: string;
  index: PathNode;
  marks: Mark[];
}

const WIDTH = 80;

/** Pretty-prints an EDN tree, recording each value's range and path. Collections that fit on one line stay flat. */
export function printEdn(node: EdnNode): Printed {
  const printer = new Printer();
  const index = printer.node(node, [], false);
  return { text: printer.text(), index, marks: printer.marks };
}

/** Prints a value on one line, e.g. for showing a path step. */
export function printFlat(node: EdnNode): string {
  const printer = new Printer();
  printer.node(node, [], true);
  return printer.text();
}

/** Formats a path as a `get-in` vector, e.g. `[:user/orders 0 :order/id]`. */
export function formatPath(path: PathStep[]): string {
  return `[${path.map((step) => (typeof step === "number" ? String(step) : printFlat(step))).join(" ")}]`;
}

/** The path of the innermost value at a text offset; null outside any value. */
export function pathAt(index: PathNode, offset: number): PathStep[] | null {
  if (offset < index.from || offset > index.to) return null;
  let node = index;
  for (;;) {
    const child = childAt(node.children, offset);
    if (!child) return node.path;
    node = child;
  }
}

/**
 * The collection whose opening or closing delimiter is the character at `offset`, e.g. to select a form by
 * double-clicking a bracket; null for any other character, including brackets inside strings.
 */
export function formAt(index: PathNode, offset: number): Range | null {
  let node: PathNode | null = index;
  while (node && node.from <= offset && offset < node.to) {
    if (node.open && (offset < node.from + node.open || offset === node.to - 1)) return node;
    const child = lastStartingAtOrBefore(node.children, offset);
    node = child && offset < child.to ? child : null;
  }
  return null;
}

/** The smallest value strictly larger than the range that contains it, e.g. to expand a selection; null at the top. */
export function enclosingForm(index: PathNode, from: number, to: number): Range | null {
  let found: Range | null = null;
  let node: PathNode | null = index;
  while (node && node.from <= from && to <= node.to) {
    if (node.to - node.from > to - from) found = node;
    const child = lastStartingAtOrBefore(node.children, from);
    node = child && to <= child.to ? child : null;
  }
  return found;
}

function childAt(children: PathNode[], offset: number): PathNode | null {
  const found = lastStartingAtOrBefore(children, offset);
  return found && offset <= found.to ? found : null;
}

/** Children are in text order, so binary search for the last one starting at or before `offset`. */
function lastStartingAtOrBefore(children: PathNode[], offset: number): PathNode | null {
  let lo = 0;
  let hi = children.length - 1;
  let found: PathNode | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const child = children[mid] as PathNode;
    if (child.from <= offset) {
      found = child;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

class Printer {
  private readonly chunks: string[] = [];
  private offset = 0;
  private column = 0;
  readonly marks: Mark[] = [];

  text(): string {
    return this.chunks.join("");
  }

  node(node: EdnNode, path: PathStep[], flat: boolean): PathNode {
    const from = this.offset;
    const children: PathNode[] = [];
    let open: number | undefined;
    switch (node.type) {
      case "map":
        this.map(node, path, flat || this.fits(node), children);
        open = 1;
        break;
      case "vector":
      case "list":
      case "set":
        this.sequence(node, path, flat || this.fits(node), children);
        open = BRACKETS[node.type][0].length;
        break;
      case "tagged":
        this.emit(`#${node.tag} `);
        children.push(this.node(node.value, path, flat));
        break;
      default:
        this.emit(scalar(node));
    }
    if (node.problem) this.marks.push({ ...node.problem, from, to: this.offset });
    return open ? { from, to: this.offset, path, children, open } : { from, to: this.offset, path, children };
  }

  private map(node: Extract<EdnNode, { type: "map" }>, path: PathStep[], flat: boolean, children: PathNode[]): void {
    this.emit("{");
    const indent = this.column;
    node.entries.forEach(([key, value], i) => {
      if (i > 0) flat ? this.emit(" ") : this.newline(indent);
      const entryPath = [...path, key];
      children.push(this.node(key, entryPath, flat));
      this.emit(" ");
      children.push(this.node(value, entryPath, flat));
    });
    this.emit("}");
  }

  private sequence(
    node: Extract<EdnNode, { type: "vector" | "list" | "set" }>,
    path: PathStep[],
    flat: boolean,
    children: PathNode[],
  ): void {
    const [open, close] = BRACKETS[node.type];
    this.emit(open);
    const indent = this.column;
    node.items.forEach((item, i) => {
      if (i > 0) flat ? this.emit(" ") : this.newline(indent);
      children.push(this.node(item, [...path, node.type === "set" ? item : i], flat));
    });
    this.emit(close);
  }

  /** Whether the node printed flat fits in the rest of the line. Stops counting once over budget. */
  private fits(node: EdnNode): boolean {
    let budget = WIDTH - this.column;
    const visit = (n: EdnNode): boolean => {
      switch (n.type) {
        case "map":
          budget -= 2 + Math.max(0, n.entries.length * 2 - 1);
          return budget >= 0 && n.entries.every(([k, v]) => visit(k) && visit(v));
        case "vector":
        case "list":
        case "set":
          budget -= BRACKETS[n.type][0].length + 1 + Math.max(0, n.items.length - 1);
          return budget >= 0 && n.items.every(visit);
        case "tagged":
          budget -= n.tag.length + 2;
          return budget >= 0 && visit(n.value);
        default:
          budget -= scalar(n).length;
          return budget >= 0;
      }
    };
    return visit(node);
  }

  private emit(text: string): void {
    this.chunks.push(text);
    this.offset += text.length;
    this.column += text.length;
  }

  private newline(indent: number): void {
    const text = `\n${" ".repeat(indent)}`;
    this.chunks.push(text);
    this.offset += text.length;
    this.column = indent;
  }
}

const BRACKETS = { vector: ["[", "]"], list: ["(", ")"], set: ["#{", "}"] } as const;

const CHAR_NAMES: Record<string, string> = {
  "\n": "newline",
  " ": "space",
  "\t": "tab",
  "\r": "return",
  "\b": "backspace",
  "\f": "formfeed",
};

function scalar(node: Exclude<EdnNode, { type: "map" | "vector" | "list" | "set" | "tagged" }>): string {
  switch (node.type) {
    case "nil":
      return "nil";
    case "boolean":
      return String(node.value);
    case "integer":
      return node.value;
    case "float":
      if (Number.isNaN(node.value)) return "##NaN";
      if (!Number.isFinite(node.value)) return node.value > 0 ? "##Inf" : "##-Inf";
      return String(node.value);
    case "bigint":
      return `${node.value}N`;
    case "bigdec":
      return `${node.value}M`;
    case "ratio":
      return `${node.numerator}/${node.denominator}`;
    case "string":
      return quote(node.value);
    case "char":
      return `\\${CHAR_NAMES[node.value] ?? node.value}`;
    case "keyword":
      return `:${node.value}`;
    case "symbol":
      return node.value;
    case "uuid":
      return `#uuid ${quote(node.value)}`;
    case "inst":
      return `#inst ${quote(node.value)}`;
    case "uri":
      return `#uri ${quote(node.value)}`;
  }
}

function quote(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: escaping control characters is the point
  return `"${value.replace(/[\\"\u0000-\u001f]/g, (c) => {
    switch (c) {
      case "\\":
        return "\\\\";
      case '"':
        return '\\"';
      case "\n":
        return "\\n";
      case "\t":
        return "\\t";
      case "\r":
        return "\\r";
      default:
        return `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
    }
  })}"`;
}
