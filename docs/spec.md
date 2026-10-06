# Transit Inspector - Spec

Source of truth for product and architecture decisions. If an implementation needs to deviate, update this file in the same change and say why.

Last updated: 2026-10-06

## Goal

A browser extension (Manifest V3) that adds a **"Transit"** tab to DevTools. It lists the page's Fetch/XHR requests and shows the Transit ones decoded as readable, Clojure-style EDN, next to the raw Transit JSON.

Primary use: open DevTools on an app that talks Transit to its backend, click a request, read the decoded request payload and response body.

## Supported browsers

- **Chrome** and **Brave**: supported. The full real-DevTools test suite passes in both (verified with Chrome for Testing 154 and Brave 154). The same build works unchanged.
- Other Chromium browsers (Edge, Vivaldi, Opera, Arc) use the same extension APIs and likely work, but are untested.
- **Firefox**: maybe later (see "Later"). Known gaps: HAR entries probably lack Chrome's `_resourceType` (used for the Fetch/XHR filter), no `setThemeChangeHandler`, and permanent installs need Mozilla signing (free) or Developer Edition/Nightly.
- **Safari**: not planned (requires an Xcode app wrapper and an Apple Developer account).

## Non-goals

- **Observe only.** No pausing, editing, overriding or mocking requests. That would require `chrome.debugger` (yellow "debugging this browser" bar, `debugger` permission) and is out of scope for now.
- **Not a Network panel replacement.** No headers, timings, cookies, initiators, waterfall. Use the Network panel for those.
- No WebSocket traffic.
- No `application/transit+msgpack` decoding (shown as unsupported).
- No capture while DevTools is closed.
- No `.crx`. Chrome Web Store publishing isn't set up yet, but release zips are valid store uploads (see "Releases").
- No synced collapse/fold state between the EDN and Transit panes.

## Architecture

- `manifest.json` (MV3) declares `devtools_page: devtools.html`. No permissions, no host permissions, no background service worker, no content scripts.
- `devtools.html` registers the panel with `chrome.devtools.panels.create("Transit", ...)` pointing at `panel.html`.
- The panel reads traffic from `chrome.devtools.network` (`onRequestFinished`, `getHAR`, `request.getContent()`, `onNavigated`).
- **Data source boundary.** The UI consumes requests through a small interface with two implementations:
  - DevTools source: wraps `chrome.devtools.network`.
  - Sample data source: loads recorded requests from HAR files.

  The whole UI therefore runs in a normal browser tab with hot reload and is testable without DevTools. Only the DevTools source needs DevTools to test.
- **Sample data** is HAR files with content, exported from the Network panel (right-click > "Save all as HAR with content"). HAR is the same data model `chrome.devtools.network` returns, so both sources share one parser. Real traffic from an app becomes sample data in one click. Sample files live in the repo for tests and development.

### Capture and navigation (verified in T02, Chrome 154)

- Everything lives in the panel; `devtools.html` only registers the panel.
- **On panel start:** subscribe to `onRequestFinished`, then call `getHAR()` to backfill.
  - `getHAR()` returns every request DevTools has recorded since it opened, even if neither the Network panel nor our panel was open yet.
  - Its entries support `getContent()`.
  - Deduplicate entries seen by both by `startedDateTime` + method + URL.
- **`onRequestFinished`** delivers requests in finish order, so sort by `startedDateTime`.
- **Navigation: mirror DevTools' own log.** On `onNavigated`, re-read `getHAR()` and rebuild the list from it.
  - `onNavigated` also fires on SPA `history.pushState` and several times per reload, so it cannot mean "clear" by itself.
  - `getHAR()` keeps entries across `pushState` and drops them on a real page load, exactly like the Network panel.
- Request payload: `request.postData.text`. Response body: `getContent((content, encoding))`, where `encoding` is `""` for text.

## Request capture rules

- **Only Fetch/XHR requests are listed** (HAR `_resourceType` is `"fetch"` or `"xhr"`; verified). Everything else is ignored entirely.
- **Transit detection** (either is enough):
  - content type `application/transit+json` (any parameters, e.g. charset), or
  - body sniffing: valid JSON containing Transit markers (`"^ "`, `"~:"`, `"~#"`, etc.), to catch Transit served as `application/json`.

  Detection applies to the request payload and the response body independently.
- Fetch/XHR requests with no Transit in either direction are **listed grayed out and not selectable**.
- `application/transit+msgpack` is listed grayed out with the label "transit+msgpack (not supported)".
- **Order:** by request start time (browser side), like the Network panel. A request appears when it finishes, inserted at its start-time position. HAR start times have millisecond precision; requests started in the same millisecond keep the order DevTools lists them in (arrival order until the next `getHAR()` rebuild).
- **Failed requests:**
  - 4xx/5xx responses with a Transit body are decoded like any other response;
  - requests that never got a response (network error, CORS, cancelled) are listed grayed.
- **A real page load clears the list; SPA route changes do not** (see "Capture and navigation"). "Preserve log" is a later feature; mirroring `getHAR()` may already follow the Network panel's own "Preserve log" checkbox (unverified).
- **Memory:**
  - Fetch the response body for every Fetch/XHR response whose content type is Transit, JSON-like or missing.
  - Sniff only the first few KB for Transit markers.
  - Keep the body only if it is Transit.
  - Decode only when a request is selected.
  - Cap the list (default: last 1,000 requests, oldest dropped).

## Decoding and EDN output

- Decode with the official `transit-js` library (JSON format only).
- Print our own EDN text from the decoded value, pretty-printed with indentation:
  - keywords (incl. namespaced) and symbols;
  - strings (escaped), chars;
  - integers, including those above 2^53, shown exactly with no rounding;
  - floats, big integers, big decimals;
  - `nil`, `true`, `false`;
  - `#uuid "..."`, `#inst "..."`, URIs;
  - vectors, lists, sets, maps (including non-scalar keys);
  - tagged values from app-specific handlers as `#tag value`.
- Map entries and set elements keep their order on the wire.
- Known limit: a float sent as `1.0` arrives from JSON as `1` and prints as an integer. Transit itself does not distinguish them in JSON.
- The printer also produces a **path index**: for each printed node, its text range and its EDN path (e.g. `[:user :orders 0 :id]`). This powers the path footer.
  - Set elements use the element itself as the path step.
  - Elements inside lists use their position, even though `get-in` cannot index lists.
- **Problems are marked in place** (error underline plus a message on hover):
  - malformed Transit or invalid JSON: marked in the raw pane at the error position, and the decoded pane shows the error message;
  - unknown Transit tags: shown as `#tag value` and marked;
  - precision loss and other decoding warnings: marked at the value.
- Empty bodies, non-JSON bodies, and bodies DevTools no longer holds each get a clear empty state.

## UI

### Layout

- Left: request list. Right: detail view of the selected request.
- The list can be hidden with a toolbar toggle so the detail view gets the full width, and shown again.

### Request list

- Columns: Name, method, status, size, time.
- **Name** replicates the Network panel's Name column: last path segment plus query string (e.g. `orders?status=open`). Full URL in a tooltip and in the detail header.
- **Size** is the response body size.
- **Filter box:** case-insensitive substring match on the full URL (path plus query), applied as you type. Chronological order is kept.
- Auto-scroll to new requests only when already scrolled to the bottom.
- Clear button.
- Empty list shows "No Transit requests yet".
- When navigation or Clear empties the list, the detail view resets.

### Detail view

- **Header bar:** method, full URL, status code.
- **Switch:** "Payload" | "Response" (the Network panel's own tab names; short enough for DevTools docked to the side). Requests without a body show an empty state.
- A request is selectable if either direction is Transit. A non-Transit body in the other direction is shown in the raw pane, and the EDN pane says "Not Transit".
- **View mode:** EDN only (default) | side by side | Transit only.
  - Applies to both payload and response.
  - Remembered across requests and sessions.
  - Hiding one pane to read a single view full width is the key feature.
- **Panes** are read-only code editors (CodeMirror 6):
  - decoded EDN with Clojure/EDN highlighting;
  - raw Transit with JSON highlighting, shown exactly as received: no re-formatting, line wrapping on.
- **Default editor behavior** (no custom click or double-click behavior):
  - normal mouse/keyboard selection, Cmd+A and Cmd+C, including long strings and selections larger than the screen;
  - folding arrows in the gutter of the EDN pane for maps, vectors, lists and sets, with everything unfolded by default (the raw pane has no folding since it is not re-formatted);
  - Cmd+F search within the pane;
  - large documents stay fast because the editor only draws the visible part.
- **Path footer** (EDN pane only):
  - a footer under the EDN pane shows the EDN path of the value at the cursor or selection, as a `get-in` vector (e.g. `[:user :orders 0 :id]`), from the path index;
  - it updates as the cursor moves and is empty when the cursor is not on a value;
  - a small "Copy" button next to the path copies it;
  - no keyboard shortcut and no toolbar button.
- **Side by side:** each pane scrolls on its own horizontally. Vertical scroll sync is a later nice-to-have.

### Look and feel

- **Feel like a built-in DevTools panel, not a separate app.** Where the Network panel has an equivalent control, copy its look and behavior:
  - filter box;
  - clear button;
  - row height;
  - selection highlight;
  - toolbar.
- **Minimal chrome:**
  - no logo or banner; one thin toolbar row;
  - DevTools fonts and sizes (UI about 12px system font, code in monospace);
  - plain CSS with variables, no UI component library.
- **Theme:** follow the DevTools theme. `chrome.devtools.panels.themeName` is `"default"` (light) or `"dark"`, and `chrome.devtools.panels.setThemeChangeHandler` reports live changes (both verified). With DevTools set to "System preference" this follows the OS. All colors are CSS variables with a light and a dark set.
- **Highlighting** uses DevTools' own object-viewer colors (Console/Network previews), in both themes.

## Stack and tooling

- `mise.toml` pins Node (`node = "24"`). No JVM, no global installs.
- npm with a committed `package-lock.json`.
- TypeScript (strict) with `@types/chrome`.
- Vite builds two HTML entry points (`devtools.html`, `panel.html`, at the project root) into `dist/`. No extension-specific Vite plugin.
- `package.json` holds the only version number. The source `manifest.json` (project root) has no version; a small build plugin (`build/manifest.ts`) emits it into `dist/` with the version filled in. The build fails if the version isn't one Chrome accepts (1-4 integers, no `-beta` suffixes).
- No custom icons in v1; Chrome shows a default.
- Preact for UI.
- CodeMirror 6 for both panes: `@codemirror/lang-json`, `@nextjournal/lang-clojure` for EDN, fold gutter, search, read-only, lint diagnostics for problem marks. Verified to run under the extension CSP. CodeMirror's default colors are unreadable on DevTools dark, so the panes need our own theme.
- `transit-js` for decoding.
- Vitest for unit tests, Biome for lint and format.
- No Web Worker: a 3 MB Transit response decodes, prints and opens in about 100-150 ms on the main thread (measured in T10). Revisit only if real payloads feel slow.

npm scripts:

| Script | Does |
|---|---|
| `dev` | UI in a normal tab with sample data and hot reload |
| `dev:ext` | `vite build --watch` into `dist/` (reload the extension and reopen DevTools to see changes) |
| `build` | typecheck plus production build into `dist/` |
| `test` | Vitest |
| `test:e2e` | build, install Chrome for Testing if missing, run the Puppeteer tests (opens a Chrome window) |
| `lint` | Biome check |
| `package` | build, then zip `dist/` to `transit-inspector-<version>.zip` |

## Install (no store)

1. Download `transit-inspector-<version>.zip` from the latest GitHub Release and unzip it, or build from source with `npm run build` (output in `dist/`).
2. Open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and choose the unzipped folder (or `dist/`).
3. To update, replace the folder's contents (or rebuild) and click the extension's reload button.

Self-signed `.crx` files are not installable on Mac/Windows Chrome without enterprise policy, so they are not used.

## Releases

- [release-please](https://github.com/googleapis/release-please) runs in CI (`release` job in `.github/workflows/ci.yml`), only on pushes to `main` and only after the `check` job passed.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org). `feat:` bumps the minor version, `fix:` and `perf:` the patch version; while below 1.0, breaking changes (`feat!:`) bump the minor. Other types (`docs:`, `ci:`, `chore:`, ...) don't trigger a release and don't show in the changelog.
- Each push with releasable commits opens or updates a "release x.y.z" PR that bumps `package.json`/`package-lock.json` and updates `CHANGELOG.md`. Neither is edited by hand.
- Merging that PR tags `vX.Y.Z`, creates a GitHub Release whose notes are that version's changelog, and attaches `transit-inspector-<version>.zip` (built by `npm run package` in the same job).
- PRs and tags created with `GITHUB_TOKEN` don't trigger workflows, so CI doesn't run on the release PR itself; the merge commit runs `check` before anything is released.
- Repo setting required: Actions > General > "Allow GitHub Actions to create and approve pull requests".
- **Web Store readiness:** the release zip has `manifest.json` at its root and a version Chrome accepts, so it can be uploaded to the Chrome Web Store as is. Publishing still needs icons and a store listing (see "Later"). The first upload is done by hand in the developer dashboard; a CI upload job can follow.

## Testing

- **Unit tests (Vitest):**
  - Transit detection;
  - decoding and EDN printing (a case per type in the decoding list above);
  - path index;
  - problem marking;
  - Name column derivation;
  - filter matching;
  - ordering.
- **UI tests, automated (Puppeteer):**
  - run the panel UI in a normal Chrome tab with sample HAR data;
  - click through it: selecting requests, switching views, the path footer;
  - take screenshots in light and dark to check that things are visible and correct.

  This is the main UI test layer. It is reliable because no DevTools window is involved.
- **Real DevTools tests, automated (feasible; decided in T03):**
  - Puppeteer launches a visible Chrome for Testing (DevTools does not open headless) with `dist/` loaded and DevTools docked to the bottom. Docked to the side, DevTools is too narrow and hides the Transit tab in its "»" overflow.
  - A local test server serves a page making Transit and non-Transit fetch/XHR calls.
  - The test clicks the Transit tab, then drives and inspects the panel through a CDP session on the panel's own target, with `chrome.devtools.*` available.
  - Passed 8 runs in a row when set up. If it becomes flaky, fix it or fall back to a short manual checklist in the README.
- Both layers run with `npm run test:e2e` (Vitest, `e2e/*.e2e.ts`). Screenshots go to `e2e/screenshots/` (gitignored) for review.
- **CI (GitHub Actions, `.github/workflows/ci.yml`):** lint, typecheck, unit and e2e on every push to `main` and every pull request. On Linux, e2e runs under `xvfb-run` because the DevTools tests need a headed browser. Screenshots are uploaded as a workflow artifact. On `main`, a `release` job follows (see "Releases").

## Known risks

User-facing limitations are listed in the README ("Limitations"); keep that section in sync when a decision here changes what users see.

- **Clipboard (verified):** `navigator.clipboard.writeText` fails in the panel ("Document is not focused"); `document.execCommand('copy')` with a temporary textarea works. The path footer's Copy button tries the former and falls back to the latter. Native Cmd+C in the editor is unaffected.
- Bodies of old requests may be evicted by DevTools; show the "body no longer available" state.

## Later (not v1)

- Preserve log across navigation.
- Method and status filters.
- Wildcard/glob and regex URL filters.
- Toggle to hide non-Transit rows.
- Keyboard up/down navigation through requests, including while the list is hidden.
- Resizable list/detail split.
- Vertical scroll sync between EDN and Transit panes.
- Dimmed parent path next to the Name when names collide.
- Web Worker decoding.
- Custom extension icons.
- Chrome Web Store listing (needs icons; see "Releases").
- Firefox support (see "Supported browsers" for the known gaps).
- Intercept and override (requires `chrome.debugger`; see Non-goals).
