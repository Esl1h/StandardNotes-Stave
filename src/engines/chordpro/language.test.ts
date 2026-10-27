import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { ensureSyntaxTree } from '@codemirror/language';
import { chordProLanguage, completeDirectives } from './language';

const SRC = '{title: Song}\n# a note\n{soc}\nThe [G]sun [D/F#]up\n{eoc}\n[Am';

test('tokenizes a song without falling over', () => {
  const state = EditorState.create({ doc: SRC, extensions: chordProLanguage() });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  expect(tree?.length).toBe(state.doc.length);
});

test('offers directives after a brace at the start of a line', () => {
  const at = (doc: string) =>
    completeDirectives(new CompletionContext(EditorState.create({ doc }), doc.length, false));

  expect(at('{t')?.options.map((option) => option.label)).toContain('{title: }');
  expect(at('[G]la\n  {')?.from).toBe('[G]la\n  '.length);
  expect(at('la {')).toBeNull();
  expect(at('la')).toBeNull();
});
