import { entryId, isListed, type RawEntry, toRow } from "./har";
import type { RequestRow } from "./model";
import type { Sink } from "./sources/source";

export const MAX_ROWS = 1000;

type Listener = (rows: readonly RequestRow[]) => void;

/**
 * Holds the captured rows in start-time order and keeps them in sync with a source.
 * Rows are converted asynchronously (bodies are read lazily), so results from before
 * a `replace` or `clear` are discarded via a generation counter.
 */
export class RequestStore implements Sink {
  private rows: RequestRow[] = [];
  private readonly known = new Map<string, RequestRow>();
  /** Ids the user cleared; ignored if a later `replace` brings them back. */
  private readonly cleared = new Set<string>();
  /**
   * Order in which entries arrived from the source. HAR start times only have millisecond precision,
   * so requests often share one; arrival order (DevTools lists entries in start order) breaks the tie.
   */
  private readonly arrival = new Map<string, number>();
  private nextArrival = 0;
  private generation = 0;
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.rows);
    return () => this.listeners.delete(listener);
  }

  getRows(): readonly RequestRow[] {
    return this.rows;
  }

  add(entries: RawEntry[]): void {
    this.ingest(entries, this.generation);
  }

  replace(entries: RawEntry[]): void {
    const ids = new Set(entries.map((raw) => entryId(raw.entry)));
    for (const id of this.cleared) if (!ids.has(id)) this.cleared.delete(id);
    // Keep rows that are still present so their bodies aren't read again.
    for (const id of this.known.keys()) if (!ids.has(id)) this.known.delete(id);
    // The replacement list is authoritative for order too (DevTools lists entries in start order).
    this.arrival.clear();
    for (const id of ids) this.arrival.set(id, this.nextArrival++);
    this.generation++;
    this.rows = [...this.known.values()].sort(this.byStart);
    this.emit();
    this.ingest(entries, this.generation);
  }

  clear(): void {
    for (const id of this.known.keys()) this.cleared.add(id);
    this.known.clear();
    this.arrival.clear();
    this.generation++;
    this.rows = [];
    this.emit();
  }

  private ingest(entries: RawEntry[], generation: number): void {
    for (const raw of entries) {
      if (!isListed(raw.entry)) continue;
      const id = entryId(raw.entry);
      if (this.known.has(id) || this.cleared.has(id)) continue;
      if (!this.arrival.has(id)) this.arrival.set(id, this.nextArrival++);
      void toRow(raw).then((row) => {
        if (generation !== this.generation || this.known.has(id) || this.cleared.has(id)) return;
        this.insert(row);
      });
    }
  }

  private insert(row: RequestRow): void {
    this.known.set(row.id, row);
    const rows = [...this.rows];
    let index = rows.length;
    while (index > 0 && this.byStart(rows[index - 1] as RequestRow, row) > 0) index--;
    rows.splice(index, 0, row);
    while (rows.length > MAX_ROWS) {
      const dropped = rows.shift() as RequestRow;
      this.known.delete(dropped.id);
      this.arrival.delete(dropped.id);
    }
    this.rows = rows;
    this.emit();
  }

  private readonly byStart = (a: RequestRow, b: RequestRow): number =>
    a.startedMs - b.startedMs || (this.arrival.get(a.id) ?? 0) - (this.arrival.get(b.id) ?? 0);

  private emit(): void {
    for (const listener of this.listeners) listener(this.rows);
  }
}
