# Transit Debugger

A Chrome DevTools extension that adds a **Transit** tab next to Network. It lists the page's Fetch/XHR requests and shows Transit request payloads and response bodies decoded as readable EDN.

> **Status:** early development. The Transit tab exists but doesn't show requests yet. See [docs/tasks.md](docs/tasks.md) for progress.

## Install as an extension

Requires [mise](https://mise.jdx.dev) (or Node 24).

```sh
mise install
npm ci
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select the `dist/` folder.
3. Open DevTools on any page; the **Transit** tab is next to Network (or under `»` if the window is narrow).

To update after pulling changes: run `npm run build` again, click the reload icon on the extension's card in `chrome://extensions`, then close and reopen DevTools.

To share without the Chrome Web Store: `npm run package` creates `transit-debugger-<version>.zip`. The recipient unzips it and loads the folder with **Load unpacked**.

## Run locally (development)

- `npm run dev`: opens the panel UI in a normal browser tab with hot reload.
- `npm run dev:ext`: rebuilds `dist/` on every change. Reload the extension and reopen DevTools to see changes.
- `npm test`: unit tests. `npm run lint`: lint and format check.

Design and decisions: [docs/spec.md](docs/spec.md).
