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

### [ ] T02 Spike: verify risky DevTools behavior
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

### [ ] T03 End-to-end harness
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

## Phase 1 - v1

### [ ] T04 Data source interface and sample data source
Depends on: T01

- Request model and data source interface (spec "Architecture").
- HAR parser shared by both sources.
- Sample data source reading HAR files with content.
- Sample HAR files covering: Transit payload and response, Transit-as-JSON, plain JSON, non-JSON, msgpack, 4xx/5xx Transit errors, failed requests, one large body.
- `npm run dev` serves the panel UI in a normal tab with hot reload.

Done when: the panel runs in a normal tab and receives the sample requests.

### [ ] T05 Transit detection
Depends on: T04

- Content-type check plus body sniffing, per direction.
- msgpack flagged unsupported.

Done when: unit tests cover transit content type, Transit-as-JSON, plain JSON, non-JSON, empty and msgpack.

### [ ] T06 Decoder, EDN printer, path index, problems
Depends on: T04

- `transit-js` decoding.
- EDN pretty-printer covering every type in spec "Decoding and EDN output".
- Path index (text range to EDN path).
- Problem list with positions.

Done when: unit tests pass for every listed type, big integers, non-scalar map keys, unknown tags, malformed input, and path lookups (map, vector, list, set, nested).

### [ ] T07 DevTools data source
Depends on: T02, T04, T05

- Wrap `chrome.devtools.network` using the capture approach chosen in T02.
- Fetch/XHR only, start-time order, clear on navigation, 1,000-request cap, bodies fetched only for Transit candidates.

Done when: in real DevTools the panel lists the test page's requests in the right order, including ones made before the panel was first opened.

### [ ] T08 Request list UI
Depends on: T04, T05

- Name, method, status, size and time columns.
- Grayed, unselectable non-Transit rows; msgpack label.
- Grayed rows for failed requests (no response).
- Selection, filter box, clear button.
- Empty state "No Transit requests yet".
- Auto-scroll only when at the bottom.
- Hide/show list toggle.

Done when: it matches the Network panel's look side by side in light and dark (check screenshots).

### [ ] T09 Detail view shell
Depends on: T08

- Header bar.
- Payload/response switch.
- View mode switch (EDN | side by side | Transit), remembered across requests and sessions.
- Empty and error states, including "Not Transit" for a non-Transit direction.
- Detail view resets when the list is cleared.

Done when: all modes and states work against the sample data.

### [ ] T10 Editor panes
Depends on: T06, T09

- CodeMirror 6 read-only panes with EDN and JSON highlighting.
- Fold gutter in the EDN pane, everything unfolded by default.
- Raw pane shows the body exactly as received, with line wrapping, no folding.
- Search.
- Problem marks as lint diagnostics.
- Independent horizontal scroll.
- Highlight colors match DevTools in both themes.

Done when: a multi-MB sample opens and scrolls smoothly, and Cmd+A / Cmd+C and mouse selection copy a long string and a multi-screen selection completely.

### [ ] T11 Path footer
Depends on: T06, T10, T02 (clipboard finding)

- Footer under the EDN pane showing the EDN path at the cursor or selection, via the path index.
- Updates as the cursor moves; empty when not on a value.
- "Copy" button next to the path. No keyboard shortcut, no toolbar button.

Done when: unit-tested lookups pass and the Copy button works inside real DevTools.

### [ ] T12 Theme and look-and-feel pass
Depends on: T07, T08, T09, T10

- Theme from `themeName`.
- Pixel check against the Network panel, light and dark, docked bottom and right.
- Fix anything that looks off.

Done when: screenshots in both themes and both dock positions look native.

### [ ] T13 v1 end-to-end test
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

### [ ] T14 Packaging and README
Depends on: T01

- `npm run package` zip.
- README with what it does, install via Load unpacked, update and share.

Done when: a fresh clone, then `mise install && npm ci && npm run package`, produces a zip that installs and works.

## Phase 2 - Later

From spec "Later". Not to be started until v1 is done:

- [ ] Preserve log
- [ ] Method and status filters
- [ ] Wildcard/glob and regex filters
- [ ] Hide non-Transit rows toggle
- [ ] Keyboard up/down navigation through requests
- [ ] Resizable list/detail split
- [ ] Vertical scroll sync between panes
- [ ] Dimmed parent path for colliding names
- [ ] Web Worker decoding (only if measured need)
- [ ] Custom extension icons
