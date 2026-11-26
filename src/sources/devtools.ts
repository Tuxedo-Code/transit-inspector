import type { HarEntry, RawEntry } from "../har";
import type { Source } from "./source";

type Network = typeof chrome.devtools.network;
type DevtoolsRequest = chrome.devtools.network.Request;

function wrap(request: DevtoolsRequest): RawEntry {
  return {
    entry: request as unknown as HarEntry,
    getContent: () =>
      new Promise((resolve, reject) => {
        // getHAR() entries support getContent too (verified in T02), but it isn't in the types.
        if (typeof request.getContent !== "function") return reject(new Error("No getContent"));
        request.getContent((content, encoding) => resolve({ content: content ?? null, encoding: encoding ?? "" }));
      }),
  };
}

/** The id of the newest page load in DevTools' log. `getHAR()` lists pages newest first, but don't rely on it. */
function currentPage(log: HARFormatLog): string | undefined {
  let newest: { id: string; startedDateTime: string } | undefined;
  for (const page of log.pages ?? []) {
    if (!newest || Date.parse(page.startedDateTime) > Date.parse(newest.startedDateTime)) newest = page;
  }
  return newest?.id;
}

/**
 * Requests from DevTools (spec "Capture and navigation"):
 * subscribe to finished requests, backfill from getHAR(), and rebuild from getHAR() on every navigation.
 * DevTools' own log keeps entries across SPA route changes and drops them on real page loads, unless the Network
 * panel's "Keep log" is on; then each entry's `pageref` tells the page loads apart, and the store decides what to keep
 * (our own "Keep log"). The log also holds requests still in flight; the entry from `onRequestFinished`
 * replaces what was read from it. Requests finishing while a rebuild is in flight are re-added after it.
 */
export function devtoolsSource(network: Network = chrome.devtools.network): Source {
  return {
    start(sink) {
      let inFlight: RawEntry[] | null = null;

      const onFinished = (request: DevtoolsRequest) => {
        const raw = wrap(request);
        inFlight?.push(raw);
        sink.add([raw]);
      };
      const rebuild = () => {
        inFlight = [];
        network.getHAR((log) => {
          const finishedMeanwhile = inFlight ?? [];
          inFlight = null;
          sink.replace((log.entries as DevtoolsRequest[]).map(wrap), currentPage(log));
          sink.add(finishedMeanwhile);
        });
      };

      network.onRequestFinished.addListener(onFinished);
      network.onNavigated.addListener(rebuild);
      rebuild();
      return () => {
        network.onRequestFinished.removeListener(onFinished);
        network.onNavigated.removeListener(rebuild);
      };
    },
  };
}
