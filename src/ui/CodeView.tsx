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
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, lineNumbers } from "@codemirror/view";
import { styleTags, tags } from "@lezer/highlight";
import { clojureLanguage } from "@nextjournal/lang-clojure";
import { useEffect, useRef } from "preact/hooks";

export type CodeLanguage = "edn" | "json";

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

function extensionsFor(language: CodeLanguage, wrap: boolean, onCursor: (offset: number) => void): Extension[] {
  return [
    lineNumbers(),
    ...(language === "edn" ? [foldGutter(), ednLanguage] : [json()]),
    drawSelection(),
    bracketMatching(),
    highlightSelectionMatches(),
    search({ top: true }),
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
  onCursor?: (offset: number) => void;
  label: string;
}

/** A read-only CodeMirror viewer with default editor behavior: selection, copy, folding, Cmd+F search. */
export function CodeView({ doc, language, wrap = false, diagnostics, onCursor, label }: Props) {
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
        extensions: extensionsFor(language, wrap, (offset) => cursorListener.current?.(offset)),
      }),
    );
    if (diagnostics.length > 0) current.dispatch(setDiagnostics(current.state, [...diagnostics]));
    current.contentDOM.setAttribute("aria-label", label);
  }, [doc, language, wrap, diagnostics, label]);

  return <div class="code-view" ref={host} />;
}
