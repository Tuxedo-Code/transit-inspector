# Chrome Web Store listing

What to enter in the [developer dashboard](https://chrome.google.com/webstore/devconsole), field by field. Keep it in sync with the README and `PRIVACY.md`: every claim here must stay true of the shipped extension (spec "Privacy").

The images in this folder come from `npm run build && node store/make-images.ts` (screenshots from the real extension in real DevTools, plus the promo tile). Regenerate them on macOS, where the fonts match DevTools there, when the UI changes.

## Package

Upload `transit-inspector-<version>.zip` from the GitHub Release. The store takes the name, the summary (the manifest's `description`), the version and the icon from it.

## Store listing tab

- **Category:** Developer Tools
- **Language:** English
- **Store icon:** `icons/128.png`
- **Screenshots** (1280x800), in this order: `screenshot-1-edn.png`, `screenshot-2-side-by-side.png`, `screenshot-3-search.png`
- **Small promo tile** (440x280): `promo-tile.png`
- **Homepage URL:** https://github.com/Tuxedo-Code/transit-inspector
- **Support URL:** https://github.com/Tuxedo-Code/transit-inspector/issues

**Description** (plain text):

```text
Adds a Transit tab to Chrome DevTools, next to Network. It lists the page's Fetch/XHR requests and shows Transit request payloads and response bodies decoded as readable EDN, next to the raw Transit.

Transit is a format for sending data between applications, most often Clojure and ClojureScript ones. Sent as JSON, it packs keywords, sets, dates and maps with non-string keys into strings and arrays ("~:user/id", ["^ ", ...]), which makes the raw JSON in the Network panel hard to read. Transit Inspector shows it as EDN, Clojure's own data notation.

• Requests carrying Transit are clickable; other Fetch/XHR requests are grayed out. Transit is detected by content type, or by sniffing bodies served as application/json.
• EDN, Transit, or both side by side. Fold, select, copy and search (Cmd+F / Ctrl+F) like in an editor.
• The footer shows the get-in path of the value at the cursor, with a "Copy path" button.
• Show any string as plain text, with real line breaks instead of \n: handy for stack traces and SQL.
• Follows the DevTools light and dark theme. Observe only: it never changes requests.

Privacy: the extension makes no network requests of its own. No telemetry, analytics or third-party services, and its Content Security Policy blocks every connection from its pages. Captured traffic stays in DevTools' memory and is gone when you close DevTools; only the view mode and the request list's width are saved. It requests no permissions. Chrome still lists "Read and change all your data on all websites" for every DevTools extension, because DevTools extensions can run code in the page they inspect; Transit Inspector never does, and its build fails if that API appears in the code.

Open source (MIT): https://github.com/Tuxedo-Code/transit-inspector
```

## Privacy practices tab

- **Single purpose:**

  ```text
  Shows Transit traffic of the inspected page, decoded as EDN, in a DevTools panel.
  ```

- **Permission justification:** none; the manifest requests no permissions or host permissions.
- **Remote code:** No, I am not using remote code. (All code ships in the package; the CSP allows `script-src 'self'` only.)
- **Data usage:** collects none of the listed data types. Captured requests are shown in the panel and never leave DevTools.
- **Certify** all three: data is not sold or transferred to third parties, not used for purposes unrelated to the single purpose, and not used to determine creditworthiness or for lending.
- **Privacy policy URL:** https://github.com/Tuxedo-Code/transit-inspector/blob/main/PRIVACY.md

## Distribution tab

- **Visibility:** Public
- **Regions:** All regions
