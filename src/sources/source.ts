import type { RawEntry } from "../har";

/** Receives entries from a source. */
export interface Sink {
  /** New entries finished loading. */
  add(entries: RawEntry[]): void;
  /**
   * The authoritative full list (initial backfill, or after a navigation). `currentPage` is the HAR page id of the
   * current page load: entries with another `pageref` are from earlier loads that DevTools itself kept (the Network
   * panel's "Keep log").
   */
  replace(entries: RawEntry[], currentPage?: string): void;
}

/** Where requests come from: DevTools in the extension, HAR files in development and tests. */
export interface Source {
  /** Starts delivering entries; returns a function that stops it. */
  start(sink: Sink): () => void;
}
