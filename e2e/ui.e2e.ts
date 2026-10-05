// The panel UI in a normal headless tab with the sample data (src/sources/dev-samples.ts).
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
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
  await page.setViewport({ width: 1300, height: 650 });
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
    await page.click(".path-footer button");
    await page.waitForFunction(() => document.querySelector(".path-footer button")?.textContent === "Copied");
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

  it("fits the detail controls in a narrow panel (DevTools docked to the side)", async () => {
    await page.setViewport({ width: 560, height: 650 });
    await selectRow("42");
    const overflow = await page.$eval(".segmented button:last-child", (button) => {
      const { right } = button.getBoundingClientRect();
      return right - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: resolve(SCREENSHOTS, "narrow.png") });
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
      await page.screenshot({ path: resolve(SCREENSHOTS, `list-${scheme}.png`) });
      await selectRow("42");
      await clickInEdn(":order/status");
      await page.screenshot({ path: resolve(SCREENSHOTS, `edn-${scheme}.png`) });
      await page.click(".segmented button:nth-child(2)");
      await selectRow("search?q=transit&limit=50");
      await page.screenshot({ path: resolve(SCREENSHOTS, `split-${scheme}.png`) });
    });
  }
});
