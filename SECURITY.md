# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the [Security tab](https://github.com/Tuxedo-Code/transit-inspector/security) and click **Report a vulnerability**. Please don't open a public issue for it. Once a fix is released, the advisory is published.

## Supported versions

Only the [latest release](https://github.com/Tuxedo-Code/transit-inspector/releases/latest) gets fixes. Installs from a release zip don't update themselves, so update by installing the newest zip.

## What's in scope

Transit Inspector promises to make no network requests and to keep captured traffic inside DevTools ([PRIVACY.md](PRIVACY.md)). Any way to get data out of the extension, or to make it run code it didn't ship with, counts as a vulnerability.

## Verifying a release

Each release zip is built by CI and carries a signed build attestation. To check that a download came from this repository, use [`gh attestation verify`](https://cli.github.com/manual/gh_attestation_verify):

```sh
gh attestation verify transit-inspector-<version>.zip -R Tuxedo-Code/transit-inspector
```

## Dependencies

Dependencies are updated monthly by Dependabot, merged by hand after CI, and audited in CI for known vulnerabilities and registry signatures. Install scripts of npm packages don't run. Details: [docs/spec.md "Dependencies and supply chain"](docs/spec.md#dependencies-and-supply-chain).
