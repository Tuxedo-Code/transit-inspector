// Regenerates the Chrome Web Store images in this folder: `npm run build && node store/make-images.ts`.
// Screenshots come from the real extension in real DevTools (a visible Chrome window opens), replaying
// samples/basic.har from a local server that Chrome reaches as app.example.com.
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Entry, Har } from "har-format";
import type { Page } from "puppeteer";
import { launchWithExtension, MOD, openPageWithTransitPanel, type Panel, pressShortcut } from "../e2e/devtools.ts";

const HOST = "app.example.com";
// The Web Store takes screenshots of exactly 1280x800 (or 640x400). At 1x, DevTools' 12px text is unreadable in the
// store, so DevTools gets an 800x500 window that is captured zoomed to 1280x800. That needs a retina display:
// the capture then downsamples real pixels instead of upscaling.
const ZOOM = 1.6;
const WIDTH = 1280 / ZOOM;
const HEIGHT = 800 / ZOOM;
const STORE = { width: WIDTH, height: HEIGHT, zoom: ZOOM };
// The README screenshot, docs/screenshot-{light,dark}.png.
const README = { width: 900, height: 300, zoom: 2 };

const har: Har = JSON.parse(readFileSync(new URL("../samples/basic.har", import.meta.url), "utf8"));
const calls = har.log.entries.filter((e) =>
  ["fetch", "xhr"].includes((e as Entry & { _resourceType: string })._resourceType),
);

/** The page makes the HAR's Fetch/XHR calls one after another, so they are listed in HAR order. */
function page(): string {
  const requests = calls.map((e) => ({
    xhr: (e as Entry & { _resourceType: string })._resourceType === "xhr",
    method: e.request.method,
    path: new URL(e.request.url).pathname + new URL(e.request.url).search,
    type: e.request.postData?.mimeType,
    body: e.request.postData?.text,
  }));
  return `<!doctype html><title>Example app</title><script>
(async () => {
  for (const r of ${JSON.stringify(requests)}) {
    const headers = r.type ? { "content-type": r.type } : {};
    if (r.xhr) {
      await new Promise((done) => {
        const xhr = new XMLHttpRequest();
        xhr.open(r.method, r.path);
        xhr.onloadend = done;
        xhr.send(r.body);
      });
    } else {
      await fetch(r.path, { method: r.method, headers, body: r.body }).catch(() => {});
    }
  }
  document.title = "done";
})();
</script>`;
}

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(page());
  }
  const entry = calls.find((e) => {
    const url = new URL(e.request.url);
    return e.request.method === req.method && url.pathname + url.search === req.url;
  });
  if (!entry) {
    res.writeHead(404);
    return res.end();
  }
  // A request that never got a response in the HAR (status 0) fails the same way here.
  if (entry.response.status === 0) return req.socket.destroy();
  const content = entry.response.content;
  const type = entry.response.headers.find((h) => h.name === "content-type")?.value;
  res.writeHead(entry.response.status, entry.response.statusText, type ? { "content-type": type } : {});
  res.end(Buffer.from(content.text ?? "", content.encoding === "base64" ? "base64" : "utf8"));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

const { browser, close } = await launchWithExtension({
  dock: "undocked",
  // Chrome would upgrade plain http to https for a public host name, and the local server has no certificate.
  args: [
    `--host-resolver-rules=MAP ${HOST} 127.0.0.1:${port}`,
    "--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable",
  ],
});
try {
  const { page: inspected, devtools, panel } = await openPageWithTransitPanel(browser, `http://${HOST}/`);
  await inspected.waitForFunction(() => document.title === "done");
  // The sample's 404, 500 and failed requests log errors, which DevTools counts in a red badge at the top.
  await inspected.evaluate(() => console.clear());
  await sizeWindow(devtools, WIDTH, HEIGHT);
  const dpr = await devtools.evaluate(() => devicePixelRatio);
  const zoom = Math.max(STORE.zoom, README.zoom);
  if (dpr < zoom) throw new Error(`Run this on a retina display: zooming ${zoom}x at devicePixelRatio ${dpr} blurs`);
  // The window is real: the system pointer may rest over a row and show its hover color.
  await devtools.mouse.move(0, 0);

  // Each screenshot shows a different feature.
  // 1. EDN and the request list, with the cursor on a value and its path in the footer.
  await select(panel, "42");
  await setViewMode(panel, "EDN");
  await panel.evaluate(`document.querySelector(".cm-content").focus()`);
  for (let i = 0; i < 15; i++) await devtools.keyboard.press("ArrowDown");
  await devtools.keyboard.press("End");
  await panel.waitFor<string>(`document.querySelector(".path-footer .path")?.textContent ?? ""`, (p) => p !== "");
  await shoot(devtools, "light", "screenshot-1-edn");

  // 2. Side by side, on a response full of Transit's cache codes ("^0"), with the list hidden to make room.
  await select(panel, "feed?page=2&size=20");
  await setViewMode(panel, "Side by side");
  await clickButton(panel, "Hide request list");
  await shoot(devtools, "dark", "screenshot-2-side-by-side");
  await clickButton(panel, "Show request list");
  await setViewMode(panel, "EDN");

  // 3. A string holding EDN, opened pretty-printed from its chip, next to the chips of a JSON and a long string.
  await select(panel, "17");
  await hover(devtools, panel, ".cm-string-chip[data-text=EDN]");
  await devtools.mouse.down();
  await devtools.mouse.up();
  await panel.waitFor<boolean>(`!!document.querySelector(".string-viewer .cm-content")`, Boolean);
  await shoot(devtools, "light", "screenshot-3-string");
  await clickButton(panel, "Close string");

  // 4. A problem underlined, with its message on hover: an app-specific tag without a handler.
  // The theme is set first: changing it closes the tooltip.
  await select(panel, "search?q=transit&limit=50");
  await devtools.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await hover(devtools, panel, ".cm-lintRange-warning");
  await panel.waitFor<boolean>(`!!document.querySelector(".cm-tooltip-lint")`, Boolean);
  await shoot(devtools, "dark", "screenshot-4-problems");
  await devtools.mouse.move(0, 0);

  // 5. Search all requests, opened with Cmd+F outside the editors, with a match opened in its request.
  await select(panel, "42");
  await panel.evaluate(`document.activeElement?.blur()`);
  await pressShortcut(devtools, MOD, "f");
  await panel.waitFor<boolean>(`!!document.activeElement?.matches(".search-field input")`, Boolean);
  await devtools.keyboard.type(":item/sku");
  await devtools.keyboard.press("Enter");
  await panel.waitFor<boolean>(`!!document.querySelector(".search-match")`, Boolean);
  await panel.evaluate(`document.querySelectorAll(".search-match")[1].click()`);
  await panel.waitFor<string>(`document.querySelector(".search-match.selected") ? "yes" : ""`, Boolean);
  await shoot(devtools, "light", "screenshot-5-search");
  await clickButton(panel, "Close search");

  // The README's: EDN next to the raw Transit, with a path, in a window about as wide as GitHub shows it (so the
  // text isn't shrunk), at 2x. The list is hidden to give both panes room. In both themes: the README picks the
  // one matching the reader's. The search response is short enough for side by side and has the most Transit types.
  await sizeWindow(devtools, README.width, README.height);
  await select(panel, "search?q=transit&limit=50");
  await setViewMode(panel, "Side by side");
  await clickButton(panel, "Hide request list");
  await panel.evaluate(`document.querySelector(".cm-content").focus()`);
  for (let i = 0; i < 4; i++) await devtools.keyboard.press("ArrowDown");
  await devtools.keyboard.press("End");
  for (let i = 0; i < 3; i++) await devtools.keyboard.press("ArrowLeft");
  await panel.waitFor<string>(`document.querySelector(".path-footer .path")?.textContent ?? ""`, (p) => p !== "");
  for (const scheme of ["light", "dark"] as const) {
    await shoot(devtools, scheme, new URL(`../docs/screenshot-${scheme}.png`, import.meta.url), README);
  }

  await promoTile(await browser.newPage());
} finally {
  await close();
  server.close();
}

/** The 440x280 "small promo tile": the icon, the name, and what it does to a Transit body. */
async function promoTile(page: Page): Promise<void> {
  const icon = readFileSync(new URL("../icons/icon.svg", import.meta.url)).toString("base64");
  await page.setViewport({ width: 440, height: 280, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html>
<style>
  body { margin: 0; width: 440px; height: 280px; box-sizing: border-box; padding: 0 36px;
    display: flex; flex-direction: column; justify-content: center;
    background: linear-gradient(160deg, #f4f2ff, #e0dbfb); font-family: system-ui, sans-serif; color: #1f1f1f; }
  header { display: flex; align-items: center; gap: 16px; }
  img { width: 64px; height: 64px; }
  h1 { margin: 0; font-size: 30px; font-weight: 650; letter-spacing: -0.3px; }
  p { margin: 4px 0 0; font-size: 15px; color: #474747; }
  pre { margin: 30px 0 0; font: 13px/1.7 ui-monospace, monospace; }
  .from { color: #7d7d8c; }
  .kw { color: #881280; } .tag { color: #881280; } .str { color: #dc362e; }
</style>
<header>
  <img src="data:image/svg+xml;base64,${icon}" alt="">
  <div><h1>Transit Inspector</h1><p>Transit traffic as EDN, in DevTools</p></div>
</header>
<pre><span class="from">["^ ","~:user/id","~u550e8400-e29b…"]</span>
<span class="kw">{:user/id</span> <span class="tag">#uuid</span> <span class="str">"550e8400-e29b…"</span><span class="kw">}</span></pre>`);
  await page.$eval("img", (img) => img.decode());
  await page.screenshot({
    path: new URL("promo-tile.png", import.meta.url).pathname,
    clip: { x: 0, y: 0, width: 440, height: 280, scale: 0.5 },
  });
}

/** Resizes the DevTools window so its page is exactly `width` x `height` CSS pixels. */
async function sizeWindow(devtools: Page, width: number, height: number): Promise<void> {
  const session = await devtools.createCDPSession();
  const { windowId, bounds } = await session.send("Browser.getWindowForTarget");
  const inner = () => devtools.evaluate(() => [innerWidth, innerHeight]);
  let [w, h] = await inner();
  let outer = { width: bounds.width ?? width, height: bounds.height ?? height };
  for (let attempt = 0; attempt < 5 && (w !== width || h !== height); attempt++) {
    outer = { width: outer.width + width - (w ?? 0), height: outer.height + height - (h ?? 0) };
    await session.send("Browser.setWindowBounds", { windowId, bounds: { ...outer, windowState: "normal" } });
    await new Promise((r) => setTimeout(r, 300));
    [w, h] = await inner();
  }
  if (w !== width || h !== height) throw new Error(`DevTools is ${w}x${h}, wanted ${width}x${height}`);
}

async function select(panel: Panel, name: string): Promise<void> {
  await panel.evaluate(
    `[...document.querySelectorAll(".request-list tbody tr")].find((tr) => tr.cells[0].textContent === ${JSON.stringify(name)}).click()`,
  );
  await panel.waitFor<boolean>(`!!document.querySelector(".cm-content")`, Boolean);
}

async function setViewMode(panel: Panel, label: string): Promise<void> {
  await panel.evaluate(
    `[...document.querySelectorAll("button")].find((b) => b.textContent === ${JSON.stringify(label)}).click()`,
  );
}

/** Clicks the panel's icon button labeled `label`. */
async function clickButton(panel: Panel, label: string): Promise<void> {
  await panel.evaluate(`document.querySelector(${JSON.stringify(`button[aria-label="${label}"]`)}).click()`);
}

/** Moves the real mouse over the middle of the panel element matching `selector`. */
async function hover(devtools: Page, panel: Panel, selector: string): Promise<void> {
  const frame = await devtools.evaluate(() => {
    const find = (root: Document | ShadowRoot): HTMLIFrameElement | null => {
      for (const el of root.querySelectorAll("iframe")) if (el.src.endsWith("/panel.html")) return el;
      for (const el of root.querySelectorAll("*")) {
        const found = el.shadowRoot && find(el.shadowRoot);
        if (found) return found;
      }
      return null;
    };
    const { x, y } = find(document)?.getBoundingClientRect() ?? { x: 0, y: 0 };
    return { x, y };
  });
  const box = await panel.evaluate<{ x: number; y: number; width: number; height: number }>(
    `(({ x, y, width, height }) => ({ x, y, width, height }))(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect())`,
  );
  await devtools.mouse.move(frame.x + box.x + box.width / 2, frame.y + box.y + box.height / 2, { steps: 5 });
}

/** Saves the DevTools window, zoomed by `size.zoom`; `file` is a name in this folder or a URL. */
async function shoot(
  devtools: Page,
  scheme: "light" | "dark",
  file: string | URL,
  { width, height, zoom } = STORE,
): Promise<void> {
  await devtools.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await new Promise((r) => setTimeout(r, 500));
  const scale = zoom / (await devtools.evaluate(() => devicePixelRatio));
  await devtools.screenshot({
    path: (typeof file === "string" ? new URL(`${file}.png`, import.meta.url) : file).pathname,
    clip: { x: 0, y: 0, width, height, scale },
  });
}
