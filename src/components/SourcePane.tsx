import React, { useEffect, useRef } from 'react';
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
  Transaction,
} from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { type SourceError } from '../core/engine';

/** Marks transactions that sync the view with the prop, so they are not saved back. */
const External = Annotation.define<boolean>();

interface SourcePaneProps {
  rawText: string;
  /** Bumped on every note switch; recreates the view and its undo history. */
  epoch: number;
  readOnly: boolean;
  /** The engine's highlighting and completion. */
  language: Extension;
  errors: SourceError[];
  onTextChange: (text: string) => void;
  /** Receives the main selection whenever it moves. */
  onSelection?: (from: number, to: number) => void;
  /** Receives the CodeMirror view once created, and null when it goes. */
  onView?: (view: EditorView | null) => void;
}

const sourceTheme = EditorView.theme({
  // The editor background, as in the Standard Notes plain editor; the
  // rendering keeps the contrast background, so the panes stand apart.
  '&': {
    backgroundColor:
      'var(--sn-stylekit-editor-background-color, var(--sn-stylekit-background-color))',
    color: 'var(--sn-stylekit-editor-foreground-color, var(--sn-stylekit-foreground-color))',
    fontFamily: 'var(--sn-stylekit-monospace-font, monospace)',
    fontSize: 'var(--sn-stylekit-font-size-editor)',
    height: '100%',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
  '.cm-gutters': {
    backgroundColor:
      'var(--sn-stylekit-editor-background-color, var(--sn-stylekit-background-color))',
    borderRight: '1px solid var(--sn-stylekit-border-color)',
    color: 'var(--stave-muted-color)',
  },
  // The native caret and selection: CodeMirror's base theme paints the
  // caret black, lost on a dark theme, and StyleKit has no translucent
  // accent to select with.
  '.cm-content': {
    caretColor: 'var(--sn-stylekit-editor-foreground-color, var(--sn-stylekit-foreground-color))',
  },
  '.cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--sn-stylekit-info-color) 35%, transparent)',
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
});

// Token colors from the theme variables, so they read well in every theme.
// Green and orange are too light for text on a light background, so they
// lean toward the theme's text color: darker on light themes, lighter on
// dark ones.
const toText = (color: string) =>
  `color-mix(in srgb, var(${color}) 55%, var(--sn-stylekit-foreground-color))`;

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--sn-stylekit-info-color)', fontWeight: '600' },
  { tag: [tags.meta, tags.comment], color: 'var(--stave-muted-color)' },
  { tag: tags.comment, fontStyle: 'italic' },
  { tag: tags.string, color: toText('--sn-stylekit-success-color') },
  { tag: tags.attributeName, color: toText('--sn-stylekit-warning-color') },
  { tag: tags.operator, color: 'var(--sn-stylekit-info-color)' },
  { tag: [tags.number, tags.atom, tags.punctuation], color: 'var(--stave-muted-color)' },
]);

/** The single change turning `from` into `to`, trimmed to what differs, so
 * the cursor and scroll position outside the edit survive the sync. */
export function changedRange(from: string, to: string) {
  let start = 0;
  const max = Math.min(from.length, to.length);
  while (start < max && from[start] === to[start]) {
    start++;
  }
  let end = 0;
  while (end < max - start && from[from.length - 1 - end] === to[to.length - 1 - end]) {
    end++;
  }
  return { from: start, to: from.length - end, insert: to.slice(start, to.length - end) };
}

/** Renderer errors as lint diagnostics, clamped to the document. */
export function toDiagnostics(errors: SourceError[], state: EditorState): Diagnostic[] {
  const length = state.doc.length;
  return errors.map((error) => {
    let from = error.from;
    let to = error.to;
    if (from === undefined) {
      const line = state.doc.line(Math.min(Math.max(error.line, 1), state.doc.lines));
      from = Math.min(line.from + Math.max(error.column - 1, 0), line.to);
      to = line.to;
    }
    from = Math.min(Math.max(from, 0), length);
    to = Math.min(Math.max(to ?? from, from), length);
    return { from, to, severity: 'error', message: error.message };
  });
}

/** The notation source, a CodeMirror 6 editor. Text from the host is applied
 * without being saved back; the renderer's errors show inline. */
function SourcePane(props: SourcePaneProps) {
  const { rawText, epoch, readOnly, language, errors } = props;
  const viewRef = useRef<EditorView | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const languageSlot = useRef(new Compartment());
  const readOnlySlot = useRef(new Compartment());
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  });

  useEffect(() => {
    const view = new EditorView({
      parent: containerRef.current as HTMLElement,
      state: EditorState.create({
        doc: rawText,
        extensions: [
          lineNumbers(),
          history(),
          lintGutter(),
          syntaxHighlighting(highlightStyle),
          EditorView.lineWrapping,
          sourceTheme,
          languageSlot.current.of(language),
          readOnlySlot.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          // Focusable by Tab, which also lets the keyboard scroll it.
          EditorView.contentAttributes.of({ 'aria-label': 'Notation source', tabindex: '0' }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((transaction) => transaction.annotation(External))
            ) {
              callbacks.current.onTextChange(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) {
              const { from, to } = update.state.selection.main;
              callbacks.current.onSelection?.(from, to);
            }
          }),
          search({ top: true }),
          keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        ],
      }),
    });
    viewRef.current = view;
    callbacks.current.onView?.(view);
    return () => {
      callbacks.current.onView?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // Rebuilt once per note (epoch); later changes arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  // Keep the source identical to the prop (remote sync, toolbar edits).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const current = view.state.doc.toString();
    if (current === rawText) {
      return;
    }
    view.dispatch({
      changes: changedRange(current, rawText),
      // Not the user's edit: neither saved back nor undone from here.
      annotations: [External.of(true), Transaction.addToHistory.of(false)],
    });
  }, [rawText]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: languageSlot.current.reconfigure(language) });
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlySlot.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch(setDiagnostics(view.state, toDiagnostics(errors, view.state)));
    }
  }, [errors, rawText]);

  return <div className="source-container" ref={containerRef} />;
}

export default SourcePane;
