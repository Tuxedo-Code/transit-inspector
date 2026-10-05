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

/**
 * Requests from DevTools (spec "Capture and navigation"):
 * subscribe to finished requests, backfill from getHAR(), and rebuild from getHAR() on every navigation.
 * DevTools' own log keeps entries across SPA route changes and drops them on real page loads, so mirroring it
 * gives the right clearing behavior. Requests finishing while a rebuild is in flight are re-added to it.
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
          sink.replace([...(log.entries as DevtoolsRequest[]).map(wrap), ...finishedMeanwhile]);
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
