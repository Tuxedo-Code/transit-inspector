// Measures Transit against plain JSON, uncompressed, gzip and brotli: `node samples/measure-transit-size.ts`.
// Prints the Markdown table quoted in docs/considered.md ("Size: does Transit save bandwidth?").
// Deterministic: the same Node and transit-js versions print the same numbers.
import { readFileSync } from "node:fs";
import { brotliCompressSync, gzipSync } from "node:zlib";
import transit from "transit-js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The decoded value as a JSON API would send it: keywords as "ns/name", sets and lists as arrays, the rest as strings. */
function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toJson);
  if (value instanceof Date) return value.toISOString();
  if (transit.isKeyword(value)) return String(value).replace(/^:/, "");
  if (transit.isMap(value)) {
    const out: { [key: string]: Json } = {};
    (value as Map<unknown, unknown>).forEach((v, k) => {
      const key = toJson(k);
      out[typeof key === "string" ? key : JSON.stringify(key)] = toJson(v);
    });
    return out;
  }
  if (transit.isSet(value)) {
    const items: Json[] = [];
    (value as Set<unknown>).forEach((item) => {
      items.push(toJson(item));
    });
    return items;
  }
  if (transit.isTaggedValue(value)) return toJson((value as { rep: unknown }).rep);
  // Symbols, UUIDs, big numbers, URIs, chars.
  const rep = (value as { rep?: unknown }).rep;
  return typeof rep === "string" ? rep : String(value);
}

function sizes(text: string): [raw: number, gzip: number, brotli: number] {
  const bytes = Buffer.from(text);
  return [bytes.length, gzipSync(bytes).length, brotliCompressSync(bytes).length];
}

const reader = transit.reader("json");
const percent = (transitBytes: number, jsonBytes: number) => {
  const delta = Math.round((transitBytes / jsonBytes - 1) * 100);
  return `${delta > 0 ? "+" : ""}${delta}%`;
};

const rows: string[] = [];
const skipped: string[] = [];
function measure(name: string, transitText: string) {
  let jsonText: string;
  try {
    jsonText = JSON.stringify(toJson(reader.read(transitText)));
  } catch (error) {
    skipped.push(`${name}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    return;
  }
  const t = sizes(transitText);
  const j = sizes(jsonText);
  const cells = [0, 1, 2].map((i) => `${t[i]} / ${j[i]} (${percent(t[i] ?? 0, j[i] ?? 1)})`);
  rows.push(`| ${name} | ${cells.join(" | ")} |`);
}

// Every Transit response in the sample HAR.
const har = JSON.parse(readFileSync(new URL("basic.har", import.meta.url), "utf8")) as {
  log: { entries: { request: { method: string; url: string }; response: { content: { text?: string } } }[] };
};
for (const { request, response } of har.log.entries) {
  const text = response.content.text;
  if (!text || !/"~[:#$]|"\^ "/.test(text)) continue;
  measure(`${request.method} ${new URL(request.url).pathname}`, text);
}

// A typical entity list: namespaced keys, enum keywords, UUIDs, instants, nested maps, sets.
const kw = transit.keyword;
const tmap = (entries: Record<string, unknown>) => transit.map(Object.entries(entries).flatMap(([k, v]) => [kw(k), v]));
const statuses = ["order.status/open", "order.status/paid", "order.status/shipped"];
const order = (i: number) =>
  tmap({
    "order/id": transit.uuid(`${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`),
    "order/status": kw(statuses[i % 3] ?? ""),
    "order/total": ((i * 7919) % 100000) / 100,
    "order/created-at": new Date(Date.UTC(2026, 0, 1) + i * 3_600_000),
    "order/customer": tmap({
      "customer/id": i % 50,
      "customer/name": `Customer ${i % 50}`,
      "customer/email": `c${i % 50}@example.com`,
    }),
    "order/tags": transit.set([kw("tag/priority"), kw("tag/gift")].slice(0, i % 3)),
  });
for (const count of [10, 100, 1000, 10000]) {
  const items = Array.from({ length: count }, (_, i) => order(i));
  measure(
    `Synthetic: ${count} orders`,
    transit.writer("json").write(tmap({ "orders/items": items, "orders/count": count })),
  );
}

const versions = `Node ${process.versions.node}, transit-js ${JSON.parse(readFileSync(new URL("../node_modules/transit-js/package.json", import.meta.url), "utf8")).version}, zlib default levels`;
console.log(`Bytes as Transit / JSON (Transit vs JSON). ${versions}.\n`);
console.log("| Payload | Uncompressed | gzip | brotli |");
console.log("|---|---|---|---|");
for (const row of rows) console.log(row);
if (skipped.length) console.log(`\nSkipped (not readable as Transit):\n${skipped.map((s) => `- ${s}`).join("\n")}`);
