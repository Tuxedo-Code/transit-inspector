import { describe, expect, it } from "vitest";
import type { HarEntry, RawEntry } from "./har";
import { MAX_ROWS, RequestStore } from "./store";

const BODY = '["^ ","~:a",1]';

function raw(path: string, startedMs: number, type = "fetch", time = 10): RawEntry {
  const entry = {
    _resourceType: type,
    startedDateTime: new Date(startedMs).toISOString(),
    time,
    request: {
      method: "GET",
      url: `https://x.test${path}`,
      httpVersion: "",
      headers: [],
      queryString: [],
      cookies: [],
      headersSize: -1,
      bodySize: 0,
    },
    response: {
      status: 200,
      statusText: "OK",
      httpVersion: "",
      headers: [],
      cookies: [],
      content: { size: BODY.length, mimeType: "application/transit+json" },
      redirectURL: "",
      headersSize: -1,
      bodySize: BODY.length,
    },
    cache: {},
    timings: { send: 0, wait: 0, receive: 0 },
  } as HarEntry;
  return { entry, getContent: async () => ({ content: BODY, encoding: "" }) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const paths = (store: RequestStore) => store.getRows().map((r) => new URL(r.url).pathname);

describe("RequestStore", () => {
  it("orders rows by start time, not arrival", async () => {
    const store = new RequestStore();
    store.add([raw("/slow", 1000)]);
    store.add([raw("/later", 3000), raw("/fast", 2000)]);
    await settle();
    expect(paths(store)).toEqual(["/slow", "/fast", "/later"]);
  });

  it("keeps arrival order for requests started in the same millisecond, whichever body is read first", async () => {
    const store = new RequestStore();
    const slowBody = raw("/first", 5000);
    const read = slowBody.getContent;
    slowBody.getContent = () => new Promise((resolve) => setTimeout(() => resolve(read()), 5));
    store.replace([slowBody, raw("/second", 5000), raw("/third", 5000)]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(paths(store)).toEqual(["/first", "/second", "/third"]);
  });

  it("ignores non-Fetch/XHR entries and duplicates", async () => {
    const store = new RequestStore();
    store.replace([raw("/a", 1), raw("/doc", 2, "document")]);
    store.add([raw("/a", 1)]);
    await settle();
    expect(paths(store)).toEqual(["/a"]);
  });

  it("replaces a row read while its request was in flight with the finished entry", async () => {
    const store = new RequestStore();
    store.replace([raw("/a", 1, "fetch", 50)]);
    await settle();
    store.add([raw("/a", 1, "fetch", 1500)]);
    await settle();
    expect(store.getRows().map((r) => r.durationMs)).toEqual([1500]);
  });

  it("keeps the latest entry for a request even if an earlier one is read last", async () => {
    const store = new RequestStore();
    const stale = raw("/a", 1, "fetch", 50);
    const read = stale.getContent;
    stale.getContent = () => new Promise((resolve) => setTimeout(() => resolve(read()), 5));
    store.replace([stale]);
    store.add([raw("/a", 1, "fetch", 1500)]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.getRows().map((r) => r.durationMs)).toEqual([1500]);
  });

  it("keeps a cleared request hidden when it finishes", async () => {
    const store = new RequestStore();
    store.add([raw("/a", 1)]);
    await settle();
    store.clear();
    store.add([raw("/a", 1, "fetch", 1500)]);
    await settle();
    expect(paths(store)).toEqual([]);
  });

  it("rebuilds from replace, dropping entries no longer present", async () => {
    const store = new RequestStore();
    store.add([raw("/old", 1)]);
    await settle();
    store.replace([raw("/new", 2)]);
    await settle();
    expect(paths(store)).toEqual(["/new"]);
  });

  it("keeps cleared entries hidden when a replace brings them back", async () => {
    const store = new RequestStore();
    store.add([raw("/a", 1)]);
    await settle();
    store.clear();
    store.replace([raw("/a", 1), raw("/b", 2)]);
    await settle();
    expect(paths(store)).toEqual(["/b"]);
  });

  it("discards conversions that finish after a clear", async () => {
    const store = new RequestStore();
    store.add([raw("/a", 1)]);
    store.clear();
    await settle();
    expect(paths(store)).toEqual([]);
  });

  it("caps the list, dropping the oldest", async () => {
    const store = new RequestStore();
    store.add(Array.from({ length: MAX_ROWS + 5 }, (_, i) => raw(`/r${i}`, i)));
    await settle();
    expect(store.getRows()).toHaveLength(MAX_ROWS);
    expect(paths(store)[0]).toBe("/r5");
  });

  describe("Keep log", () => {
    const onPage = (pageref: string, path: string, startedMs: number): RawEntry => {
      const entry = raw(path, startedMs);
      entry.entry.pageref = pageref;
      return entry;
    };

    it("is off by default: a page load drops the earlier load's rows", async () => {
      const store = new RequestStore();
      store.replace([onPage("page_1", "/a", 1)], "page_1");
      await settle();
      store.replace([onPage("page_2", "/b", 2)], "page_2");
      await settle();
      expect(store.getKeepLog()).toBe(false);
      expect(paths(store)).toEqual(["/b"]);
    });

    it("when off, ignores earlier loads that DevTools itself kept (the Network panel's Keep log)", async () => {
      const store = new RequestStore();
      store.replace([onPage("page_1", "/a", 1)], "page_1");
      await settle();
      store.replace([onPage("page_2", "/b", 2), onPage("page_1", "/a", 1)], "page_2");
      await settle();
      expect(paths(store)).toEqual(["/b"]);
    });

    it("when on, keeps rows that a page load drops from DevTools' log", async () => {
      const store = new RequestStore();
      store.setKeepLog(true);
      store.replace([onPage("page_1", "/a", 1), onPage("page_1", "/b", 1)], "page_1");
      await settle();
      store.replace([onPage("page_2", "/c", 2)], "page_2");
      await settle();
      expect(paths(store)).toEqual(["/a", "/b", "/c"]);
    });

    it("when on, also lists earlier loads DevTools kept, e.g. on the first backfill", async () => {
      const store = new RequestStore();
      store.setKeepLog(true);
      store.replace([onPage("page_2", "/c", 2), onPage("page_1", "/a", 1)], "page_2");
      await settle();
      expect(paths(store)).toEqual(["/a", "/c"]);
    });

    it("turned off, drops nothing until the next page load", async () => {
      const store = new RequestStore();
      store.setKeepLog(true);
      store.replace([onPage("page_1", "/a", 1)], "page_1");
      await settle();
      store.replace([onPage("page_2", "/b", 2)], "page_2");
      await settle();
      store.setKeepLog(false);
      expect(paths(store)).toEqual(["/a", "/b"]);
      store.replace([onPage("page_3", "/c", 3)], "page_3");
      await settle();
      expect(paths(store)).toEqual(["/c"]);
    });

    it("still clears on Clear, and keeps cleared rows hidden", async () => {
      const store = new RequestStore();
      store.setKeepLog(true);
      store.replace([onPage("page_1", "/a", 1)], "page_1");
      await settle();
      store.clear();
      store.replace([onPage("page_2", "/b", 2), onPage("page_1", "/a", 1)], "page_2");
      await settle();
      expect(paths(store)).toEqual(["/b"]);
    });

    it("still caps the list", async () => {
      const store = new RequestStore();
      store.setKeepLog(true);
      store.replace(
        Array.from({ length: MAX_ROWS }, (_, i) => onPage("page_1", `/r${i}`, i)),
        "page_1",
      );
      await settle();
      store.replace([onPage("page_2", "/new", MAX_ROWS)], "page_2");
      await settle();
      expect(store.getRows()).toHaveLength(MAX_ROWS);
      expect(paths(store)[0]).toBe("/r1");
      expect(paths(store).at(-1)).toBe("/new");
    });
  });
});
