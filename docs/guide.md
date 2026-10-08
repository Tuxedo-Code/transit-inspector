# User guide

How to use the Transit panel, what it can't do, and what to try when something looks wrong. To install it, see the [README](../README.md#install).

## Using the panel

Shortcuts are written for macOS. On Windows and Linux, use Ctrl instead of Cmd.

**Request list.** The left side lists the page's Fetch/XHR requests in the order they started, like the Network panel. Requests carrying Transit are clickable; the others are grayed out. Transit is detected by its content type, or by sniffing bodies served as `application/json`. Type in the filter box to match part of the URL. The Clear button empties the list.

**Payload and Response.** Click a request to open it, then switch between its request payload and its response body.

**Views.** Show the decoded EDN, the raw Transit, or both side by side. The choice is remembered.

**Editor.** Both views are read-only editors: select, copy, and fold maps, vectors, lists and sets with the arrows in the EDN gutter. Problems such as malformed Transit, unknown tags or lost precision are underlined, with a message on hover.

**Search.** Cmd+F anywhere in the panel searches the open view. With nothing open, it focuses the URL filter.

**Select a form.** Double-click an opening or closing bracket in the EDN view to select the whole map, vector, list or set. Press Cmd+I to expand the selection to the enclosing form, step by step, like Calva.

**Path footer.** The footer under the EDN view shows the `get-in` path of the value at the cursor, such as `[:user :orders 0 :id]`, with a "Copy path" button.

**Read a string.** The EDN view prints strings escaped, so a stack trace or SQL query shows as one long line with `\n` and `\t`. Click the gray chip before such a string, labeled with its line count (like `13 lines`), or put the cursor on any string and click "Show text" in the footer: the string opens as plain text under the EDN view, with real line breaks and tabs. Select and copy there to get the string itself, without escapes. While it is open, it follows the cursor to other strings. Cmd+F searches it too.

**Layout.** Drag the border between the request list and the detail view to resize them. The width is remembered. The "Hide request list" button in the toolbar gives the detail view the full width.

**Theme.** The panel follows the DevTools light or dark theme.

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
- Observe only: requests can't be paused, edited, replayed or overridden.

**How values are shown**

- A float sent as `1.0` (or `1.0E7`) shows as `1` (or `10000000`) in the EDN view: the browser's JSON parser drops the difference before decoding. The Transit view shows the number exactly as sent.
- Integers above 2^53 are exact when sent the Transit way (`"~i..."`). If a server sends them as plain JSON numbers, they may already have lost precision; such values are underlined with a warning.
- Map entries and set elements are shown in the order they were sent, not in Clojure's own (hash) order.
- App-specific Transit tags have no handlers here: they show as `#tag value` with a warning underline. URIs show as `#uri "..."`, which standard EDN readers don't know.
- Paths in the footer use list positions too, but `get-in` can't index into lists, so such a path won't work as-is in Clojure.
- The URL filter is a plain case-insensitive substring match: no wildcards or regular expressions.
- Bodies are decoded when you open them. A 3 MB response takes about 100 ms; much larger ones may briefly freeze the panel.

## Troubleshooting

**No Transit tab.** Look under `»` at the end of the DevTools tab strip. If it isn't there either, close and reopen DevTools: a DevTools window opened before the extension was installed or reloaded doesn't get the tab.

**The list is empty.** Reload the page with DevTools open: requests from before DevTools opened are never seen.

**A request is grayed out.** It carries no Transit in either direction, its body is `transit+msgpack`, or it never got a response (network error, CORS, cancelled).

**Cmd+F opens DevTools' own search bar.** That happens right after you switch to the Transit tab, and DevTools' bar can't search the panel. Click anywhere in the panel first, then press Cmd+F again.

**"This body is no longer available in DevTools".** DevTools has discarded the body. Repeat the request to see it.
