# Transit Debugger

Chrome DevTools extension (Manifest V3) that adds a "Transit" panel showing Fetch/XHR Transit traffic decoded as EDN. Observe only.

- [docs/spec.md](docs/spec.md) is the source of truth for scope and decisions. Read it before planning or coding. Non-goals are binding.
- [docs/tasks.md](docs/tasks.md) is the work plan:
  - Before starting a task, mark it `[~]`.
  - Mark it `[x]` only after its "Done when" is verified.
  - Add a brief note under the task for whoever picks up the next one.
- If work requires changing a decision, update spec.md in the same change. Don't deviate silently.
- UI work is checked in real Chrome DevTools against the Network panel, in light and dark themes.

## Commands

Toolchain: `mise install && npm ci` (mise pins Node).

- `npm run build`: typecheck + build the extension into `dist/` (load it via chrome://extensions > Load unpacked)
- `npm run dev:ext`: rebuild `dist/` on change; reload the extension and reopen DevTools to see it
- `npm run dev`: panel UI in a normal tab with hot reload
- `npm test`: unit tests (Vitest)
- `npm run lint` / `npm run format`: Biome check / fix
- `npm run typecheck`: TypeScript only
- `npm run package`: build and zip `dist/` for sharing
