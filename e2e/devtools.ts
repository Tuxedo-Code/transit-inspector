import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer, { type Browser, type CDPSession, type Page, type Target } from "puppeteer";

const DIST = resolve(import.meta.dirname, "..", "dist");

/**
 * Launches a visible Chrome for Testing with the built extension (DevTools does not open in headless mode).
 * Set E2E_BROWSER to another Chromium browser's executable (e.g. Brave) to run the same tests there.
 * Uses a throwaway profile with DevTools docked to the bottom: docked to the side, DevTools is too narrow
 * and moves the Transit tab into the hidden "»" overflow, where it can't be clicked.
 */
export async function launchWithExtension(): Promise<{ browser: Browser; close: () => Promise<void> }> {
  const profile = mkdtempSync(join(tmpdir(), "transit-debugger-e2e-"));
  mkdirSync(join(profile, "Default"));
  writeFileSync(
    join(profile, "Default", "Preferences"),
    JSON.stringify({ devtools: { preferences: { currentDockState: JSON.stringify("bottom") } } }),
  );
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    pipe: true,
    enableExtensions: [DIST],
    defaultViewport: null,
    userDataDir: profile,
    args: ["--window-size=1600,1000"],
    ...(process.env.E2E_BROWSER ? { executablePath: process.env.E2E_BROWSER } : {}),
  });
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
 * use a new page. Other tabs are closed so theirs is the only DevTools window; the initial blank tab's DevTools
 * sometimes gets the Transit tab too, and clicking that one would inspect the wrong page.
 */
export async function openPageWithTransitPanel(browser: Browser, url: string): Promise<{ page: Page; panel: Panel }> {
  const others = await browser.pages();
  const page = await browser.newPage();
  for (const other of others) await other.close();
  await sleep(1000); // let DevTools open and run the extension's devtools page
  await page.goto(url);
  await clickTransitTab(browser);
  const target = await browser.waitForTarget((t) => t.url().endsWith("/panel.html"), { timeout: 10_000 });
  return { page, panel: new Panel(await target.createCDPSession()) };
}

async function clickTransitTab(browser: Browser): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const target of browser.targets().filter((t) => t.url().startsWith("devtools://"))) {
      const clicked = await clickTransitTabIn(target).catch(() => false); // window may be closing (its tab was closed)
      if (clicked) return;
    }
    await sleep(250);
  }
  throw new Error("Transit tab not found in any DevTools window");
}

async function clickTransitTabIn(target: Target): Promise<boolean> {
  const devtools = await target.asPage();
  return devtools.evaluate(() => {
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
    tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    tab.click();
    return true;
  });
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
