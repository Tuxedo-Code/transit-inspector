import type { HarEntry, RawEntry } from "../har";
import type { Source } from "./source";

interface HarLog {
  log: { entries: HarEntry[] };
}

/** Wraps entries from a HAR file ("Save all as HAR with content"); bodies come from `response.content.text`. */
export function rawEntriesFromHar(har: HarLog): RawEntry[] {
  return har.log.entries.map((entry) => ({
    entry,
    getContent: async () => ({
      content: entry.response.content.text ?? null,
      encoding: entry.response.content.encoding ?? "",
    }),
  }));
}

/** A source that delivers a fixed list of entries once. */
export function harSource(entries: RawEntry[]): Source {
  return {
    start(sink) {
      sink.replace(entries);
      return () => {};
    },
  };
}
