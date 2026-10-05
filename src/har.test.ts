import { describe, expect, it } from "vitest";
import sample from "../samples/basic.har?raw";
import { isListed, toRow } from "./har";
import { isSelectable } from "./model";
import { rawEntriesFromHar } from "./sources/har-file";

const raws = rawEntriesFromHar(JSON.parse(sample));
const rowFor = async (path: string) => {
  const raw = raws.find((r) => new URL(r.entry.request.url).pathname === path);
  if (!raw) throw new Error(`no sample entry for ${path}`);
  return toRow(raw);
};

describe("toRow on the sample HAR", () => {
  it("lists only fetch and XHR entries", () => {
    const listed = raws.filter((r) => isListed(r.entry)).map((r) => new URL(r.entry.request.url).pathname);
    expect(listed).not.toContain("/static/logo.png");
    expect(listed).toContain("/api/feed");
  });

  it("detects Transit responses and payloads and keeps their bodies", async () => {
    const row = await rowFor("/api/orders");
    expect(row.request.kind).toBe("transit");
    expect(row.response.kind).toBe("transit");
    expect(row.request.text).toContain("~:order/items");
    expect(row.status).toBe(201);
    expect(isSelectable(row)).toBe(true);
  });

  it("detects Transit served as application/json", async () => {
    const row = await rowFor("/api/feed");
    expect(row.response.kind).toBe("transit");
    expect(row.resourceType).toBe("xhr");
  });

  it("keeps the non-Transit side of a selectable row", async () => {
    const row = await rowFor("/api/events");
    expect(row.request.kind).toBe("json");
    expect(row.request.text).toBe('{"event":"click"}');
    expect(isSelectable(row)).toBe(true);
  });

  it("drops bodies of rows without Transit", async () => {
    const row = await rowFor("/api/config");
    expect(row.response.kind).toBe("json");
    expect(row.response.text).toBeNull();
    expect(isSelectable(row)).toBe(false);
  });

  it("flags msgpack and failed requests", async () => {
    expect((await rowFor("/api/archive")).response.kind).toBe("msgpack");
    const failed = await rowFor("/api/stream");
    expect(failed.failed).toBe(true);
    expect(isSelectable(failed)).toBe(false);
  });

  it("decodes error responses like any other", async () => {
    const row = await rowFor("/api/payments");
    expect(row.status).toBe(500);
    expect(row.response.kind).toBe("transit");
  });

  it("marks bodies DevTools no longer has as unavailable", async () => {
    const raw = raws.find((r) => r.entry.request.url.endsWith("/api/users/42"));
    if (!raw) throw new Error("missing sample");
    const row = await toRow({ ...raw, getContent: () => Promise.reject(new Error("evicted")) });
    expect(row.response.kind).toBe("unavailable");
  });
});
