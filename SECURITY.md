# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the [Security tab](https://github.com/Tuxedo-Code/transit-inspector/security) and click **Report a vulnerability**. Please don't open a public issue for it. Once a fix is released, the advisory is published.

## Supported versions

Only the [latest release](https://github.com/Tuxedo-Code/transit-inspector/releases/latest) gets fixes. Installs from a release zip don't update themselves, so update by installing the newest zip.

## What's in scope

Transit Inspector promises to make no network requests and to keep captured traffic inside DevTools ([docs/spec.md "Privacy"](docs/spec.md#privacy)). Any way to get data out of the extension, or to make it run code it didn't ship with, counts as a vulnerability.

Release zips carry a build provenance attestation. To check that a zip was built by this repository's CI:

```sh
gh attestation verify transit-inspector-<version>.zip -R Tuxedo-Code/transit-inspector
```
