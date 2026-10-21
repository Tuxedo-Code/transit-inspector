import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  SearchQuery,
  selectMatches,
  setSearchQuery,
} from "@codemirror/search";
import { CharCategory, type EditorState, findClusterBreak, type SelectionRange } from "@codemirror/state";
import { type EditorView, type Panel, runScopeHandlers, type ViewUpdate } from "@codemirror/view";
import { SLICE_MS } from "./search";

/** The characters a plain-text count scans per search cursor. */
const CHUNK = 65_536;

/**
 * A query's matches in a document, as CodeMirror's own search cursor finds them, so they agree with the highlighted
 * ones. A count of a multi-MB body takes longer than a frame, so it runs in steps.
 */
export class MatchCounter {
  /** The matches' ranges found so far, in document order. */
  readonly from: number[] = [];
  readonly to: number[] = [];
  done = false;
  /** Where the next plain-text chunk starts. */
  private chunkStart = 0;
  /** How far past its chunk a plain-text match can end (see `nextChunk`). */
  private readonly margin: number;
  private cursor: Iterator<{ from: number; to: number }> | null = null;

  constructor(
    readonly state: EditorState,
    readonly query: SearchQuery,
    private readonly chunk = CHUNK,
  ) {
    this.margin = 2 * (query.search.normalize("NFKD").toLowerCase().length + 1);
  }

  /** Counts until `deadline` (a `performance.now()` time) has passed; true once the whole document is counted. */
  step(deadline: number): boolean {
    while (!this.done) {
      if (this.query.regexp) this.nextRegExpMatch();
      else this.nextChunk();
      if (performance.now() > deadline) break;
    }
    return this.done;
  }

  /**
   * One cursor over the whole document: regular expressions run natively, so even a call to `next()` that scans the
   * whole document (no match) stays within about a frame. Cutting it into ranges could split a match.
   */
  private nextRegExpMatch(): void {
    this.cursor ??= this.query.getCursor(this.state);
    const next = this.cursor.next();
    if (next.done) this.done = true;
    else this.add(next.value);
  }

  /**
   * Plain text is compared character by character, normalized (NFKD, and lowercased unless matching case), which is
   * slow enough that a call to `next()` could scan a whole multi-MB document. So each cursor gets one chunk, plus room
   * for a match that starts in it to end past it, and for the character after it, which the by-word test reads from
   * the cursor's own text. Every character of a match normalizes to at least one unit of the normalized query (an
   * astral character, two units, to one), so a match is at most twice that long. The query's escapes (`\n`) only
   * shorten it.
   */
  private nextChunk(): void {
    const { length } = this.state.doc;
    const end = this.chunkEnd(this.chunkStart + this.chunk);
    // A cursor's `next()` skips matches that overlap the previous one, so a chunk resumes at the last match's end.
    const start = Math.max(this.chunkStart, this.to.at(-1) ?? 0);
    const cursor = this.query.getCursor(this.state, start, Math.min(length, end + this.margin));
    for (let next = cursor.next(); !next.done && next.value.from < end; next = cursor.next()) this.add(next.value);
    this.chunkStart = end;
    if (end === length) this.done = true;
  }

  /**
   * Where a chunk can end: anywhere, except by word. CodeMirror's word test reads the character before a match from
   * the cursor's own text, which a chunk starts, and finds none there, as after a space. So by word a chunk ends after
   * a character that isn't part of a word: at the end of the word it would cut, at the latest at the line break.
   */
  private chunkEnd(nominal: number): number {
    const { doc } = this.state;
    if (nominal >= doc.length) return doc.length;
    if (!this.query.wholeWord) return nominal;
    // The categorizer the word test uses.
    const categorize = this.state.charCategorizer(this.state.selection.main.head);
    const line = doc.lineAt(nominal);
    const { text } = line;
    if (nominal === line.from) return nominal;
    // Character by character (grapheme clusters, like the word test), from the first boundary at or after `nominal`.
    for (
      let pos = findClusterBreak(text, nominal - line.from - 1);
      pos < text.length;
      pos = findClusterBreak(text, pos)
    ) {
      if (categorize(text.slice(findClusterBreak(text, pos, false), pos)) !== CharCategory.Word) return line.from + pos;
    }
    return Math.min(doc.length, line.to + 1);
  }

  private add({ from, to }: { from: number; to: number }): void {
    this.from.push(from);
    this.to.push(to);
  }

  /** The index of the match `range` selects exactly, as CodeMirror's highlighter marks one; -1 for none. */
  indexOf(range: SelectionRange): number {
    let low = 0;
    let high = this.from.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const from = this.from[middle] as number;
      if (from < range.from) low = middle + 1;
      else if (from > range.from) high = middle - 1;
      else return this.to[middle] === range.to ? middle : -1;
    }
    return -1;
  }
}

/**
 * The count's text in DevTools' wording (`SearchableView`, measured in Chrome 154): the selected match's place, or
 * how many there are when none is selected. `current` is the selected match's index, -1 for none.
 */
export function matchLabel(total: number, current: number): { text: string; label: string } {
  if (total === 0 || current >= 0) {
    return { text: `${current + 1} of ${total}`, label: `Shows result ${current + 1} of ${total}` };
  }
  const text = total === 1 ? "1 match" : `${total} matches`;
  return { text, label: text };
}

/** A field of the bar. `form=""`, as CodeMirror sets it, keeps it out of any form around the editor. */
function input(attributes: Record<string, string>, onInput: () => void): HTMLInputElement {
  const field = document.createElement("input");
  for (const [name, value] of Object.entries(attributes)) field.setAttribute(name, value);
  field.setAttribute("form", "");
  field.addEventListener("change", onInput);
  return field;
}

function button(name: string, text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = "cm-button";
  element.name = name;
  element.type = "button";
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

function checkbox(field: HTMLInputElement, text: string): HTMLLabelElement {
  const label = document.createElement("label");
  label.append(field, text);
  return label;
}

const sameQuery = (a: SearchQuery, b: SearchQuery) => a.eq(b) && a.literal === b.literal;

/**
 * The find bar (Cmd+F in an editor): CodeMirror's search panel, ported to show the match count like DevTools' own
 * find bars, after the buttons and before the close button. The editors are read-only, so it has no replace row.
 * Control names and classes are CodeMirror's, which the theme and `openSearchPanel` (`[main-field]`) rely on.
 */
export class FindBar implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private query: SearchQuery;
  private readonly searchField: HTMLInputElement;
  private readonly caseField: HTMLInputElement;
  private readonly reField: HTMLInputElement;
  private readonly wordField: HTMLInputElement;
  private readonly count: HTMLElement;
  private readonly countText: HTMLElement;
  private counter: MatchCounter;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly view: EditorView) {
    this.query = getSearchQuery(view.state);
    const phrase = (text: string) => view.state.phrase(text);
    const commit = () => this.commit();
    this.searchField = input(
      {
        class: "cm-textfield",
        name: "search",
        placeholder: phrase("Find"),
        "aria-label": phrase("Find"),
        "main-field": "true",
      },
      commit,
    );
    this.searchField.addEventListener("keyup", commit);
    this.caseField = input({ type: "checkbox", name: "case" }, commit);
    this.reField = input({ type: "checkbox", name: "re" }, commit);
    this.wordField = input({ type: "checkbox", name: "word" }, commit);
    this.setQuery(this.query);

    // DevTools' markup: a polite live region labeled "Shows result 1 of 3", around the text it shows.
    this.count = document.createElement("span");
    this.count.className = "cm-search-count";
    this.count.setAttribute("aria-live", "polite");
    this.countText = document.createElement("span");
    this.countText.setAttribute("aria-hidden", "true");
    this.count.append(this.countText);

    const close = button("close", "×", () => closeSearchPanel(view));
    close.setAttribute("aria-label", phrase("close"));
    this.dom = document.createElement("div");
    this.dom.className = "cm-search";
    this.dom.addEventListener("keydown", (event) => this.keydown(event));
    this.dom.append(
      this.searchField,
      button("next", phrase("next"), () => findNext(view)),
      button("prev", phrase("previous"), () => findPrevious(view)),
      button("select", phrase("all"), () => selectMatches(view)),
      checkbox(this.caseField, phrase("match case")),
      checkbox(this.reField, phrase("regexp")),
      checkbox(this.wordField, phrase("by word")),
      this.count,
      close,
    );
    this.counter = this.startCount();
  }

  mount(): void {
    this.searchField.select();
  }

  update(update: ViewUpdate): void {
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (effect.is(setSearchQuery) && !sameQuery(effect.value, this.query)) this.setQuery(effect.value);
      }
    }
    if (update.docChanged || !sameQuery(getSearchQuery(update.state), this.counter.query)) {
      this.counter = this.startCount();
    } else if (update.selectionSet) {
      this.render();
    }
  }

  destroy(): void {
    clearTimeout(this.timer);
  }

  private commit(): void {
    const query = new SearchQuery({
      search: this.searchField.value,
      caseSensitive: this.caseField.checked,
      regexp: this.reField.checked,
      wholeWord: this.wordField.checked,
    });
    if (!sameQuery(query, this.query)) {
      this.query = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
    }
  }

  private keydown(event: KeyboardEvent): void {
    if (runScopeHandlers(this.view, event, "search-panel")) {
      event.preventDefault();
    } else if (event.key === "Enter" && !event.isComposing && event.target === this.searchField) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(this.view);
    }
  }

  private setQuery(query: SearchQuery): void {
    this.query = query;
    this.searchField.value = query.search;
    this.caseField.checked = query.caseSensitive;
    this.reField.checked = query.regexp;
    this.wordField.checked = query.wholeWord;
  }

  /**
   * Starts counting the editor's query, dropping a count in progress. The first step runs now, so a body that counts
   * within a frame shows its count without flickering.
   */
  private startCount(): MatchCounter {
    clearTimeout(this.timer);
    const counter = new MatchCounter(this.view.state, getSearchQuery(this.view.state));
    this.countStep(counter);
    return counter;
  }

  private countStep(counter: MatchCounter): void {
    if (counter.query.valid && !counter.step(performance.now() + SLICE_MS)) {
      this.timer = setTimeout(() => this.countStep(counter), 0);
    }
    this.render(counter);
  }

  /** Empty without a query and while counting; an invalid pattern finds nothing. */
  private render(counter = this.counter): void {
    let shown: { text: string; label: string } | null = null;
    if (counter.query.search !== "") {
      if (!counter.query.valid) shown = matchLabel(0, -1);
      else if (counter.done) shown = matchLabel(counter.from.length, counter.indexOf(this.view.state.selection.main));
    }
    this.countText.textContent = shown?.text ?? "";
    if (shown) this.count.setAttribute("aria-label", shown.label);
    else this.count.removeAttribute("aria-label");
  }
}
