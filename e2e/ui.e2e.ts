// The panel UI in a normal headless tab with the sample data (src/sources/dev-samples.ts).
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { EditorView } from "@codemirror/view";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const SCREENSHOTS = resolve(ROOT, "e2e", "screenshots");

let vite: ViteDevServer;
let browser: Browser;
let panelUrl: string;
let page: Page;

beforeAll(async () => {
  vite = await createServer({
    root: ROOT,
    configFile: resolve(ROOT, "vite.config.ts"),
    server: { port: 0 },
    logLevel: "error",
  });
  await vite.listen();
  panelUrl = new URL("panel.html", vite.resolvedUrls?.local[0]).href;
  browser = await puppeteer.launch({ headless: true });
  await mkdir(SCREENSHOTS, { recursive: true });
});

afterAll(async () => {
  await browser?.close();
  await vite?.close();
});

beforeEach(async () => {
  await page?.close();
  page = await browser.newPage();
  // 2x like a Retina display, so screenshots show what users see.
  await page.setViewport({ width: 1300, height: 650, deviceScaleFactor: 2 });
  await page.goto(panelUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector(".request-list tbody tr");
});

const rowNames = () =>
  page.$$eval(".request-list tbody tr", (rows) =>
    rows.map((row) => (row as HTMLTableRowElement).cells[0]?.textContent),
  );

async function selectRow(name: string): Promise<void> {
  const rows = await page.$$(".request-list tbody tr");
  for (const row of rows) {
    if ((await row.$eval("td", (cell) => cell.textContent)) === name) {
      await row.click();
      // CodeMirror mounts in an effect after the detail view renders.
      await page.waitForSelector(".detail .pane .cm-content, .detail .pane .message");
      return;
    }
  }
  throw new Error(`No row named ${name}`);
}

/**
 * Saves a screenshot for review. Headless Chrome at deviceScaleFactor 2 paints row hover at the wrong position (the
 * DOM's :hover is right), so the mouse first leaves the page.
 */
async function screenshot(name: string): Promise<void> {
  await page.mouse.move(-1, -1);
  await page.screenshot({ path: resolve(SCREENSHOTS, `${name}.png`) });
}

const listPaneBox = () =>
  page.$eval(".list-pane", (pane) => {
    const { width, right } = pane.getBoundingClientRect();
    return { width, right };
  });

async function splitterBox() {
  const box = await (await page.$(".splitter"))?.boundingBox();
  if (!box) throw new Error("No splitter");
  return box;
}

/** Drags the splitter between the request list and the detail view to `x`. */
async function dragSplitter(x: number): Promise<void> {
  const box = await splitterBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.up();
}

/** CodeMirror links its view from the content DOM; tests read the editor's state through it. */
type ViewDom = { cmTile: { root: { view: EditorView } } };

/** The EDN pane's selection, document and its length. */
const ednSelection = () =>
  page.$eval(".pane .cm-content", (content) => {
    const { state } = (content as unknown as ViewDom).cmTile.root.view;
    const { from, to } = state.selection.main;
    return { from, to, text: state.sliceDoc(from, to), doc: state.doc.toString(), length: state.doc.length };
  });

/** Double-clicks the character at `offset` in the EDN pane, on its left or right half. */
async function doubleClickEdn(offset: number, half: "left" | "right"): Promise<void> {
  const point = await page.$eval(
    ".pane .cm-content",
    (content, offset, half) => {
      const { view } = (content as unknown as ViewDom).cmTile.root;
      const start = view.coordsAtPos(offset, 1);
      const end = view.coordsAtPos(offset + 1, -1);
      if (!start || !end) return null;
      const quarter = (end.right - start.left) / 4;
      return { x: half === "left" ? start.left + quarter : end.right - quarter, y: (start.top + start.bottom) / 2 };
    },
    offset,
    half,
  );
  if (!point) throw new Error(`Offset ${offset} isn't drawn`);
  await page.mouse.click(point.x, point.y, { count: 2 });
}

const ednText = () => page.$eval(".pane .cm-content", (content) => (content as HTMLElement).innerText);
const pressedViewMode = () => page.$eval(".segmented button.selected", (button) => button.textContent);

/** Clicks on the first occurrence of `text` inside the EDN pane, placing the cursor there. */
async function clickInEdn(text: string): Promise<void> {
  const box = await page.evaluate((needle) => {
    const content = document.querySelector(".pane .cm-content");
    const walker = document.createTreeWalker(content as Node, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(needle) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + 1, y: rect.top + rect.height / 2 };
    }
    return null;
  }, text);
  if (!box) throw new Error(`${text} not visible in the EDN pane`);
  await page.mouse.click(box.x, box.y);
}

describe("request list", () => {
  it("lists Fetch/XHR requests in start order, without other resource types", async () => {
    const names = await rowNames();
    expect(names.slice(0, 3)).toEqual(["42", "orders", "feed?page=2&size=20"]);
    expect(names).not.toContain("logo.png");
  });

  it("grays out requests without Transit and labels msgpack", async () => {
    const disabled = await page.$$eval(".request-list tr[aria-disabled=true]", (rows) =>
      rows.map((row) => (row as HTMLTableRowElement).cells[0]?.textContent),
    );
    expect(disabled).toEqual(["config", "health", "archive transit+msgpack (not supported)", "stream"]);
    const rows = await page.$$(".request-list tr[aria-disabled=true]");
    await rows[0]?.click();
    expect(await page.$(".detail")).toBeNull();
  });

  it("filters by a case-insensitive URL substring", async () => {
    await page.type(".filter input", "USERS");
    expect(await rowNames()).toEqual(["42", "999"]);
    await page.type(".filter input", "-nothing");
    await page.waitForSelector(".empty");
    expect(await page.$eval(".empty", (empty) => empty.textContent)).toBe("No requests match the filter");
  });

  it("clears the list and resets the detail view", async () => {
    await selectRow("42");
    await page.click("button[aria-label=Clear]");
    await page.waitForSelector(".empty");
    expect(await page.$eval(".empty", (empty) => empty.textContent)).toBe("No Transit requests yet");
    expect(await page.$(".detail")).toBeNull();
  });
});

describe("detail view", () => {
  it("shows the decoded response as EDN with the request in the header", async () => {
    await selectRow("42");
    expect(await page.$eval(".summary", (summary) => summary.textContent)).toBe(
      "GEThttps://app.example.com/api/users/42200 OK",
    );
    const edn = await ednText();
    expect(edn).toContain(':user/id #uuid "550e8400-e29b-41d4-a716-446655440000"');
    expect(edn).toContain(":user/roles #{:admin :dev}");
    expect(edn).toContain(":user/big-id 9007199254740993");
  });

  it("switches between request payload and response body", async () => {
    await selectRow("orders");
    expect(await ednText()).toContain(":order/id 1004");
    await page.click("[role=tab]::-p-text(Payload)");
    await page.waitForFunction(() =>
      document.querySelector(".pane .cm-content")?.textContent?.includes(":order/items"),
    );
    expect(await ednText()).toBe('{:order/items [{:item/sku "A-1" :item/qty 2}]}');
  });

  it("opens the side that carries Transit and says when the other side isn't", async () => {
    await selectRow("events");
    expect(await ednText()).toBe("{:ok? true}");
    await page.click("[role=tab]::-p-text(Payload)");
    await page.waitForSelector(".message");
    expect(await page.$eval(".message", (message) => message.textContent)).toBe("Not Transit");
  });

  it("switches view modes and remembers the choice", async () => {
    await selectRow("42");
    const editors = (count: number) =>
      page.waitForFunction((n) => document.querySelectorAll(".cm-editor").length === n, {}, count);
    expect(await pressedViewMode()).toBe("EDN");
    await editors(1);
    await page.click(".segmented button:nth-child(2)");
    await editors(2);
    await page.click(".segmented button:nth-child(3)");
    await editors(1);
    expect(await page.$eval(".cm-content", (content) => content.textContent)).toContain('"~:user/id"');
    await page.reload();
    await page.waitForSelector(".request-list tbody tr");
    await selectRow("42");
    expect(await pressedViewMode()).toBe("Transit");
  });

  it("opens the search of the pane last read with Cmd+F from outside the panes", async () => {
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    const searchIn = () =>
      page.$$eval(".pane", (panes) => panes.map((pane) => Boolean(pane.querySelector(".cm-search"))));
    await selectRow("42");
    await page.click(".segmented button:nth-child(2)");
    await page.waitForFunction(() => document.querySelectorAll(".cm-editor").length === 2);
    // Read the raw pane, then click outside the panes.
    await page.click(".pane:nth-child(2) .cm-content");
    await page.click(".summary .url");
    await page.keyboard.down(mod);
    await page.keyboard.press("f");
    await page.keyboard.up(mod);
    await page.waitForSelector(".cm-search");
    expect(await searchIn()).toEqual([false, true]);
    expect(await page.evaluate(() => document.activeElement?.matches(".cm-search input[name=search]"))).toBe(true);
  });

  it("selects a whole form by double-clicking either of its brackets", async () => {
    await selectRow("42");
    const { doc } = await ednSelection();
    const orders = doc.indexOf("[{:order/id");
    const order = orders + 1;
    const path = () => page.$eval(".path-footer .path", (element) => element.textContent);

    // `[{` sit side by side: each half picks its own bracket's form.
    await doubleClickEdn(order, "left");
    const map = await ednSelection();
    expect(map.from).toBe(order);
    expect(map.text.startsWith("{:order/id 1001")).toBe(true);
    expect(map.text.endsWith(":item/price 9.99M}]}")).toBe(true);
    expect(await path()).toBe("[:user/orders 0]");

    await doubleClickEdn(orders, "right");
    const vector = await ednSelection();
    expect(vector.from).toBe(orders);
    expect(vector.text.endsWith("}]")).toBe(true);
    expect(await path()).toBe("[:user/orders]");

    // The closing bracket selects the same form as the opening one.
    await doubleClickEdn(map.to - 1, "left");
    expect(await ednSelection()).toMatchObject({ from: map.from, to: map.to });

    // Elsewhere, double-click selects a word as usual.
    await doubleClickEdn(doc.indexOf("order/total") + 1, "left");
    expect((await ednSelection()).text).toBe("order");
  });

  it("expands the selection form by form with Cmd+I, up to the whole multi-MB body", async () => {
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await selectRow("large");
    await clickInEdn(":row/id");
    const sizes: number[] = [];
    for (let press = 0; press < 8; press++) {
      await page.keyboard.down(mod);
      await page.keyboard.press("i");
      await page.keyboard.up(mod);
      const { from, to } = await ednSelection();
      if (to - from === sizes.at(-1)) break;
      sizes.push(to - from);
    }
    const { length } = await ednSelection();
    // The keyword, its row map, the 20,000-row vector, then the whole document.
    expect(sizes.at(-1)).toBe(length);
    expect(sizes.at(-2)).toBe(length - "{:report/rows ".length - "}".length);
  });

  it("shows decode errors and marks them in the raw body", async () => {
    await selectRow("broken");
    await page.click(".segmented button:nth-child(2)");
    expect(await page.$eval(".message.error", (message) => message.textContent)).toContain("Could not decode Transit");
    await page.waitForSelector(".cm-lintRange-error");
  });

  it("marks unknown tags", async () => {
    await selectRow("search?q=transit&limit=50");
    await page.waitForSelector(".cm-lintRange-warning");
    expect(await page.$eval(".cm-lintRange-warning", (mark) => mark.textContent)).toContain("#money/amount");
  });

  it("shows and copies the path of the value at the cursor", async () => {
    await selectRow("42");
    expect(await page.$eval(".path-footer", (footer) => footer.textContent)).toBe(
      "Place the cursor on a value to see its path",
    );
    // The highlighter puts a string's quotes in separate text nodes, so look for the contents.
    await clickInEdn("C-3");
    await page.waitForSelector(".path-footer .path");
    expect(await page.$eval(".path-footer .path", (path) => path.textContent)).toBe(
      "[:user/orders 2 :order/items 0 :item/sku]",
    );
    await page.click(".path-footer button::-p-text(Copy path)");
    await page.waitForFunction(() => document.querySelector(".path-footer button")?.textContent === "Copied");
  });

  it("shows a string as plain text, following the cursor from string to string", async () => {
    const showText = ".path-footer button::-p-text(Show text)";
    const viewer = () =>
      page.$eval(".text-viewer", (viewer) => {
        const content = viewer.querySelector(".cm-content") as unknown as ViewDom;
        return {
          header: [...viewer.querySelectorAll(".text-viewer-header .path, .text-viewer-header .label")].map(
            (element) => element.textContent,
          ),
          text: content.cmTile.root.view.state.doc.toString(),
        };
      });
    await selectRow("payments");
    await clickInEdn("clojure.lang.ExceptionInfo");
    await page.click(showText);
    await page.waitForSelector(".text-viewer .cm-content");
    const trace = await viewer();
    expect(trace.header).toEqual(["Text", "[:error/stacktrace]", "13 lines"]);
    expect(trace.text.split("\n").slice(0, 2)).toEqual([
      'clojure.lang.ExceptionInfo: Card declined: "insufficient_funds" {:payment/amount 10.00M, :payment/currency :EUR}',
      "\tat shop.payments.gateway$charge_BANG_.invokeStatic(gateway.clj:88)",
    ]);
    expect(await page.$(showText)).toBeNull();

    // Select all and copy gives the string itself, not its escaped EDN form.
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.click(".text-viewer .cm-content");
    await page.keyboard.down(mod);
    await page.keyboard.press("a");
    await page.keyboard.up(mod);
    const copied = await page.$eval(".text-viewer .cm-content", (content) => {
      const clipboardData = new DataTransfer();
      content.dispatchEvent(new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true }));
      return clipboardData.getData("text/plain");
    });
    expect(copied).toBe(trace.text);

    // Follows the cursor onto another string, and keeps it when the cursor leaves strings.
    await clickInEdn("Card declined");
    // The editor gets its new document in an effect, after the header.
    await page.waitForFunction(() => document.querySelector(".text-viewer .cm-content")?.textContent?.length === 35);
    expect(await viewer()).toEqual({
      header: ["Text", "[:error/message]", "1 line"],
      text: 'Card declined: "insufficient_funds"',
    });
    await clickInEdn(":error/code");
    expect(await page.$eval(".path-footer .path", (path) => path.textContent)).toBe("[:error/code]");
    expect((await viewer()).header[1]).toBe("[:error/message]");

    // Cmd+F in the viewer searches the viewer.
    await page.click(".text-viewer .cm-content");
    await page.keyboard.down(mod);
    await page.keyboard.press("f");
    await page.keyboard.up(mod);
    await page.waitForSelector(".text-viewer .cm-search");
    expect(await page.$$(".cm-search")).toHaveLength(1);

    await page.click("button[aria-label='Close text']");
    expect(await page.$(".text-viewer")).toBeNull();

    // Closes with the body it belongs to.
    await clickInEdn("clojure.lang.ExceptionInfo");
    await page.click(showText);
    await page.waitForSelector(".text-viewer");
    await page.click("[role=tab]::-p-text(Payload)");
    await page.waitForFunction(() => !document.querySelector(".text-viewer"));
  });

  it("marks strings with line breaks with a chip that opens them as text", async () => {
    await selectRow("payments");
    // One chip, right before the stack trace's opening quote; none for single-line strings.
    const chips = await page.$$eval(".pane .cm-string-chip", (chips) =>
      chips.map((chip) => {
        const { view } = (chip.closest(".cm-content") as unknown as ViewDom).cmTile.root;
        const at = view.posAtDOM(chip);
        return { label: (chip as HTMLElement).dataset.text, next: view.state.sliceDoc(at, at + 11) };
      }),
    );
    expect(chips).toEqual([{ label: "13 lines", next: '"clojure.la' }]);

    // Not part of the text: neither drawn as text nor copied.
    expect(await ednText()).not.toContain("13 lines");
    await page.click(".pane .cm-content");
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(mod);
    await page.keyboard.press("a");
    await page.keyboard.up(mod);
    const copied = await page.$eval(".pane .cm-content", (content) => {
      const clipboardData = new DataTransfer();
      content.dispatchEvent(new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true }));
      return clipboardData.getData("text/plain");
    });
    expect(copied).toBe((await ednSelection()).doc);

    // Opens the viewer on its string, with the cursor in it.
    await page.click(".cm-string-chip");
    await page.waitForSelector(".text-viewer .cm-content");
    expect(await page.$eval(".text-viewer-header .path", (path) => path.textContent)).toBe("[:error/stacktrace]");
    expect(await page.$eval(".path-footer .path", (path) => path.textContent)).toBe("[:error/stacktrace]");

    // With the viewer showing another string, switches back to the chip's.
    await clickInEdn("Card declined");
    await page.waitForFunction(
      () => document.querySelector(".text-viewer-header .path")?.textContent === "[:error/message]",
    );
    await page.click(".cm-string-chip");
    await page.waitForFunction(
      () => document.querySelector(".text-viewer-header .path")?.textContent === "[:error/stacktrace]",
    );
  });

  it("fits the text viewer in a narrow panel, side by side", async () => {
    await page.setViewport({ width: 560, height: 650, deviceScaleFactor: 2 });
    await selectRow("payments");
    await page.click(".segmented button:nth-child(2)");
    await page.waitForFunction(() => document.querySelectorAll(".cm-editor").length === 2);
    // The stack trace's text starts past the pane's edge, after its chip; the message's is in view.
    await clickInEdn("Card");
    await page.waitForSelector(".path-footer button::-p-text(Show text)");
    await screenshot("show-text-narrow");
    await page.click(".cm-string-chip");
    await page.waitForSelector(".text-viewer .cm-content");
    const overflow = await page.$eval(".text-viewer-header", (header) =>
      [...header.children].map((child) => child.getBoundingClientRect().right - header.getBoundingClientRect().right),
    );
    expect(Math.max(...overflow)).toBeLessThanOrEqual(0);
    await screenshot("text-viewer-narrow");
  });

  it("copies a whole multi-MB body with select all, although only visible lines are drawn", async () => {
    await selectRow("large");
    await page.click(".pane .cm-content");
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(mod);
    await page.keyboard.press("a");
    await page.keyboard.up(mod);
    const copied = await page.$eval(".pane .cm-content", (content) => {
      const clipboardData = new DataTransfer();
      content.dispatchEvent(new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true }));
      return clipboardData.getData("text/plain");
    });
    expect(copied.length).toBeGreaterThan(5_000_000);
    expect(copied.startsWith("{:report/rows [{:row/id 0")).toBe(true);
    expect(copied.endsWith(":row/amount 19999.50M}]}")).toBe(true);
  });

  it("hides the request list to give the detail view the full width", async () => {
    await selectRow("42");
    await page.click("button[aria-label='Hide request list']");
    expect(await page.$(".request-list")).toBeNull();
    await page.click("button[aria-label='Show request list']");
    expect(await page.$(".request-list")).not.toBeNull();
  });

  it("resizes the request list by dragging the splitter on its border, and remembers the width", async () => {
    await selectRow("42");
    const before = await listPaneBox();
    const splitter = await splitterBox();
    // Centered on the list's border, like the Network panel's.
    expect(splitter.x + splitter.width / 2).toBe(before.right);
    await dragSplitter(before.right + 150);
    expect((await listPaneBox()).width).toBe(before.width + 150);
    await page.reload();
    await page.waitForSelector(".request-list tbody tr");
    await selectRow("42");
    expect((await listPaneBox()).width).toBe(before.width + 150);
  });

  it("keeps both panes usable when the splitter is dragged to either edge", async () => {
    await selectRow("42");
    await dragSplitter(0);
    expect((await listPaneBox()).width).toBe(50);
    await dragSplitter(5000);
    expect(1300 - (await listPaneBox()).right).toBe(30);
    await page.click("button[aria-label=Close]");
    expect(await page.$(".detail")).toBeNull();
  });

  it("shrinks a wide list to fit a narrower panel, and restores it when there is room again", async () => {
    await selectRow("42");
    await dragSplitter(1000);
    await page.setViewport({ width: 560, height: 650, deviceScaleFactor: 2 });
    expect((await listPaneBox()).width).toBe(530);
    await page.setViewport({ width: 1300, height: 650, deviceScaleFactor: 2 });
    expect((await listPaneBox()).width).toBe(1000);
  });

  it("fits the detail controls in a narrow panel (DevTools docked to the side)", async () => {
    await page.setViewport({ width: 560, height: 650, deviceScaleFactor: 2 });
    await selectRow("42");
    const overflow = await page.$eval(".segmented button:last-child", (button) => {
      const { right } = button.getBoundingClientRect();
      return right - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    await screenshot("narrow");
  });

  it("closes the detail view", async () => {
    await selectRow("42");
    await page.click("button[aria-label=Close]");
    expect(await page.$(".detail")).toBeNull();
  });
});

describe("screenshots for review", () => {
  for (const scheme of ["light", "dark"] as const) {
    it(`renders the main states (${scheme})`, async () => {
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
      await screenshot(`list-${scheme}`);
      await selectRow("42");
      await doubleClickEdn((await ednSelection()).doc.indexOf("{:order/id"), "left");
      await screenshot(`form-select-${scheme}`);
      await clickInEdn(":order/status");
      await screenshot(`edn-${scheme}`);
      const mod = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.down(mod);
      await page.keyboard.press("f");
      await page.keyboard.up(mod);
      await page.keyboard.type("order");
      await screenshot(`search-${scheme}`);
      await page.keyboard.press("Escape");
      await selectRow("payments");
      await screenshot(`string-chip-${scheme}`);
      await page.hover(".cm-string-chip");
      await page.screenshot({
        path: resolve(SCREENSHOTS, `string-chip-hover-${scheme}.png`),
        clip: { x: 430, y: 110, width: 500, height: 60 },
      });
      await page.click(".cm-string-chip");
      await page.waitForSelector(".text-viewer .cm-content");
      await screenshot(`text-viewer-${scheme}`);
      await page.click(".segmented button:nth-child(2)");
      await selectRow("search?q=transit&limit=50");
      await screenshot(`split-${scheme}`);
      await dragSplitter(600);
      await screenshot(`wide-list-${scheme}`);
    });
  }
});
