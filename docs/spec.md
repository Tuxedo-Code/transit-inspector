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
- No self-signed `.crx`. Users install from the release zip, or from the Chrome Web Store once it is listed (see "Releases").
- No synced collapse/fold state between the EDN and Transit panes.

## Privacy

Binding, like the non-goals. Changing the promise, or loosening any of the enforcement below, is a spec change first. Enforced since T17.

- **Promise.** The extension makes no network requests of its own: no telemetry, analytics or crash reporting, no remote code, no third-party services, no permissions in the manifest. Captured traffic lives only in the panel's memory and is gone when DevTools closes. The only stored values are UI preferences, the view mode and the request list width, in `localStorage` (`src/ui/settings.ts`).
- **Chrome's install warning.** Chrome still lists "Read and change all your data on all websites" for the extension (Brave too). Chrome adds it to every extension with a `devtools_page`, because DevTools extensions *could* run code in inspected pages (`chrome.devtools.inspectedWindow.eval`); verified in T17 by comparing two otherwise empty manifests, with and without `devtools_page`. Transit Inspector never uses that API, and the build tripwire below keeps it that way. User-facing text must say "no permissions requested" and explain the warning, never claim "no permissions".
- **1. CSP.** `manifest.json` sets `content_security_policy.extension_pages` (applies to `devtools.html` and `panel.html`):

  `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`

  | Part | Why |
  |---|---|
  | `default-src 'none'` | Everything not listed (fonts, media, frames, workers, prefetch) is blocked. The panel uses only system fonts. |
  | `script-src 'self'` | MV3's minimum: no remote code, no `eval`. |
  | `style-src 'self' 'unsafe-inline'` | CodeMirror's `style-mod` mounts its theme as a `<style>` element on a document (constructable sheets only on shadow roots), so `'self'` alone unstyles the editor. A nonce would be a fixed string in the manifest and protect nothing. CSS can't send data here: remote `@import`, images and fonts are blocked. |
  | `img-src 'self' data:` | The `data:,` favicon in `panel.html` and CodeMirror's SVG data URIs (lint underlines, `.cm-highlightTab`). No remote images, the classic beacon. |
  | `connect-src 'none'` | Blocks fetch, XHR, WebSocket, EventSource and `sendBeacon`. `chrome.devtools.network` (`getHAR`, `getContent`) is an extension API, not a connection, so capture is unaffected. |
  | `object-src`, `base-uri`, `form-action` `'none'` | Close the remaining legacy ways to load from or submit to a URL. |
  | no `frame-ancestors` | DevTools embeds the panel in a frame. |

  `npm run dev` (panel in a normal tab, needs Vite's HMR socket) runs without this CSP; the real-DevTools e2e tests cover it. transit-js bundles Closure's debug loader (sync XHR, `eval`, script injection), but it is dead code (`var COMPILED = !0` guards it), so no CSP violations are expected.
- **2. Build tripwire** (`build/privacy.ts`). A CSP can't block everything:
  - `chrome.devtools.inspectedWindow.eval` runs code in the inspected page, under the page's CSP;
  - navigation carries data in a URL (`window.open`, `location.assign/replace/href=`, `chrome.tabs`, `chrome.windows`);
  - `chrome.runtime` messaging reaches other extensions; `chrome.scripting` injects into pages;
  - DNS prefetch and preconnect leak a hostname.

  The build fails if any JS chunk mentions one of these, so no release zip can contain them. Threat model: it catches accidental use by us or by a dependency, not deliberately hidden code. Network globals (`fetch`, `XMLHttpRequest`) are not on the list: the CSP covers them, and transit-js's dead loader mentions `XMLHttpRequest`.
- **3. Manifest pin** (unit test). The manifest's top-level keys are an exact allowlist (`manifest_version`, `name`, `description`, `icons`, `devtools_page`, `content_security_policy`), so adding `permissions`, `host_permissions`, `background`, `content_scripts`, `externally_connectable` or similar fails. The CSP must equal the string above.
- **4. E2E proof** (real DevTools, `e2e/devtools.e2e.ts`). The panel raises no CSP issues during normal use. From inside the panel, attempts to reach the test server (fetch, XHR, `sendBeacon`, WebSocket, an image, CSS `url()` and `@import`) never arrive, and each is reported as a CSP issue. Issues are read through the CDP `Audits` domain on the panel's target; `Audits.enable` replays issues raised before it, so violations during panel startup count too (verified: a `fetch` on panel start fails the test).

## Architecture

- `manifest.json` (MV3) declares `devtools_page: devtools.html`. No permissions, no host permissions, no background service worker, no content scripts, and a CSP that blocks network access (see "Privacy").
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
  - Deduplicate entries seen by both by `startedDateTime` + method + URL; the entry from `onRequestFinished` wins.
- **`getHAR()` also returns requests still in flight** (verified in Chrome 154):
  - waiting for a response: status 0 like a failed request, but no `_error`. Not listed; it arrives through `onRequestFinished`.
  - downloading: the real status, but partial size and time. `getContent()` waits for the whole body. The entry from `onRequestFinished` replaces the row.
  - failed (network error, CORS, cancelled): status 0 with `_error` (`net::ERR_*`). `onRequestFinished` fires for these too.
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
- Known limit: a float sent as `1.0` (or a JVM double like `1.0E7`) prints as an integer. The JSON text does distinguish them, and JVM readers keep the difference, but transit-js parses with the browser's `JSON.parse`, which drops it before decoding. The raw pane shows the number as sent. The fix and why it isn't done: [considered.md](considered.md#faithful-numbers).
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
- **Resizable split**, like the Network panel's (measured in Chrome 154):
  - drag the list's right border (an invisible 6px strip centered on it, `ew-resize` cursor, no keyboard control);
  - the list keeps at least 50px and the detail view at least 30px, so its Close button stays reachable;
  - the width is remembered across requests and sessions, in pixels;
  - if the panel gets too narrow for it, the list shrinks, and grows back when there is room again;
  - until the first drag, the list takes `min(280px, 35%)`.

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
- **Default editor behavior**, with one custom click behavior (form selection, below):
  - normal mouse/keyboard selection, Cmd+A and Cmd+C, including long strings and selections larger than the screen;
  - folding arrows in the gutter of the EDN pane for maps, vectors, lists and sets, with everything unfolded by default (the raw pane has no folding since it is not re-formatted);
  - Cmd+F search within the pane (CodeMirror's search panel), with DevTools' own search bar kept out (see "Search" below);
  - large documents stay fast because the editor only draws the visible part.
- **Form selection** (EDN pane only), to copy a nested value out of a large body:
  - double-clicking an opening or closing bracket (`{ [ ( #{ } ] )`) selects the whole form. Natively it would select only the bracket, so nothing is lost; double-clicking anything else, including brackets inside strings, selects a word as usual;
  - Cmd+I (Ctrl+I) expands the selection to the enclosing form, repeatedly, like Calva;
  - both use the path index, not CodeMirror's syntax tree: CodeMirror parses lazily, and its own Cmd+I stopped about 3 KB into a 3 MB body. The raw pane keeps CodeMirror's Cmd+I and has no bracket double-click (its cache codes like `"^0"` make a copied subtree invalid on its own);
  - selecting a form doesn't scroll, so a big form doesn't jump the view to its far end.
- **Path footer** (EDN pane only):
  - a footer under the EDN pane shows the EDN path of the value at the cursor or selection, as a `get-in` vector (e.g. `[:user :orders 0 :id]`), from the path index;
  - it updates as the cursor moves and is empty when the cursor is not on a value;
  - a small "Copy" button next to the path copies it;
  - no keyboard shortcut and no toolbar button.
- **Search:** Cmd+F (Ctrl+F) anywhere in the panel opens CodeMirror's search in a pane: the focused one, or else the one last focused, or else the first visible. With no pane open it focuses the URL filter box.
  - DevTools' own search bar never opens from the panel. It can't search an extension panel (it only hands the query to the extension's `onSearch`), and the Network panel has its own search instead.
  - Not covered: with focus outside the panel's page, e.g. right after clicking the Transit tab, the key never reaches the panel, so DevTools' bar opens and finds nothing. Focusing the panel on `onShown` would fix that, but it also fires when keyboard users arrow through DevTools' tabs and would pull focus out of the tab strip (verified 2026-10-06 in Chrome 154), so it isn't done.
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
- `package.json` holds the only version number. The source `manifest.json` (project root) has no version; a small build plugin (`build/manifest.ts`) emits it into `dist/` with the version filled in, and copies the icons it lists. The build fails if the version isn't one Chrome accepts (1-4 integers, no `-beta` suffixes).
- **Icons:** EDN map braces around a keyword colon, `{:}`, white on indigo. Sources are `icons/icon.svg` and `icons/icon-16.svg` (braces only: the colon smears at 16px). `node icons/make-icons.ts` renders the 16, 32, 48 and 128px PNGs, which are committed; the 128px one has 16px of transparent padding around a 96px icon, as the Web Store asks. A unit test checks each PNG's size against the manifest.
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
- Dependency bumps of shipped code are `fix(deps):` commits, so they go through the same release PR (see "Dependencies and supply chain").
- To force a specific next version, add a `Release-As: x.y.z` footer to a commit message. The first release used `initial-version` in `release-please-config.json`: a manifest at `0.0.0` counts as "never released", and the node strategy would otherwise start at 1.0.0.
- Settings required: "Allow GitHub Actions to create and approve pull requests" under Actions > General, first in the Tuxedo-Code organization settings (it overrides the repo), then in the repo. Without it, the `release` job can't open the release PR.
- **Chrome Web Store:** the release zip has `manifest.json` at its root, a version Chrome accepts and the icons, so it is uploaded to the store as is.
  - `store/listing.md` holds every listing field and the privacy-practices answers; its claims must stay true, like the README's (see "Privacy").
  - The screenshots and the promo tile in `store/` come from `node store/make-images.ts`: it replays `samples/basic.har` from a local server that Chrome reaches as `app.example.com`, and captures the real panel in an undocked DevTools window sized to the store's 1280x800. Run it on macOS after UI changes, since it renders with the system fonts.
  - Uploads are by hand in the developer dashboard for now (see "Later").

## Dependencies and supply chain

In place since T18.

- **Dependabot** (`.github/dependabot.yml`) for npm and GitHub Actions:
  - 7-day cooldown before taking a new version (security updates aren't delayed);
  - minor and patch updates grouped (runtime, dev, actions); majors as separate PRs;
  - commit prefixes: `fix(deps):` for runtime dependencies (they ship, so they trigger a release PR), `chore(deps-dev):` for dev dependencies (no release), `ci(deps):` for actions;
  - checks monthly, for npm and actions alike (decided in T18): at most one dependency-only release a month, since unpacked installs only update on reinstall (see the note below). Security fixes don't wait: Dependabot security updates open PRs right away.
- **Merged by hand after CI, no auto-merge.** A merge done with `GITHUB_TOKEN` doesn't trigger the push CI that release-please needs (a PAT or app token would), and a human should see every change to shipped code.
- **CI gates** in the `check` job: `npm audit signatures` (registry signatures and provenance of every installed package) and `npm audit --omit=dev` (a known vulnerability in shipped code blocks the release; dev-only advisories come through Dependabot alerts so tooling advisories don't block unrelated PRs). Both call the npm registry, so a registry outage fails CI; if that becomes flaky, move them to a scheduled job.
- **No install scripts:** `.npmrc` sets `ignore-scripts=true`, against worm-style `postinstall` attacks. Only `puppeteer` has an install script, and `test:e2e` already runs `puppeteer browsers install chrome` explicitly.
- **Actions** are pinned to full commit SHAs with a version comment (Dependabot updates both), checkouts use `persist-credentials: false`, and the `check` job has no secrets: Dependabot PRs run new dependency code there.
- **Release provenance:** the release job attests the zip with `actions/attest-build-provenance`, after the upload so a failure can't leave a release without its zip (attestations need a public repo, which it is). Users verify a download with `gh attestation verify transit-inspector-<version>.zip -R Tuxedo-Code/transit-inspector`. It proves where the zip was built, not that the code is safe.
- **Repo settings:** Dependabot alerts and security updates, secret scanning with push protection, private vulnerability reporting. `SECURITY.md` says how to report.
- **Note:** unpacked installs never auto-update, so dependency releases only reach users who reinstall. With a Web Store listing every merged release reaches users automatically, which makes the manual merge more important.

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
  - The extension is installed with `browser.installExtension()` and awaited before any DevTools window opens. Puppeteer's `launch({ enableExtensions: [path] })` doesn't await the install, which made CI flaky.
  - A local test server serves a page making Transit and non-Transit fetch/XHR calls.
  - The test clicks the Transit tab, then drives and inspects the panel through a CDP session on the panel's own target, with `chrome.devtools.*` available.
  - Passed 8 runs in a row when set up. If it becomes flaky, fix it or fall back to a short manual checklist in the README.
- The real DevTools tests also prove the privacy promise: no CSP violations during normal use, and nothing sent from the panel reaches a server (see "Privacy").
- Both layers run with `npm run test:e2e` (Vitest, `e2e/*.e2e.ts`). Screenshots go to `e2e/screenshots/` (gitignored) for review.
- **CI (GitHub Actions, `.github/workflows/ci.yml`):** lint, typecheck, unit and e2e on every push to `main` and every pull request. On Linux, e2e runs under `xvfb-run` because the DevTools tests need a headed browser. Screenshots are uploaded as a workflow artifact. On `main`, a `release` job follows (see "Releases").

## Known risks

User-facing limitations are listed in the README ("Limitations"); keep that section in sync when a decision here changes what users see.

- **Clipboard (verified):** `navigator.clipboard.writeText` fails in the panel ("Document is not focused"); `document.execCommand('copy')` with a temporary textarea works. The path footer's Copy button tries the former and falls back to the latter. Native Cmd+C in the editor is unaffected.
- Bodies of old requests may be evicted by DevTools; show the "body no longer available" state.
- **Shortcut forwarding (verified):** DevTools injects a `keydown` listener on the panel's `document` (bubble phase) that forwards its global shortcuts (Cmd+F, Esc, Cmd+Shift+P...) to DevTools, without checking whether the page already handled them. Keys an editor handles are therefore stopped at the editor (`src/ui/CodeView.tsx`), and Cmd+F elsewhere is caught on the document in the capture phase (`src/ui/App.tsx`). Every other shortcut still reaches DevTools.

## Later (not v1)

- Preserve log across navigation.
- Method and status filters.
- Wildcard/glob and regex URL filters.
- Toggle to hide non-Transit rows.
- Keyboard up/down navigation through requests, including while the list is hidden.
- Vertical scroll sync between EDN and Transit panes.
- Dimmed parent path next to the Name when names collide.
- Web Worker decoding.
- Upload each release zip to the Chrome Web Store from CI (Chrome Web Store API), instead of by hand (see "Releases").
- Firefox support (see "Supported browsers" for the known gaps).
- release-please with its own GitHub App or fine-grained token instead of `GITHUB_TOKEN`, so CI really runs on release PRs (today they show a failed run with zero jobs).
- Intercept and override (requires `chrome.debugger`; see Non-goals).
- Watch a path across calls to one endpoint. With the cursor on a value, list that path's value in every captured call to the same endpoint, with changes marked; clicking one opens that request at the same path. Group `/users/42` and `/users/43` as one endpoint by treating numeric, UUID and long hex path segments as wildcards. Re-running a call after a page reload needs "Preserve log".

Ideas that were evaluated and not built, with the reasons and what would change the verdict, are in [considered.md](considered.md). Check it before proposing a feature.
