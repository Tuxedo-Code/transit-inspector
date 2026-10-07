# Contributing

Issues and pull requests are welcome.

## Before you start

Read [docs/spec.md](docs/spec.md). It is the source of truth for scope, and its non-goals are binding: features that change or replay requests are out of scope. Ideas that were already evaluated and not built are in [docs/considered.md](docs/considered.md), with the reasons.

## Build from source

Requires [mise](https://mise.jdx.dev) (or Node 24).

```sh
git clone https://github.com/Tuxedo-Code/transit-inspector.git
cd transit-inspector
mise install
npm ci
npm run build
```

Load the `dist/` folder with **Load unpacked** in `chrome://extensions`, as in the [README](README.md#install). After pulling changes, run `npm run build` again and reload the extension.

## Commands

- `npm run dev`: the panel UI in a normal browser tab with sample data (`samples/basic.har`) and hot reload. The fastest loop for UI work.
- `npm run dev:ext`: rebuild `dist/` on every change. Reload the extension and reopen DevTools to see changes.
- `npm run build`: typecheck and build the extension into `dist/`.
- `npm test`: unit tests (Vitest).
- `npm run test:e2e`: build, then run the Puppeteer tests in Chrome for Testing, including the extension in real DevTools. Opens a visible Chrome window. Screenshots land in `e2e/screenshots/`.
- `E2E_BROWSER="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" npm run test:e2e`: run the real-DevTools tests in Brave, or any other Chromium executable. The UI tests always use Chrome for Testing.
- `npm run lint` / `npm run format`: Biome check / fix.
- `npm run typecheck`: TypeScript only.
- `npm run package`: build and zip `dist/` into the same `transit-inspector-<version>.zip` that releases ship.

## Pull requests

Before opening one, run `npm run lint`, `npm test` and `npm run test:e2e`. CI runs the same checks.

For UI changes, check the screenshots in `e2e/screenshots/` in light and dark, against the Network panel.

## Commits and releases

Commit messages (or squash-merge titles) follow [Conventional Commits](https://www.conventionalcommits.org). `feat:` and `fix:` are for user-visible changes: they end up in the changelog and trigger a release. Use `docs:`, `ci:`, `chore:` and so on for the rest.

Releases are automated with release-please: pushes to `main` keep a release PR open, and merging it publishes a GitHub Release with the changelog and the zip. Never edit `CHANGELOG.md` or the `package.json` version, tag, or create GitHub Releases by hand. To force a version, put a `Release-As: x.y.z` footer in a commit. See [docs/spec.md "Releases"](docs/spec.md#releases).

## Project docs

- [docs/spec.md](docs/spec.md): scope, design and decisions.
- [docs/tasks.md](docs/tasks.md): the work plan.
- [docs/considered.md](docs/considered.md): ideas evaluated and not built.
- [docs/guide.md](docs/guide.md): the user guide, including the limitations users see.
- [store/listing.md](store/listing.md): the Chrome Web Store listing.
- [AGENTS.md](AGENTS.md): notes for coding agents, and gotchas that aren't obvious from the code.
