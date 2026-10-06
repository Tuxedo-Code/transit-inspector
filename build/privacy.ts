import type { Plugin } from "vite";

/**
 * APIs that could get data out of the extension in ways its CSP can't block (docs/spec.md "Privacy").
 * Network APIs (fetch, XMLHttpRequest, ...) aren't listed: the CSP blocks them, and transit-js's dead Closure
 * loader mentions XMLHttpRequest. This catches accidental use by us or by a dependency, not hidden code.
 */
const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /inspectedWindow/, reason: "runs code in the inspected page, outside the extension's CSP" },
  { pattern: /chrome\.(tabs|windows)\b/, reason: "opens URLs, which can carry data out" },
  { pattern: /chrome\.runtime\b/, reason: "messages other extensions" },
  { pattern: /chrome\.scripting\b/, reason: "injects code into pages" },
  { pattern: /\bwindow\.open\b/, reason: "opens URLs, which can carry data out" },
  {
    pattern: /\blocation\.(assign|replace)\b|\blocation\.href\s*=(?!=)/,
    reason: "navigates, which can carry data out",
  },
  { pattern: /dns-prefetch|preconnect/, reason: "leaks a hostname, which the CSP doesn't cover" },
];

/** Returns "`<match>` (<reason>)" for each forbidden API that `code` mentions. */
export function findForbiddenApis(code: string): string[] {
  return FORBIDDEN.flatMap(({ pattern, reason }) => {
    const match = code.match(pattern);
    return match ? [`\`${match[0]}\` (${reason})`] : [];
  });
}

/** Fails the build if any JS chunk mentions a forbidden API. */
export function privacyPlugin(): Plugin {
  return {
    name: "transit-inspector:privacy",
    apply: "build",
    generateBundle(_, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        const found = findForbiddenApis(output.code);
        if (found.length > 0) {
          this.error(`${output.fileName} uses ${found.join(", ")}. Privacy is binding: see docs/spec.md "Privacy".`);
        }
      }
    },
  };
}
