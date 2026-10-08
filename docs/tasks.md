# Tasks

Implementation plan for [spec.md](spec.md). The spec is the source of truth; tasks only split it into work.

Status markers: `[ ]` todo, `[~]` in progress, `[x]` done, `[-]` dropped (say why).

Each task lists what it depends on and when it counts as done. When finishing a task, add a short note under it with anything the next task needs to know (decisions made, gotchas). Keep notes brief.

## Phase 0 - Setup and de-risking

### [x] T01 Project scaffold
Depends on: -

- `mise.toml`, `package.json`, `tsconfig.json` (strict), Vite config with `devtools.html` and `panel.html` entries, `manifest.json`, Biome, Vitest, `.gitignore`.
- The build writes the `package.json` version into `dist/manifest.json` (single version source).
- npm scripts from the spec (`dev` may be a stub until T04, `test:e2e` until T03).
- `devtools.html` registers an empty "Transit" panel.
- Add the real commands to `AGENTS.md`.

Done when:
- `npm run build`, `npm run lint` and `npm test` pass;
- `dist/` loads unpacked in Chrome;
- an empty "Transit" tab appears in DevTools.

Notes:
- Tool versions at setup: TypeScript 7, Vite 8, Vitest 5, Biome 2.5, Node 24. Vitest config lives in `vite.config.ts` (import `defineConfig` from `vitest/config`).
- `manifest.json` and the HTML entries sit at the project root (not `public/`) so the build plugin can emit the versioned manifest without clashing with copied public files.
- Verified with a throwaway Puppeteer script (Chrome for Testing 154): `enableExtensions: [dist]` with `pipe: true` loads the extension, but only after launch. DevTools windows opened before that have no Transit tab, so open DevTools on a tab created afterwards. The DevTools tab strip is in shadow DOM; tabs are `[role="tab"]` elements. Useful for T03.

### [x] T02 Spike: verify risky DevTools behavior
Depends on: T01

Check in real Chrome DevTools, with throwaway code:
1. Capture timing: do `getHAR()` entries support `getContent()`? Does buffering in the devtools page work? Pick one (spec "Capture timing").
2. HAR resource type field for fetch/XHR (`_resourceType`?).
3. Clipboard from the panel: `navigator.clipboard.writeText` vs the `execCommand('copy')` fallback.
4. `chrome.devtools.panels.themeName` values, and whether theme changes reach an open panel.
5. CodeMirror 6 runs under the extension's CSP.
6. `onNavigated` fires for reloads and SPA navigations, or only for full loads.

Done when:
- findings are written into spec.md (open question resolved, risks updated);
- throwaway code is removed.

Notes:
- All six questions answered; see spec "Capture and navigation", "Look and feel" (theme), "Stack" (CodeMirror) and "Known risks" (clipboard).
- Biggest finding: `onNavigated` fires on SPA `pushState`, so the list is rebuilt from `getHAR()` on navigation rather than cleared.
- CodeMirror packages (`codemirror`, `@codemirror/lang-json`, `@nextjournal/lang-clojure`) are installed for T10.
- For T03: the panel is a CDP target of type `other` (URL ends in `/panel.html`). `target.createCDPSession()` + `Runtime.evaluate` runs code inside it with `chrome.devtools.*` available, which is the reliable way to drive and inspect the real panel. Clicking the DevTools tab works via `[role="tab"]` in shadow DOM, but pick the DevTools window opened after the extension was installed.

### [x] T03 End-to-end harness
Depends on: T01

- Puppeteer + Chrome for Testing.
- A local test server with a test page making Transit (`application/transit+json` and Transit-as-`application/json`) and plain JSON fetch/XHR calls.
- Feasibility first: can a script load `dist/` unpacked, open DevTools, switch to the Transit tab and read its content reliably?
- If yes: a real DevTools smoke test behind `npm run test:e2e`.
- If flaky across 5 runs: a short manual checklist in the README instead. Record the outcome in spec "Testing".
- Either way, set up the UI test layer: Puppeteer driving the panel UI in a normal tab (sample data arrives in T04), with screenshots.

Done when:
- the outcome is recorded in spec "Testing";
- whichever automated tests exist pass 5 runs in a row.

Notes:
- Real DevTools automation is feasible: 8/8 runs passed. Helpers in `e2e/devtools.ts` (`launchWithExtension`, `openPageWithTransitPanel`, `Panel.evaluate` / `Panel.waitForText`). Test page and server in `e2e/test-server.ts`.
- DevTools must be docked to the bottom (throwaway profile preference), otherwise the Transit tab is hidden in the overflow.
- The UI layer (`e2e/ui.e2e.ts`) starts the Vite dev server and opens `panel.html` in headless Chrome, with screenshots in light and dark. T04 should switch it to sample data.
- npm blocks Puppeteer's install script, so `test:e2e` runs `puppeteer browsers install chrome` explicitly.

## Phase 1 - v1

### [x] T04 Data source interface and sample data source
Depends on: T01

- Request model and data source interface (spec "Architecture").
- HAR parser shared by both sources.
- Sample data source reading HAR files with content.
- Sample HAR files covering: Transit payload and response, Transit-as-JSON, plain JSON, non-JSON, msgpack, 4xx/5xx Transit errors, failed requests, one large body.
- `npm run dev` serves the panel UI in a normal tab with hot reload.

Done when: the panel runs in a normal tab and receives the sample requests.

Notes:
- `src/sources/source.ts` (interface), `har-file.ts` (HAR files), `dev-samples.ts` (dev only: `samples/basic.har` plus a generated 3 MB response; excluded from the extension build by `import.meta.env.DEV`).
- `src/har.ts` converts entries to rows for both sources; `src/store.ts` holds them (ordering, dedupe, cap, clear).

### [x] T05 Transit detection
Depends on: T04

- Content-type check plus body sniffing, per direction.
- msgpack flagged unsupported.

Done when: unit tests cover transit content type, Transit-as-JSON, plain JSON, non-JSON, empty and msgpack.

### [x] T06 Decoder, EDN printer, path index, problems
Depends on: T04

- `transit-js` decoding.
- EDN pretty-printer covering every type in spec "Decoding and EDN output".
- Path index (text range to EDN path).
- Problem list with positions.

Done when: unit tests pass for every listed type, big integers, non-scalar map keys, unknown tags, malformed input, and path lookups (map, vector, list, set, nested).

Notes:
- `src/transit/decode.ts` converts transit-js output into our own `EdnNode` tree (`src/edn/ast.ts`), using custom map/set/list builders so wire order is kept, and a `c` handler so chars aren't turned into strings.
- `src/edn/print.ts`: `printEdn` returns `{ text, index, marks }`; `pathAt(index, offset)` + `formatPath` power the path footer. A cursor right after a value counts as on it.
- Sample data: `samples/basic.har`, regenerated by `node samples/make-sample-har.ts` (uses transit-js's writer, so bodies have real key caching).

### [x] T07 DevTools data source
Depends on: T02, T04, T05

- Wrap `chrome.devtools.network` as in spec "Capture and navigation": subscribe, backfill with `getHAR()`, deduplicate, rebuild from `getHAR()` on `onNavigated`.
- Fetch/XHR only, start-time order, 1,000-request cap, bodies fetched only for Transit candidates.

Done when: in real DevTools the panel lists the test page's requests in the right order, including ones made before the panel was first opened; an SPA route change keeps the list; a reload clears it.

Notes:
- `src/sources/devtools.ts`. Requests finishing while a `getHAR()` rebuild is in flight are re-added to it.
- HAR start times have millisecond precision and simultaneous requests often tie. Ties keep arrival order, and every `getHAR()` rebuild re-adopts DevTools' order (start order). Right after a reload, tied requests may briefly show in finish order.

### [x] T08 Request list UI
Depends on: T04, T05

- Name, method, status, size and time columns.
- Grayed, unselectable non-Transit rows; msgpack label.
- Grayed rows for failed requests (no response).
- Selection, filter box, clear button.
- Empty state "No Transit requests yet".
- Auto-scroll only when at the bottom.
- Hide/show list toggle.

Done when: it matches the Network panel's look side by side in light and dark (check screenshots).

### [x] T09 Detail view shell
Depends on: T08

- Header bar.
- Payload/response switch.
- View mode switch (EDN | side by side | Transit), remembered across requests and sessions.
- Empty and error states, including "Not Transit" for a non-Transit direction.
- Detail view resets when the list is cleared.

Done when: all modes and states work against the sample data.

### [x] T10 Editor panes
Depends on: T06, T09

- CodeMirror 6 read-only panes with EDN and JSON highlighting.
- Fold gutter in the EDN pane, everything unfolded by default.
- Raw pane shows the body exactly as received, with line wrapping, no folding.
- Search.
- Problem marks as lint diagnostics.
- Independent horizontal scroll.
- Highlight colors match DevTools in both themes.

Done when: a multi-MB sample opens and scrolls smoothly, and Cmd+A / Cmd+C and mouse selection copy a long string and a multi-screen selection completely.

Notes:
- `src/ui/CodeView.tsx`. Measured on the 3 MB sample: decode ~95 ms, print ~60 ms, open ~100 ms in any view mode, scroll to middle ~5 ms. No Web Worker needed.
- Token colors are CSS variables in `src/panel.css` with DevTools' own values (measured from Chrome 154).

### [x] T11 Path footer
Depends on: T06, T10, T02 (clipboard finding)

- Footer under the EDN pane showing the EDN path at the cursor or selection, via the path index.
- Updates as the cursor moves; empty when not on a value.
- "Copy" button next to the path. No keyboard shortcut, no toolbar button.

Done when: unit-tested lookups pass and the Copy button works inside real DevTools.

### [x] T12 Theme and look-and-feel pass
Depends on: T07, T08, T09, T10

- Theme from `themeName`.
- Pixel check against the Network panel, light and dark, docked bottom and right.
- Fix anything that looks off.

Done when: screenshots in both themes and both dock positions look native.

Notes:
- Checked in real DevTools (bottom dock) in dark and light, including a live theme switch (`setThemeChangeHandler`).
- Docked right was checked as a narrow panel (560px) in the UI tests, since the dock-right DevTools tab can't be reliably selected by automation. That found clipped controls: fixed by naming the tabs "Payload" / "Response" (as in the Network panel), a 35%-max compact list, and a scrolling tab bar. Covered by a UI test.

### [x] T13 v1 end-to-end test
Depends on: T03, T07, T10, T11

Cover with UI tests on sample data (and the real DevTools smoke test, if T03 found it feasible):
- list contents and order;
- grayed rows;
- selecting a request;
- decoded EDN content;
- payload/response switch;
- view modes;
- path footer and its Copy button;
- screenshots in light and dark.

Done when: it passes 5 runs in a row.

Notes:
- `e2e/devtools.e2e.ts` (real DevTools: capture before the panel opened, order, grayed rows, decoding, path footer and Copy, SPA route change, reload) and `e2e/ui.e2e.ts` (sample data: everything else, plus screenshots in `e2e/screenshots/`).

### [x] T14 Packaging and README
Depends on: T01

- `npm run package` zip.
- README with what it does, install via Load unpacked, update and share.

Done when: a fresh clone, then `mise install && npm ci && npm run package`, produces a zip that installs and works.

Notes:
- Verified with a copy of exactly the files git would track (no commits exist yet): the zip (~170 kB) loads unpacked in Chrome for Testing and decodes in real DevTools.

### [x] T15 Open-source release
Depends on: T14

- MIT `LICENSE`; repo metadata in `package.json` (stays `private`: not published to npm).
- The build emits `THIRD_PARTY_LICENSES.md` into `dist/` for the bundled dependencies.
- README: screenshot, clone URL, Contributing, License.
- GitHub Actions CI: lint, typecheck, unit and e2e (xvfb on Linux).

Done when: all checks pass locally and in a Linux container that mirrors CI; the zip contains `THIRD_PARTY_LICENSES.md`.

Notes:
- Repo: github.com/Tuxedo-Code/transit-inspector. The first real CI run happens on the first push.
- Linux e2e was verified in Docker (`node:24-bookworm`, amd64, `xvfb-run`, `--security-opt seccomp=unconfined` so Chrome's sandbox works), 3 runs in a row. It exposed a race: the page used to load after a fixed 1 s sleep, before DevTools recorded traffic. `e2e/devtools.ts` now uses `page.openDevTools()` and waits for the Transit tab first.
- The README screenshot (`docs/screenshot-{light,dark}.png`) now comes from `store/make-images.ts`, in real DevTools.
- transit-js's Closure loader triggers rolldown `EVAL` warnings; `vite.config.ts` filters only those.

### [x] T16 Automated releases
Depends on: T15

- release-please in CI: pushes to `main` keep a release PR up to date; merging it tags `vX.Y.Z` and publishes a GitHub Release with the changelog and `transit-inspector-<version>.zip` attached.
- The release only runs after the `check` job passed on that commit.
- The build rejects versions Chrome (and the Web Store) won't accept.
- README install from Releases; spec "Releases" section.

Done when: a release PR merged to `main` produces a GitHub Release whose zip loads unpacked and decodes in real DevTools.

Notes:
- `.release-please-manifest.json` starts at `0.0.0` with `bootstrap-sha` at the last pre-release-please commit. Without `initial-version: "0.1.0"`, release-please treats 0.0.0 as "never released" and the node strategy proposes 1.0.0.
- Verified with v0.1.0: the release zip is identical to a local `npm run build` and passes `e2e/devtools.e2e.ts` when loaded as `dist/`.
- "Allow GitHub Actions to create and approve pull requests" had to be enabled for the Tuxedo-Code org before the repo setting could be turned on.
- The first CI run exposed an e2e race: Puppeteer's `launch({ enableExtensions: [path] })` doesn't await the install. `e2e/devtools.ts` now calls `browser.installExtension()` itself.

### [x] T17 Privacy guarantees
Depends on: T15

Enforce spec "Privacy" (the decisions, CSP string and reasons are there; don't re-derive them):
- Add the CSP to `manifest.json` (`content_security_policy.extension_pages`).
- Build tripwire `build/privacy.ts`, same pattern as `build/manifest.ts`:
  - `findForbiddenApis(code): string[]`: plain substring checks for `inspectedWindow`, `chrome.tabs`, `chrome.windows`, `chrome.runtime`, `chrome.scripting`, `window.open`, `location.assign`, `location.replace`, `location.href=`, `dns-prefetch`, `preconnect`, each with a one-line reason;
  - `privacyPlugin()` (`apply: "build"`) runs it on every JS chunk in `generateBundle` and calls `this.error()` with the chunk, the API and "see docs/spec.md Privacy"; register it next to `manifestPlugin` in `vite.config.ts`;
  - `build/privacy.test.ts`: each API is caught; current-style code (`chrome.devtools.network.getHAR`, `chrome.devtools.panels.create`) passes.
- Manifest pin in `build/manifest.test.ts`: read the root `manifest.json`; top-level keys exactly as listed in the spec; CSP equals the spec string. Failure message: "Privacy is binding (docs/spec.md 'Privacy'); change the spec first."
- E2E in real DevTools:
  - `e2e/test-server.ts`: log every request path on `TestServer.requests`; nothing legitimate uses `/leak/`.
  - `e2e/devtools.ts`: a `Panel.create(session)` that enables the CDP `Audits` domain (it replays issues raised before it was enabled, so panel startup is covered) and collects `ContentSecurityPolicyIssue`s. Confirm the replay on the first run; if it doesn't happen, use `Log.enable`, which also replays.
  - `e2e/devtools.e2e.ts`: "loads with no CSP violations", asserted after the existing tests so the whole UI ran under the CSP; then, last, "can't send anything to a server": from inside the panel try fetch, XHR, `sendBeacon`, `new WebSocket`, `new Image().src`, and an injected `<style>` with `@import` and `url()`, each to `/leak/<kind>`. Assert fetch/XHR reject, the server logged no `/leak/` path, and every attempt raised a CSP issue (proves the CSP blocked it, not some other failure).
- `vite.config.ts`: the comment on the transit-js `EVAL` filter says a feature probe runs; it doesn't (`var COMPILED = !0` in `node_modules/transit-js/transit.js`; the probe at line 990 is inside `if (!COMPILED)`). Correct it.
- `AGENTS.md`, one bullet: privacy is binding (spec "Privacy"); never loosen the CSP or the tripwire to make something work.
- Commit: `feat: block network access from the extension with a strict CSP`.

Done when:
- lint, typecheck, unit and e2e tests pass, the real-DevTools tests also in Brave (`E2E_BROWSER`);
- screenshots in light and dark look unchanged (missing CodeMirror colors, fold gutter or lint underlines are the first sign of a CSP mistake);
- three negative checks fail as expected and are reverted: `"permissions": ["storage"]` in the manifest fails the unit test, `chrome.devtools.inspectedWindow.eval("1")` in `src/` fails `npm run build`, a `fetch("https://example.com")` on panel start fails e2e;
- the `npm run package` zip loads unpacked with no "Errors" button and no permissions, decodes on a real Transit app, and the panel's own console (right-click > Inspect) shows no CSP errors.

Notes:
- Verified: lint, typecheck, unit tests; `npm run test:e2e` 3 runs in a row (28 tests) and the real-DevTools tests in Brave; the three negative checks; the zip's `manifest.json` carries the CSP. A dark-theme screenshot of the real panel under the CSP looks right (CodeMirror's single `<style>` tag mounts, colors and gutter render).
- Released in v0.3.0 (CSP) and v0.3.1. The v0.3.1 release zip was checked unpacked in Chrome for Testing:
  - `chrome.developerPrivate.getExtensionInfo` (what the extension card shows) reports no runtime errors, manifest errors or install warnings;
  - with `samples/basic.har`'s traffic replayed by a local server (the stand-in for a real Transit app), every selectable request opens, with zero CSP issues;
  - light and dark screenshots of the real panel look right.
- Chrome still shows "Read and change all your data on all websites": every extension with a `devtools_page` gets it, regardless of the CSP or manifest. Recorded in spec "Privacy"; T19 has to explain it in the README.
- `Audits.enable` on the panel's CDP session does replay earlier issues: a `fetch` on panel start shows up in `panel.cspIssues`.
- Not caused by the CSP, found while checking: CodeMirror's search panel (Cmd+F) used its light-only default field and button styles, unreadable in dark. Fixed in `src/ui/CodeView.tsx` (filter box and pill buttons from `panel.css`); `e2e/ui.e2e.ts` now saves `search-light/dark.png`.

### [x] T18 Dependency and supply-chain security
Depends on: T15

Implement spec "Dependencies and supply chain":
- First settle the open question with the user: runtime dependency updates weekly or monthly. Each `fix(deps)` merge leads to a release, and unpacked installs only get it on reinstall, so weekly mostly adds changelog noise. Monthly suggested. Record the answer in the spec.
- `.github/dependabot.yml`: npm and github-actions, `cooldown` 7 days, groups and `commit-message` prefixes (`prefix: fix`, `prefix-development: chore`, `include: scope`; actions `ci`) as in the spec. All `@codemirror/*` packages must land in the same group (duplicates break CodeMirror; the e2e tests would catch it).
- `.github/workflows/ci.yml`:
  - pin every action to a full commit SHA with a `# vX.Y.Z` comment;
  - `persist-credentials: false` on both checkouts;
  - in `check`, after `npm ci`: `npm audit signatures` and `npm audit --omit=dev`;
  - in `release`, after the zip upload: `actions/attest-build-provenance` on the zip, with `id-token: write` and `attestations: write` on that job only.
- `.npmrc` with `ignore-scripts=true`; check that a clean install still builds and runs e2e.
- `SECURITY.md`: report privately through GitHub's "Report a vulnerability"; only the latest release is supported; link the README privacy section.
- Repo settings through `gh api`, asking the user before each: Dependabot alerts (`PUT /repos/{owner}/{repo}/vulnerability-alerts`), security updates (`PUT .../automated-security-fixes`), private vulnerability reporting (`PUT .../private-vulnerability-reporting`), secret scanning and push protection (`PATCH /repos/{owner}/{repo}` `security_and_analysis`).
- Commits: `ci:` for workflow and Dependabot, `build:` for `.npmrc`, `docs:` for `SECURITY.md`.

Done when:
- `rm -rf node_modules && npm ci`, then lint, typecheck, unit and e2e pass locally, and CI is green;
- `actionlint` is clean;
- after push, Insights > Dependency graph > Dependabot shows the config parsed, and the first Dependabot PRs carry `fix(deps)` / `chore(deps-dev)` / `ci(deps)` titles;
- the next release has an attestation and `gh attestation verify` passes on its zip;
- the repo settings are confirmed on.

Notes:
- Verified: clean `npm ci` with `ignore-scripts`, both audit gates (0 vulnerabilities, 32 packages with attestations), lint, typecheck, unit and e2e tests, `actionlint` (`mise exec actionlint@1.7.12 -- actionlint`), CI green. Dependabot's first npm and actions update jobs succeeded; its first PR was `chore(deps-dev): bump @types/node ... to 26`. All repo settings are on: alerts, security updates, secret scanning and push protection, private vulnerability reporting.
- Monthly for npm and actions (user's choice). `@types/node` majors are ignored: they must match the Node major in `mise.toml`, so bump them together by hand. PR #5 was closed for that reason.
- Attestation verified on v0.3.2, which was forced with a `Release-As: 0.3.2` footer since nothing user-visible had changed. `gh attestation verify` on the downloaded zip passes; the signer is `ci.yml@refs/heads/main` at the release commit. The `fix(deps)` / `ci(deps)` titles will show up once there are updates (none were pending).
- Found while checking CI, fixed separately: a real-DevTools e2e flake (about 8% of CI runs). `launch({ devtools: true })` opened a second DevTools, and the one under test then sometimes rendered no frames under Xvfb, so the Transit tab never reached its DOM. Now one DevTools is opened on the initial tab: 80/80 parallel CI runs passed. On failure, `waitForTransitTab` now reports the DevTools tabs, width and extension pages, and saves a screenshot.
- Also seen: CI runs on release-please PRs show as failed with zero jobs (GitHub creates a run for the bot's `GITHUB_TOKEN` event but runs nothing). Harmless, but it puts a red X on every release PR. Planned under "Phase 2 - Later" (release-please with its own token).

### [x] T19 README: privacy and security breakdown
Depends on: T17, T18

- A short "Privacy and security" section in `README.md`, right after the feature bullets. Plain language, about 6-8 bullets, each claim true of what T17 and T18 shipped:
  - no network requests, no tracking, no third parties, no permissions requested; captured traffic stays in DevTools memory; only the view mode and list width are saved;
  - why Chrome still shows "Read and change all your data on all websites" (every DevTools extension gets it; see spec "Privacy", "Chrome's install warning"), and that the build refuses the API behind it;
  - the CSP blocks all connections, and how to check it yourself (`manifest.json` in the zip, `connect-src 'none'`);
  - the build refuses APIs that could leak data some other way;
  - CI proves from inside DevTools that nothing reaches a server;
  - dependencies are updated by Dependabot, reviewed by hand, and audited in CI;
  - how to verify a downloaded zip (`gh attestation verify ...`);
  - how to report a vulnerability (`SECURITY.md`).
- Link spec "Privacy" for details instead of repeating them. The section doubles as the privacy-policy link for a future Web Store listing.
- Commit: `docs:`.

Done when: every claim matches the shipped code and settings, and the section reads well rendered on GitHub.

Notes:
- The section sits right after the screenshot rather than between the feature bullets and the screenshot, so the screenshot stays near the top.
- Each claim was checked against the code and the v0.3.2 release. Rendered through GitHub's Markdown API: six bullets, with the verify command as a code block inside its bullet.
- Found while checking: the list width (resizable list) is also stored in `localStorage`. The spec "Privacy" promise used to name only the view mode; it now names both. Any new stored value has to update spec, README and this promise together.

## Phase 2 - Later

From spec "Later". Not to be started until v1 is done:

- [ ] Preserve log
- [ ] Method and status filters
- [ ] Wildcard/glob and regex filters
- [ ] Hide non-Transit rows toggle
- [ ] Keyboard up/down navigation through requests
- [ ] Watch a path across calls to one endpoint (see spec "Later"; the reload workflow needs Preserve log)
- [x] Resizable list/detail split
  - `src/ui/Splitter.tsx`; behavior measured from the Network panel's own splitter, see spec "Layout". Covered by UI tests; the drag (pointer capture across the CodeMirror panes) and persistence were also checked once in real DevTools.
- [x] Cmd+F searches the open pane, never DevTools' bar:
  - Bug: in an editor, Cmd+F opened CodeMirror's search and DevTools' own bar, which took focus and can't search extension panels (DevTools only sends the query to the extension's `onSearch`). From the request list, Cmd+F opened only that useless bar.
  - Cmd+F anywhere in the panel opens CodeMirror's search in the visible pane (filter box when nothing is selected); keys the editor handles never reach DevTools. See spec "Search" and "Known risks".
  - Clicking a row leaves focus on `<body>`, so key events from the list never pass through `.app`: the Cmd+F handler has to listen on `document` (capture phase, ahead of DevTools' forwarder).
  - Tried and dropped: focusing the panel on `panel.onShown`. It fixes Cmd+F right after clicking the tab, but arrowing through DevTools' tabs then loses focus to the panel.
  - Real-DevTools tests press keys through the DevTools window (`pressShortcut`) and read DevTools' own UI (`devtoolsUi`: search bar, Console drawer, command menu) in `e2e/devtools.ts`.
- [x] Double-click a bracket in the EDN pane to select the whole form; Cmd+I / Ctrl+I expands the selection (spec "Form selection")
  - `formAt` and `enclosingForm` in `src/edn/print.ts` work on the path index; collection nodes record their opening delimiter's length (`open`).
  - CodeMirror's own Cmd+I stopped 3,007 characters into the 3 MB sample (lazy parse), so the EDN pane binds its own ahead of the default keymap.
  - UI tests read CodeMirror's state through `.cm-content`'s `cmTile.root.view` (internal, test only) and click by document offset (`doubleClickEdn`).
- [x] Text viewer for EDN strings (spec "Text viewer")
  - Why: strings print escaped, so stack traces, SQL and embedded JSON read as one line of `\n`, `\t` and `\"`.
  - How: a "13 lines" chip before each string with a line break, and "Show text" in the path footer for any string, open a plain-text editor under the EDN editor that follows the cursor; copying from it gives the unescaped string. The EDN text stays escaped.
  - Done when: unit and e2e tests pass; screenshots in light and dark, wide and narrow (560px), EDN-only and side by side, look native; the viewer works in real DevTools.
  - The viewer had a Copy button at first; removed at the user's request (select and Cmd+C does the same). The path footer's button is now "Copy path", so it can't be mistaken for copying the value.
  - `src/ui/TextViewer.tsx`; string nodes in the path index carry their text (`PathNode.text`, `nodeAt` in `src/edn/print.ts`); `CodeView` has a plain `text` language. Sample data: `/api/payments` returns a stack trace and a message with quotes.
  - Side by side at 560px the EDN pane is about 180px wide, which squeezed the path out of the footer. Panes are now CSS size containers. Below 320px the footer and viewer labels are hidden, and the footer wraps: the path on one row, its buttons on the next.
  - The chips came after the footer button alone proved undiscoverable. `StringChips` in `CodeView.tsx` (a widget decoration), `multiLineStrings` in `print.ts`. DevTools' Console "Show more" is `button.expandable-inline-button` with its label in `::after { content: attr(data-text) }`, so it's invisible to `textContent` searches; the chip uses the same trick to stay out of the editor's text.
  - A viewer that changes string updates its header before its editor (CodeView swaps documents in an effect), so tests wait for the editor's content.
  - Verified: lint, typecheck, unit, UI and real-DevTools e2e (Chrome and Brave; the CSP check runs after the viewer test).
  - Two flakes found while re-testing, both reproduced with every CPU core busy (`yes > /dev/null` per core):
    - "Copy path" sometimes snapped back from "Copied": an effect reset the label on path change, and Preact runs effects after the next frame, so a click right after a cursor move was undone. `PathFooter` now remembers the copied path instead. Also a real bug for quick clicks.
    - The in-flight test expected times as "x.xx s", but Node's timers fire up to 1 ms early (about 1 in 100), so a request held for `IN_FLIGHT_MS` can show "1000 ms". It now checks the time as a number.
- [ ] Vertical scroll sync between panes
- [ ] Dimmed parent path for colliding names
- [ ] Web Worker decoding (only if measured need)
- [x] Custom extension icons
  - `{:}` on indigo; sources and sizes in spec "Stack and tooling" ("Icons"). Checked at real size on `chrome://extensions` and on light and dark backgrounds.
  - `e2e/devtools.ts` no longer uses a TypeScript parameter property, so plain `node` can import it (`store/make-images.ts` does).
- [ ] release-please with its own token:
  - Why: PRs opened with `GITHUB_TOKEN` trigger no workflows, so every release PR shows a failed CI run with zero jobs, and CI never checks the release PR itself.
  - How: a GitHub App (preferred: scoped, short-lived tokens via `actions/create-github-app-token`) or a fine-grained PAT with contents and pull-requests write, passed as `token:` to `release-please-action`. Keep the secret out of the `check` job.
  - Done when: a release PR shows a real, green CI run, and merging it still releases with the zip and its attestation.
- [~] Chrome Web Store listing: icons (128px), listing assets, first upload by hand from a release zip, then optionally a CI job that uploads each release zip through the Web Store API
  - Done in the repo: icons, `store/listing.md` (every field and the privacy answers), screenshots and promo tile (spec "Releases").
  - Left, by the user: developer account ($5, 2-step verification; decide personal or Tuxedo-Code group publisher), then the first upload of the first release zip that has icons, filled in from `store/listing.md`.
  - Done when: the listing is live. Then add the store link to README "Install" (store first, zip as the alternative) and spec "Install", and move the CI upload job to its own task.
  - `make-images.ts` needs `--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable`: Chrome 154 blocks plain http to a public host name (`ERR_BLOCKED_BY_CLIENT`), even when `--host-resolver-rules` maps it to localhost.
  - Screenshots are zoomed 1.6x (DevTools at 800x500) since 1x text was unreadable in the store. There are 5, one feature each: EDN with the path, side by side, a string as text, a lint tooltip, search. The lint tooltip closes when the theme changes, so set the theme before hovering. The string chip opens on mousedown, so use the real mouse rather than `.click()`.
- [ ] Firefox support ("maybe"; see spec "Supported browsers"):
  - Check what Firefox's `devtools.network` HAR entries contain. If `_resourceType` is missing, find another way to tell Fetch/XHR apart, or list every request that carries Transit.
  - Check the panel, CodeMirror and the clipboard fallback in Firefox DevTools, in both themes.
  - Decide how to install it: temporary add-on via `about:debugging` (lost on restart), Developer Edition/Nightly with signing off, or free Mozilla signing.
  - Decide how to test it automatically (Puppeteer's Firefox support doesn't cover DevTools panels; WebDriver BiDi or a manual checklist).
- [x] Bug: a request in flight during a navigation shows "(failed)" and "No response body", or a stale size and time, although it succeeded
  - Cause: the rebuild on `onNavigated` (also fired by SPA `pushState`) reads `getHAR()`, which includes requests still in flight; their rows were kept and the finished entry from `onRequestFinished` was ignored as a duplicate.
  - Fix: requests still waiting (status 0, no `_error`) aren't listed (`isListed` in `src/har.ts`); `RequestStore.add` replaces a row with the same id, newest entry wins. What `getHAR()` holds mid-flight: spec "Capture and navigation".
  - Covered by unit tests and a real-DevTools test with `/api/slow` and `/api/drip` in `e2e/test-server.ts`.
