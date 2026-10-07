# Privacy

The Transit panel sees the requests and responses of the page you inspect, which often hold private data. It is built so that this data never leaves DevTools.

## What the extension does with your data

- **Nothing leaves DevTools.** The extension makes no requests of its own: no telemetry, analytics, crash reports or third-party services.
- **Nothing is kept.** Captured traffic stays in DevTools' memory and is gone when you close DevTools.
- **Two settings are saved:** the view mode and the request list's width, in the extension's local storage.

## How that is enforced

- **The browser blocks connections.** The extension's [Content Security Policy](manifest.json) blocks every connection from its pages (`connect-src 'none'`). To check a release yourself, open `manifest.json` in the zip.
- **The build refuses other ways out.** The build fails if the code mentions an API that could get data out without a connection, such as opening a URL or messaging another extension.
- **CI tests it in real DevTools.** Tests try to reach a server from inside the panel in several ways, and check that nothing arrives.

## The "Read and change all your data" warning

The extension requests no permissions: its manifest asks for none. Chrome (and Brave) still shows "Read and change all your data on all websites" on its details page. Chrome says that about every DevTools extension, because DevTools extensions *can* run code in the page they inspect. Transit Inspector never does, and its build fails if that API (`chrome.devtools.inspectedWindow.eval`) shows up in the code.

## More

- Verifying that a download was built from this repository, and reporting a vulnerability: [SECURITY.md](SECURITY.md).
- The full design and the reasoning behind each measure: [docs/spec.md "Privacy"](docs/spec.md#privacy).
