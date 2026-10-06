import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer, { type Browser, type CDPSession, type Page } from "puppeteer";

const DIST = resolve(import.meta.dirname, "..", "dist");

/**
 * Launches a visible Chrome for Testing with the built extension (DevTools does not open in headless mode).
 * Set E2E_BROWSER to another Chromium browser's executable (e.g. Brave) to run the same tests there.
 * Uses a throwaway profile with DevTools docked to the bottom: docked to the side, DevTools is too narrow
 * and moves the Transit tab into the hidden "»" overflow, where it can't be clicked.
 */
export async function launchWithExtension(): Promise<{ browser: Browser; close: () => Promise<void> }> {
  const profile = mkdtempSync(join(tmpdir(), "transit-inspector-e2e-"));
  mkdirSync(join(profile, "Default"));
  writeFileSync(
    join(profile, "Default", "Preferences"),
    JSON.stringify({ devtools: { preferences: { currentDockState: JSON.stringify("bottom") } } }),
  );
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    pipe: true,
    enableExtensions: true,
    defaultViewport: null,
    userDataDir: profile,
    args: ["--window-size=1600,1000"],
    ...(process.env.E2E_BROWSER ? { executablePath: process.env.E2E_BROWSER } : {}),
  });
  // Not `enableExtensions: [DIST]`: Puppeteer 25 doesn't await that install (`Promise.all([paths.map(...)])`),
  // so on slow machines DevTools could open before the extension existed and never show the Transit tab.
  await browser.installExtension(DIST);
  const close = async () => {
    await browser.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  return { browser, close };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Opens a page with DevTools and switches DevTools to the Transit tab.
 * The extension installs after launch, so only DevTools windows opened afterwards reliably have the tab: always
 * use a new page. The page navigates only once its DevTools shows the Transit tab: DevTools then records network
 * traffic, so the page's requests on load are captured even on slow machines.
 */
export async function openPageWithTransitPanel(browser: Browser, url: string): Promise<{ page: Page; panel: Panel }> {
  const page = await browser.newPage();
  const devtools = await page.openDevTools();
  await waitForTransitTab(devtools, false);
  await page.goto(url);
  await waitForTransitTab(devtools, true);
  const target = await browser.waitForTarget((t) => t.url().endsWith("/panel.html"), { timeout: 10_000 });
  return { page, panel: new Panel(await target.createCDPSession()) };
}

async function waitForTransitTab(devtools: Page, click: boolean): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await findTransitTab(devtools, click)) return;
    await sleep(250);
  }
  throw new Error("Transit tab not found in DevTools");
}

/** Whether the DevTools window has the Transit tab; clicks it if `click` is set. */
function findTransitTab(devtools: Page, click: boolean): Promise<boolean> {
  return devtools.evaluate((click) => {
    const find = (root: Document | ShadowRoot): HTMLElement | null => {
      for (const el of root.querySelectorAll<HTMLElement>('[role="tab"]')) {
        if (el.textContent?.trim() === "Transit") return el;
      }
      for (const el of root.querySelectorAll("*")) {
        const found = el.shadowRoot && find(el.shadowRoot);
        if (found) return found;
      }
      return null;
    };
    const tab = find(document);
    if (!tab) return false;
    if (click) {
      tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      tab.click();
    }
    return true;
  }, click);
}

/** Runs code inside the real Transit panel, where `chrome.devtools.*` is available. */
export class Panel {
  constructor(private readonly session: CDPSession) {}

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.session.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value as T;
  }

  /** Polls until the panel's visible text contains `text`. */
  async waitForText(text: string, timeoutMs = 5_000): Promise<string> {
    return this.waitFor<string>('document.body?.innerText ?? ""', (body) => body.includes(text), timeoutMs);
  }

  /** Polls `expression` until `done` accepts its value; returns that value. */
  async waitFor<T>(expression: string, done: (value: T) => boolean, timeoutMs = 5_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let value = await this.evaluate<T>(expression);
    while (!done(value)) {
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting on ${expression}. Last value: ${JSON.stringify(value)}`);
      await sleep(100);
      value = await this.evaluate<T>(expression);
    }
    return value;
  }
}
