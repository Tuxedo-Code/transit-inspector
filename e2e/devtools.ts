import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer, { type Browser, type CDPSession, type KeyInput, type Page, type Protocol } from "puppeteer";

const DIST = resolve(import.meta.dirname, "..", "dist");
const SCREENSHOTS = resolve(import.meta.dirname, "screenshots");

/**
 * Launches a visible Chrome for Testing with the built extension (DevTools does not open in headless mode).
 * Set E2E_BROWSER to another Chromium browser's executable (e.g. Brave) to run the same tests there.
 * Uses a throwaway profile with DevTools docked to the bottom: docked to the side, DevTools is too narrow
 * and moves the Transit tab into the hidden "»" overflow, where it can't be clicked.
 * `dock: "undocked"` opens DevTools in a window of its own instead (store/ sizes it for screenshots).
 */
export async function launchWithExtension(
  options: { dock?: "bottom" | "undocked"; args?: string[] } = {},
): Promise<{ browser: Browser; close: () => Promise<void> }> {
  const profile = mkdtempSync(join(tmpdir(), "transit-inspector-e2e-"));
  mkdirSync(join(profile, "Default"));
  writeFileSync(
    join(profile, "Default", "Preferences"),
    JSON.stringify({ devtools: { preferences: { currentDockState: JSON.stringify(options.dock ?? "bottom") } } }),
  );
  const browser = await puppeteer.launch({
    headless: false,
    // No `devtools: true`: it opens a second DevTools for every tab. With two, the one under test sometimes
    // renders no frames on Linux (Xvfb), so the Transit tab never reaches its DOM (~8% of CI runs).
    pipe: true,
    enableExtensions: true,
    defaultViewport: null,
    userDataDir: profile,
    args: ["--window-size=1600,1000", ...(options.args ?? [])],
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
 * Opens DevTools on the browser's one tab and switches it to the Transit tab. Call once per launch: DevTools must
 * open only after the extension installed, and exactly one DevTools may be open (see `launchWithExtension`).
 * The page navigates only once its DevTools shows the Transit tab: DevTools then records network traffic, so the
 * page's requests on load are captured even on slow machines.
 */
export async function openPageWithTransitPanel(
  browser: Browser,
  url: string,
): Promise<{ page: Page; devtools: Page; panel: Panel }> {
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  const devtools = await page.openDevTools();
  await waitForTransitTab(browser, devtools, false);
  await page.goto(url);
  await waitForTransitTab(browser, devtools, true);
  const target = await browser.waitForTarget((t) => t.url().endsWith("/panel.html"), { timeout: 10_000 });
  return { page, devtools, panel: await Panel.create(await target.createCDPSession()) };
}

/** Cmd on macOS, Ctrl elsewhere: the modifier of DevTools' and CodeMirror's shortcuts. */
export const MOD = process.platform === "darwin" ? "Meta" : "Control";

/**
 * Presses a shortcut as a user would, through the DevTools window: the browser routes it to the focused frame,
 * so a focused panel gets it first, then DevTools' own key forwarding.
 */
export async function pressShortcut(devtools: Page, ...keys: KeyInput[]): Promise<void> {
  const key = keys.at(-1) as KeyInput;
  const modifiers = keys.slice(0, -1);
  for (const modifier of modifiers) await devtools.keyboard.down(modifier);
  await devtools.keyboard.press(key);
  for (const modifier of modifiers.reverse()) await devtools.keyboard.up(modifier);
}

/**
 * DevTools builds its UI from nested shadow roots. Puppeteer's `>>>` combinator matches inside all of them, so
 * `selector` is a plain CSS selector.
 */
const deep = (selector: string) => `>>> ${selector}`;

/** The trimmed text of each visible element in DevTools that matches `selector`. */
function visibleTexts(devtools: Page, selector: string): Promise<string[]> {
  return devtools.$$eval(deep(selector), (elements) =>
    elements
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((el) => el.textContent?.trim() ?? ""),
  );
}

/** What DevTools itself shows around the panel: its search bar, the Console drawer, the command menu. */
export async function devtoolsUi(
  devtools: Page,
): Promise<{ searchBar: boolean; drawer: boolean; commandMenu: boolean }> {
  const [searchBars, tabs, commandMenus] = await Promise.all([
    visibleTexts(devtools, ".search-bar"),
    visibleTexts(devtools, '[role="tab"]'),
    visibleTexts(devtools, ".filtered-list-widget"),
  ]);
  return {
    searchBar: searchBars.length > 0,
    // The drawer adds a second Console tab next to the main one.
    drawer: tabs.filter((tab) => tab === "Console").length > 1,
    commandMenu: commandMenus.length > 0,
  };
}

async function waitForTransitTab(browser: Browser, devtools: Page, click: boolean): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await findTransitTab(devtools, click)) return;
    await sleep(250);
  }
  // Say why, so a flaky failure on CI can be diagnosed from its log and screenshot alone.
  mkdirSync(SCREENSHOTS, { recursive: true });
  await devtools.screenshot({ path: join(SCREENSHOTS, "devtools-without-transit-tab.png") }).catch(() => {});
  const tabs = await devtools.$$eval(deep('[role="tab"]'), (els) => els.map((el) => el.textContent?.trim() ?? ""));
  const state = await devtools.evaluate(() => ({ width: innerWidth, readyState: document.readyState }));
  const extensionPages = browser
    .targets()
    .map((target) => target.url())
    .filter((url) => url.startsWith("chrome-extension://"));
  throw new Error(
    `Transit tab not found in DevTools. DevTools tabs: ${JSON.stringify(tabs)}, width ${state.width}px, ` +
      `document ${state.readyState}; extension pages: ${JSON.stringify(extensionPages)}. ` +
      "Screenshot: e2e/screenshots/devtools-without-transit-tab.png",
  );
}

/** Whether the DevTools window has the Transit tab; clicks it if `click` is set. */
function findTransitTab(devtools: Page, click: boolean): Promise<boolean> {
  return findTab(devtools, "Transit", click);
}

/** Switches DevTools to one of its tabs (e.g. "Network"), as a click on the tab would. */
export async function showDevtoolsTab(devtools: Page, name: string): Promise<void> {
  if (!(await findTab(devtools, name, true))) throw new Error(`No ${name} tab in DevTools`);
}

/**
 * Turns the Network panel's own "Keep log" on or off. Show the Network tab first: DevTools creates the panel's
 * toolbar the first time it is shown.
 */
export async function setNetworkKeepLog(devtools: Page, on: boolean): Promise<void> {
  const found = await devtools.$$eval(
    deep("devtools-checkbox"),
    (checkboxes, on) => {
      const checkbox = checkboxes.find(
        (el) => el.shadowRoot?.textContent?.includes("Keep log") && el.getBoundingClientRect().width > 0,
      );
      const input = checkbox?.shadowRoot?.querySelector("input");
      if (input && input.checked !== on) input.click();
      return input?.checked === on;
    },
    on,
  );
  if (!found) throw new Error("No Keep log checkbox in the Network panel");
}

function findTab(devtools: Page, name: string, click: boolean): Promise<boolean> {
  return devtools.$$eval(
    deep('[role="tab"]'),
    (tabs, name, click) => {
      const tab = tabs.find((el) => el.textContent?.trim() === name);
      if (!(tab instanceof HTMLElement)) return false;
      if (click) {
        tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        tab.click();
      }
      return true;
    },
    name,
    click,
  );
}

/** Runs code inside the real Transit panel, where `chrome.devtools.*` is available. */
export class Panel {
  /** Every CSP violation in the panel since it loaded (see docs/spec.md "Privacy"). */
  readonly cspIssues: Protocol.Audits.ContentSecurityPolicyIssueDetails[] = [];
  // A plain field, not a parameter property, so Node can run this file without a build (see store/).
  private readonly session: CDPSession;

  private constructor(session: CDPSession) {
    this.session = session;
  }

  static async create(session: CDPSession): Promise<Panel> {
    const panel = new Panel(session);
    session.on("Audits.issueAdded", ({ issue }) => {
      const details = issue.details.contentSecurityPolicyIssueDetails;
      if (details) panel.cspIssues.push(details);
    });
    // Replays the issues raised before this, so violations while the panel started up count too.
    await session.send("Audits.enable");
    return panel;
  }

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
