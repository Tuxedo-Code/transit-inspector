// Development only: the panel UI in a normal tab (`npm run dev`, UI tests). Not included in the extension build.
import transit from "transit-js";
import basicHar from "../../samples/basic.har?raw";
import type { HarEntry, RawEntry } from "../har";
import { harSource, rawEntriesFromHar } from "./har-file";
import type { Source } from "./source";

/** A multi-MB Transit response, generated rather than committed, for checking large-body performance. */
function largeEntry(rows: number): RawEntry {
  const kw = transit.keyword;
  const items = Array.from({ length: rows }, (_, i) =>
    transit.map([
      kw("row/id"),
      i,
      kw("row/uuid"),
      transit.uuid(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`),
      kw("row/label"),
      `Row number ${i} with some descriptive text`,
      kw("row/tags"),
      transit.set([kw("generated"), kw(i % 2 ? "odd" : "even")]),
      kw("row/amount"),
      transit.bigDec(`${i}.50`),
    ]),
  );
  const body = transit.writer("json").write(transit.map([kw("report/rows"), items]));
  const entry = {
    _resourceType: "fetch",
    startedDateTime: "2026-10-05T10:00:05.000Z",
    time: 840,
    request: {
      method: "GET",
      url: "https://app.example.com/api/reports/large",
      httpVersion: "HTTP/1.1",
      headers: [],
      queryString: [],
      cookies: [],
      headersSize: -1,
      bodySize: 0,
    },
    response: {
      status: 200,
      statusText: "OK",
      httpVersion: "HTTP/1.1",
      headers: [{ name: "content-type", value: "application/transit+json" }],
      cookies: [],
      content: { size: body.length, mimeType: "application/transit+json", text: body },
      redirectURL: "",
      headersSize: -1,
      bodySize: body.length,
    },
    cache: {},
    timings: { send: 1, wait: 800, receive: 39 },
  } as HarEntry;
  return { entry, getContent: async () => ({ content: body, encoding: "" }) };
}

export function devSamplesSource(): Source {
  return harSource([...rawEntriesFromHar(JSON.parse(basicHar)), largeEntry(20_000)]);
}
