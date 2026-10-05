/** Something wrong or lossy about a value, shown as a mark in the EDN pane. */
export interface Problem {
  severity: "warning" | "error";
  message: string;
}

interface Base {
  problem?: Problem;
}

/** A decoded value, in EDN terms. Map entries keep their wire order. */
export type EdnNode = Base &
  (
    | { type: "nil" }
    | { type: "boolean"; value: boolean }
    /** Exact digits, never rounded. */
    | { type: "integer"; value: string }
    | { type: "float"; value: number }
    | { type: "bigint"; value: string }
    | { type: "bigdec"; value: string }
    | { type: "ratio"; numerator: string; denominator: string }
    | { type: "string"; value: string }
    | { type: "char"; value: string }
    /** Without the leading colon, e.g. `user/id`. */
    | { type: "keyword"; value: string }
    | { type: "symbol"; value: string }
    | { type: "uuid"; value: string }
    /** ISO-8601 timestamp. */
    | { type: "inst"; value: string }
    | { type: "uri"; value: string }
    | { type: "vector" | "list" | "set"; items: EdnNode[] }
    | { type: "map"; entries: [EdnNode, EdnNode][] }
    | { type: "tagged"; tag: string; value: EdnNode }
  );

export type EdnCollection = Extract<EdnNode, { type: "vector" | "list" | "set" | "map" }>;
