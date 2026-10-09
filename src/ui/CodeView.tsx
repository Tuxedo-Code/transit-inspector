import { defaultKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  LanguageSupport,
  syntaxHighlighting,
} from "@codemirror/language";
import { type Diagnostic, setDiagnostics } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  WidgetType,
} from "@codemirror/view";
import { styleTags, tags } from "@lezer/highlight";
import { clojureLanguage } from "@nextjournal/lang-clojure";
import { useEffect, useRef } from "preact/hooks";
import { enclosingForm, formAt, type PathNode } from "../edn/print";

/** `text` is plain text with control characters made visible, e.g. a string's contents. */
export type CodeLanguage = "edn" | "json" | "text";

/** EDN via the Clojure grammar, with the node types it doesn't style itself. */
const ednLanguage = new LanguageSupport(
  clojureLanguage.configure({
    props: [
      styleTags({
        Keyword: tags.propertyName,
        "ReaderTag/...": tags.meta,
        Character: tags.character,
        Symbol: tags.variableName,
        SymbolicValue: tags.number,
      }),
    ],
  }),
);

const LANGUAGE: Record<CodeLanguage, Extension[]> = {
  edn: [foldGutter(), ednLanguage, bracketMatching()],
  json: [json(), bracketMatching()],
  text: [highlightSpecialChars()],
};

/** Colors come from CSS variables (panel.css) holding DevTools' own token colors for each theme. */
const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--token-key)" },
  { tag: [tags.string, tags.character], color: "var(--token-string)" },
  { tag: tags.number, color: "var(--token-number)" },
  { tag: [tags.bool, tags.atom], color: "var(--token-atom)" },
  { tag: tags.null, color: "var(--token-null)" },
  { tag: tags.meta, color: "var(--token-tag)" },
  { tag: [tags.variableName, tags.keyword, tags.definition(tags.variableName)], color: "var(--token-symbol)" },
  {
    tag: [tags.bracket, tags.squareBracket, tags.brace, tags.punctuation, tags.separator],
    color: "var(--token-punctuation)",
  },
]);

const viewerTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--code-font-size)", backgroundColor: "var(--bg)", color: "var(--fg)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--code-font-family)", lineHeight: "1.5" },
  ".cm-content": { caretColor: "var(--fg)" },
  ".cm-cursor": { borderLeftColor: "var(--fg)" },
  ".cm-gutters": { backgroundColor: "var(--bg)", color: "var(--fg-subtle)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 4px 0 8px" },
  ".cm-foldGutter .cm-gutterElement": { padding: "0 2px", cursor: "pointer" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection) !important",
  },
  ".cm-selectionMatch": { backgroundColor: "var(--selection-match)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--selection-match)",
    outline: "none",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--neutral-container)",
    border: "none",
    color: "var(--fg-subtle)",
    padding: "0 4px",
  },
  // Padded like the Console's "Show more" button (.expandable-inline-button, measured in Chrome 154). That button has
  // the page's background until hovered, so it reads as plain text; the chip takes the fold placeholder's colors so it
  // reads as something to click.
  ".cm-string-chip": {
    display: "inline-block",
    padding: "1px 3px",
    // The printed space before the string is already on its left; one more character's width parts it from the quote.
    margin: "0 1ch 0 0",
    borderRadius: "3px",
    backgroundColor: "var(--neutral-container)",
    color: "var(--fg-subtle)",
    lineHeight: "normal",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  ".cm-string-chip::after": { content: "attr(data-text)" },
  // DevTools' hover color is a translucent overlay, so it goes on top of the chip's own background.
  ".cm-string-chip:hover": { backgroundImage: "linear-gradient(var(--hover), var(--hover))", color: "var(--fg)" },
  ".cm-panels": { backgroundColor: "var(--toolbar-bg)", color: "var(--fg)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--divider)" },
  ".cm-search": { fontFamily: "var(--ui-font-family)", fontSize: "12px" },
  // Cmd+F panel: one toolbar row with the filter box and pill buttons of panel.css, replacing CodeMirror's
  // light-only defaults (white field, gray gradient buttons) that are unreadable in dark.
  ".cm-panel.cm-search": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "4px 6px",
    minHeight: "27px",
    padding: "2px 32px 2px 4px",
  },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": { margin: "0" },
  ".cm-textfield": {
    width: "200px",
    height: "22px",
    padding: "0 8px",
    border: "1px solid transparent",
    borderRadius: "11px",
    backgroundColor: "var(--neutral-container)",
    color: "var(--fg)",
    font: "inherit",
    outline: "none",
  },
  ".cm-textfield:focus": { borderColor: "var(--primary)", backgroundColor: "var(--bg)" },
  ".cm-button, .cm-button:active": {
    height: "20px",
    padding: "0 10px",
    border: "1px solid var(--divider)",
    borderRadius: "10px",
    backgroundColor: "transparent",
    backgroundImage: "none",
    color: "var(--primary)",
    font: "inherit",
    cursor: "pointer",
  },
  ".cm-button:hover": { backgroundColor: "var(--hover)" },
  ".cm-panel.cm-search label": { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "inherit" },
  ".cm-panel.cm-search input[type=checkbox]": { accentColor: "var(--primary)" },
  ".cm-panel.cm-search [name=close]": {
    top: "3px",
    right: "4px",
    width: "20px",
    height: "20px",
    borderRadius: "4px",
    color: "var(--fg-subtle)",
    fontSize: "16px",
    lineHeight: "20px",
    cursor: "pointer",
  },
  ".cm-panel.cm-search [name=close]:hover": { backgroundColor: "var(--hover)", color: "var(--fg)" },
  ".cm-searchMatch": { backgroundColor: "var(--search-match)" },
  ".cm-searchMatch-selected": { backgroundColor: "var(--search-match-current)" },
  ".cm-tooltip": {
    backgroundColor: "var(--bg)",
    color: "var(--fg)",
    border: "1px solid var(--divider)",
    fontFamily: "var(--ui-font-family)",
  },
});

interface Range {
  from: number;
  to: number;
}

/**
 * Form boundaries from the printer's path index (EDN pane). Unlike CodeMirror's syntax tree, which is parsed lazily
 * and can stop short inside a multi-MB body, they are exact everywhere.
 */
export interface Forms {
  /** The form whose bracket is the character at `offset`. */
  at(offset: number): Range | null;
  /** The smallest form around a selection. */
  around(from: number, to: number): Range | null;
}

export function formsOf(index: PathNode): Forms {
  return { at: (offset) => formAt(index, offset), around: (from, to) => enclosingForm(index, from, to) };
}

/** Strings that get a chip before their opening quote (EDN pane), which opens them in the string viewer. */
export interface StringChips {
  /** The strings' start offsets and chip labels, in text order. */
  at: readonly { from: number; label: string }[];
  /** Opens the string at `offset` (chip click, or Enter on any string); false when there is no string there. */
  open(offset: number): boolean;
}

/**
 * A small button like the Console's "Show more", drawn before a string. Its label is CSS generated content, as in
 * DevTools, so it never becomes part of the editor's text, copies or search.
 */
class StringChip extends WidgetType {
  constructor(
    readonly from: number,
    readonly label: string,
    readonly open: (offset: number) => boolean,
  ) {
    super();
  }

  override eq(other: StringChip): boolean {
    return other.from === this.from && other.label === this.label;
  }

  toDOM(view: EditorView): HTMLElement {
    const chip = document.createElement("span");
    chip.className = "cm-string-chip";
    chip.dataset.text = this.label;
    chip.title = "Show string (Enter)";
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-label", `Show string, ${this.label}`);
    // CodeMirror ignores events inside widgets (ignoreEvent), so the chip handles its own clicks.
    chip.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.from + 1 } });
      view.focus();
      this.open(this.from + 1);
    });
    return chip;
  }
}

/** The chips, and Enter to open the string at the cursor: the keyboard's way in, since chips take only clicks. */
function stringChips(chips: StringChips): Extension[] {
  const widgets = chips.at.map(({ from, label }) =>
    Decoration.widget({ widget: new StringChip(from, label, chips.open), side: -1 }).range(from),
  );
  return [
    EditorView.decorations.of(Decoration.set(widgets, true)),
    keymap.of([{ key: "Enter", run: (view) => chips.open(view.state.selection.main.head) }]),
  ];
}

/** Double-clicking a bracket selects its form; Cmd+I expands the selection form by form, like Calva. */
function formSelection(forms: Forms): Extension[] {
  return [
    keymap.of([
      {
        key: "Mod-i",
        preventDefault: true,
        run(view) {
          const { from, to } = view.state.selection.main;
          const form = forms.around(from, to);
          // No scrollIntoView, unlike CodeMirror's own Cmd+I: it would jump to the far end of a big form.
          if (form) view.dispatch({ selection: { anchor: form.from, head: form.to } });
          return true;
        },
      },
    ]),
    // A selection style rather than a plain mousedown handler: CodeMirror then owns the selection for the whole
    // gesture, as for its own double-click. Otherwise the browser's caret move from a first click inside a selection
    // (left to the browser for drag and drop) can arrive later and undo the form selection.
    EditorView.mouseSelectionStyle.of((view, event) => {
      if (event.button !== 0 || event.detail !== 2) return null;
      const { pos, assoc } = view.posAndSideAtCoords({ x: event.clientX, y: event.clientY }, false);
      // The character under the pointer, picked like CodeMirror's own double-click does.
      const form = forms.at(assoc < 0 ? pos - 1 : pos);
      if (!form) return null;
      return { get: () => EditorSelection.single(form.from, form.to), update: () => false };
    }),
  ];
}

function extensionsFor({
  language,
  wrap,
  forms,
  chips,
  onCursor,
}: {
  language: CodeLanguage;
  wrap: boolean;
  forms: Forms | undefined;
  chips: StringChips | undefined;
  onCursor: (offset: number) => void;
}): Extension[] {
  return [
    lineNumbers(),
    ...LANGUAGE[language],
    drawSelection(),
    highlightSelectionMatches(),
    search({ top: true }),
    // Before the default keymap, so their Cmd+I and Enter win.
    ...(forms ? formSelection(forms) : []),
    ...(chips ? stringChips(chips) : []),
    keymap.of([...searchKeymap, ...foldKeymap, ...defaultKeymap]),
    syntaxHighlighting(highlightStyle),
    viewerTheme,
    EditorState.readOnly.of(true),
    ...(wrap ? [EditorView.lineWrapping] : []),
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet) return;
      const selection = update.state.selection.main;
      onCursor(selection.empty ? selection.head : selection.from);
    }),
  ];
}

interface Props {
  doc: string;
  language: CodeLanguage;
  /** Wrap long lines (the raw pane, which shows bodies unformatted). */
  wrap?: boolean;
  diagnostics: readonly Diagnostic[];
  /** Enables selecting forms by bracket double-click and Cmd+I. */
  forms?: Forms;
  /** Chips before strings that open them in the string viewer. */
  chips?: StringChips | undefined;
  onCursor?: (offset: number) => void;
  label: string;
}

/**
 * A read-only CodeMirror viewer with default editor behavior (selection, copy, folding, Cmd+F search), plus form
 * selection when given `forms` and string chips when given `chips`.
 */
export function CodeView({ doc, language, wrap = false, diagnostics, forms, chips, onCursor, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cursorListener = useRef(onCursor);
  cursorListener.current = onCursor;

  useEffect(() => {
    if (!host.current) return;
    const created = new EditorView({ parent: host.current });
    // DevTools forwards its global shortcuts (Cmd+F, Esc...) from extension panels even when the page handled them,
    // so keys the editor handled stop here (docs/spec.md "Known risks").
    created.dom.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) event.stopPropagation();
    });
    view.current = created;
    return () => created.destroy();
  }, []);

  useEffect(() => {
    const current = view.current;
    if (!current) return;
    current.setState(
      EditorState.create({
        doc,
        extensions: extensionsFor({
          language,
          wrap,
          forms,
          chips,
          onCursor: (offset) => cursorListener.current?.(offset),
        }),
      }),
    );
    if (diagnostics.length > 0) current.dispatch(setDiagnostics(current.state, [...diagnostics]));
    current.contentDOM.setAttribute("aria-label", label);
  }, [doc, language, wrap, forms, chips, diagnostics, label]);

  return <div class="code-view" ref={host} />;
}
