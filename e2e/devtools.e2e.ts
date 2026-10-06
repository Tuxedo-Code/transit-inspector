// The extension in real DevTools, against e2e/test-server.ts. Opens a visible Chrome window.
import type { Browser, Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { devtoolsUi, launchWithExtension, MOD, openPageWithTransitPanel, type Panel, pressShortcut } from "./devtools";
import { startTestServer, type TestServer } from "./test-server";

let server: TestServer;
let browser: Browser;
let closeBrowser: () => Promise<void>;
let page: Page;
let devtools: Page;
let panel: Panel;

const ROW_NAMES = `[...document.querySelectorAll(".request-list tbody tr")].map((tr) => tr.cells[0].textContent)`;
const sameList = (expected: string[]) => (names: string[]) => JSON.stringify(names) === JSON.stringify(expected);
const ON_LOAD = ["transit", "transit-as-json", "plain", "echo"];

beforeAll(async () => {
  server = await startTestServer();
  ({ browser, close: closeBrowser } = await launchWithExtension());
  ({ page, devtools, panel } = await openPageWithTransitPanel(browser, server.url));
});

afterAll(async () => {
  await closeBrowser?.();
  await server?.close();
});

describe("the Transit panel in real DevTools", () => {
  it("lists Fetch/XHR requests made before it was opened, in start order", async () => {
    await panel.waitFor(ROW_NAMES, sameList(ON_LOAD));
  });

  it("grays out non-Transit requests", async () => {
    const disabled = await panel.evaluate<string[]>(
      `[...document.querySelectorAll(".request-list tr[aria-disabled=true]")].map((tr) => tr.cells[0].textContent)`,
    );
    expect(disabled).toEqual(["plain"]);
  });

  it("decodes a Transit response into EDN", async () => {
    await panel.evaluate(
      `[...document.querySelectorAll(".request-list tbody tr")].find((tr) => tr.cells[0].textContent === "transit").click()`,
    );
    const edn = await panel.waitFor<string>(`document.querySelector(".cm-content")?.innerText ?? ""`, (text) =>
      text.includes(":user/id"),
    );
    expect(edn).toContain(':user/id #uuid "550e8400-e29b-41d4-a716-446655440000"');
    expect(edn).toContain(':tags #{"a" "b"}');
  });

  it("shows the path at the cursor and copies it", async () => {
    // Move the cursor one character in, onto the first key, with CodeMirror's own key handling.
    await panel.evaluate(`(() => {
      const content = document.querySelector(".cm-content");
      content.focus();
      content.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", keyCode: 39, bubbles: true }));
    })()`);
    await panel.waitFor<string>(
      `document.querySelector(".path-footer .path")?.textContent ?? ""`,
      (path) => path === "[:user/id]",
    );
    await panel.evaluate(`document.querySelector(".path-footer button").click()`);
    await panel.waitFor<string>(
      `document.querySelector(".path-footer button").textContent`,
      (label) => label === "Copied",
    );
  });

  describe("Cmd+F", () => {
    const CM_SEARCH_OPEN = `!!document.querySelector(".cm-search")`;
    const CM_SEARCH_FOCUSED = `!!document.activeElement?.matches(".cm-search input[name=search]")`;
    const settle = () => new Promise((r) => setTimeout(r, 500));
    // Focus stays in the panel's frame, on no control in particular.
    const blurPanel = () => panel.evaluate(`document.activeElement?.blur()`);

    it("in the editor opens only the editor's search", async () => {
      await panel.evaluate(`document.querySelector(".cm-content").focus()`);
      await pressShortcut(devtools, MOD, "f");
      await panel.waitFor<boolean>(CM_SEARCH_FOCUSED, Boolean);
      await settle();
      expect(await devtoolsUi(devtools)).toMatchObject({ searchBar: false });
      expect(await panel.evaluate<boolean>(CM_SEARCH_FOCUSED)).toBe(true);
    });

    it("Esc closes the editor's search without toggling the Console drawer", async () => {
      await pressShortcut(devtools, "Escape");
      await panel.waitFor<boolean>(CM_SEARCH_OPEN, (open) => !open);
      await settle();
      expect(await devtoolsUi(devtools)).toMatchObject({ drawer: false });
    });

    it("elsewhere in the panel opens the pane's search", async () => {
      await blurPanel();
      await pressShortcut(devtools, MOD, "f");
      await panel.waitFor<boolean>(CM_SEARCH_FOCUSED, Boolean);
      await settle();
      expect(await devtoolsUi(devtools)).toMatchObject({ searchBar: false });
      await pressShortcut(devtools, "Escape");
      await panel.waitFor<boolean>(CM_SEARCH_OPEN, (open) => !open);
    });

    it("with no request open focuses the filter box", async () => {
      await panel.evaluate(`document.querySelector(".detail button[aria-label=Close]").click()`);
      await blurPanel();
      await pressShortcut(devtools, MOD, "f");
      await panel.waitFor<string>(`document.activeElement?.getAttribute("aria-label") ?? ""`, (label) =>
        label.startsWith("Filter"),
      );
      await settle();
      expect(await devtoolsUi(devtools)).toMatchObject({ searchBar: false });
    });

    it("leaves DevTools shortcuts the panel doesn't use to DevTools", async () => {
      await blurPanel();
      await pressShortcut(devtools, "Escape");
      await vi.waitFor(async () => expect(await devtoolsUi(devtools)).toMatchObject({ drawer: true }));
      await pressShortcut(devtools, "Escape");
      await vi.waitFor(async () => expect(await devtoolsUi(devtools)).toMatchObject({ drawer: false }));
      await blurPanel();
      await pressShortcut(devtools, MOD, "Shift", "p");
      await vi.waitFor(async () => expect(await devtoolsUi(devtools)).toMatchObject({ commandMenu: true }));
      await pressShortcut(devtools, "Escape");
      await vi.waitFor(async () => expect(await devtoolsUi(devtools)).toMatchObject({ commandMenu: false }));
    });
  });

  it("keeps the list across an SPA route change and adds new requests", async () => {
    await page.evaluate(() => (window as unknown as { spa: () => void }).spa());
    await page.evaluate(() => (window as unknown as { later: () => Promise<unknown> }).later());
    await panel.waitFor(ROW_NAMES, sameList([...ON_LOAD, "later"]));
  });

  it("clears the list on a real page load", async () => {
    await page.reload();
    // Requests started within the same millisecond may swap places here (they arrive in finish order
    // before DevTools' own log is re-read), so compare membership; start order is covered above.
    const sorted = [...ON_LOAD].sort();
    await panel.waitFor<string[]>(ROW_NAMES, (names) => sameList(sorted)([...names].sort()));
    const detailOpen = await panel.evaluate<boolean>(`Boolean(document.querySelector(".detail"))`);
    expect(detailOpen).toBe(false);
  });

  // After the tests above, so everything they did ran under the CSP.
  it("runs with no CSP violations", () => {
    expect(panel.cspIssues).toEqual([]);
  });

  it("can't send anything to a server (docs/spec.md 'Privacy')", async () => {
    const leak = (kind: string) => `${server.url}leak/${kind}`;
    const failures = await panel.evaluate<{ fetch: string; xhr: string }>(`(async () => {
      const fetchResult = await fetch(${JSON.stringify(leak("fetch"))}).then(() => "sent", (e) => e.name);
      const xhrResult = await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve("sent");
        xhr.onerror = () => resolve("error");
        try {
          xhr.open("GET", ${JSON.stringify(leak("xhr"))});
          xhr.send();
        } catch (e) {
          resolve(e.name);
        }
      });
      navigator.sendBeacon(${JSON.stringify(leak("beacon"))});
      try {
        new WebSocket(${JSON.stringify(leak("ws").replace("http:", "ws:"))});
      } catch {}
      new Image().src = ${JSON.stringify(leak("img"))};
      for (const css of [
        "@import url(${leak("import")});",
        "body { background-image: url(${leak("css-url")}); }",
      ]) {
        const style = document.createElement("style");
        style.className = "leak-probe";
        style.textContent = css;
        document.head.append(style);
      }
      getComputedStyle(document.body).backgroundImage;
      return { fetch: fetchResult, xhr: xhrResult };
    })()`);
    expect(failures.fetch).not.toBe("sent");
    expect(failures.xhr).not.toBe("sent");

    // Each attempt is reported as blocked by the CSP: proof it was the CSP, not some other failure.
    const kinds = ["fetch", "xhr", "beacon", "ws", "img", "import", "css-url"];
    const blocked = () => {
      const found = panel.cspIssues.map((issue) => issue.blockedURL?.match(/\/leak\/([\w-]+)/)?.[1]);
      return [...new Set(found.filter((kind) => kind !== undefined))].sort();
    };
    await vi.waitFor(() => expect(blocked()).toEqual([...kinds].sort()), { timeout: 5_000 });
    await panel.evaluate(`document.querySelectorAll(".leak-probe").forEach((style) => style.remove())`);
    expect(server.requests.filter((path) => path.startsWith("/leak/"))).toEqual([]);
  });
});
