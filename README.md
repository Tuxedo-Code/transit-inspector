# Transit Inspector

A DevTools extension for Chrome and Brave that adds a **Transit** tab next to Network. It lists the page's Fetch/XHR requests and shows Transit request payloads and response bodies decoded as readable EDN, next to the raw Transit.

- Requests carrying Transit are clickable; other Fetch/XHR requests are grayed out. Transit is detected by content type, or by sniffing bodies served as `application/json`.
- Views: EDN, Transit, or both side by side. Fold, select, copy and search (Cmd+F) like in an editor.
- The footer under the EDN view shows the `get-in` path of the value at the cursor, with a Copy button.
- Follows the DevTools light/dark theme. Observe only: it never changes requests.

## Install as an extension

Requires [mise](https://mise.jdx.dev) (or Node 24).

```sh
mise install
npm ci
npm run build
```

1. Open `chrome://extensions` (in Brave: `brave://extensions`) and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select the `dist/` folder.
3. Open DevTools on any page; the **Transit** tab is next to Network (or under `»` if DevTools is narrow).

To update after pulling changes: run `npm run build` again, click the reload icon on the extension's card in the extensions page, then close and reopen DevTools.

Other Chromium browsers (Edge, Vivaldi, Opera, Arc) will likely work the same way but aren't tested. Firefox and Safari aren't supported.

To share without the Chrome Web Store: `npm run package` creates `transit-inspector-<version>.zip`. The recipient unzips it and loads the folder with **Load unpacked**.

## Limitations

**What gets captured**

- Only requests made while DevTools is open for that tab. Requests from before DevTools was opened are never seen. Requests made before you click the Transit tab are fine.
- Only Fetch/XHR requests. WebSocket messages, documents, scripts and other resource types are not shown.
- A page reload clears the list, like the Network panel. SPA route changes don't. There is no "Preserve log" yet.
- At most the last 1,000 requests are kept; older ones drop off.
- Requests started in the same millisecond can briefly appear in the order they finished instead of the order they started, right after a reload.

**What gets decoded**

- Only Transit JSON. `application/transit+msgpack` requests are listed but grayed out and not decoded.
- Transit served with another content type is only detected if the first 4 KB of the body contain a Transit marker (`"^ "`, `"~:` or `"~#`). A body without any keywords, tags or maps, such as a plain array of numbers, is treated as plain JSON.
- Bodies of requests without Transit aren't kept, so plain JSON responses can't be opened here. Use the Network panel for them.
- If DevTools has already discarded a response body, the panel says it's no longer available.
- Observe only: requests can't be paused, edited, replayed or overridden.

**How values are shown**

- A float sent as `1.0` shows as `1`: JSON doesn't distinguish them, so the information is gone before decoding.
- Integers above 2^53 are exact when sent the Transit way (`"~i..."`). If a server sends them as plain JSON numbers, they may already have lost precision; such values are underlined with a warning.
- Map entries and set elements are shown in the order they were sent, not in Clojure's own (hash) order.
- App-specific Transit tags have no handlers here: they show as `#tag value` with a warning underline. URIs show as `#uri "..."`, which standard EDN readers don't know.
- Paths in the footer use list positions too, but `get-in` can't index into lists, so such a path won't work as-is in Clojure.
- The URL filter is a plain case-insensitive substring match: no wildcards or regular expressions.
- Bodies are decoded when you open them. A 3 MB response takes about 100 ms; much larger ones may briefly freeze the panel.

## Run locally (development)

- `npm run dev`: opens the panel UI in a normal browser tab with sample data (`samples/basic.har`) and hot reload.
- `npm run dev:ext`: rebuilds `dist/` on every change. Reload the extension and reopen DevTools to see changes.
- `npm test`: unit tests. `npm run test:e2e`: browser tests, including the extension in real DevTools (opens a Chrome window).
- `npm run lint`: lint and format check.

Design and decisions: [docs/spec.md](docs/spec.md). Work plan: [docs/tasks.md](docs/tasks.md).
