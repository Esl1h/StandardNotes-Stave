import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { ensureSyntaxTree } from '@codemirror/language';
import { abcLanguage, completeFields } from './language';

const SRC = 'X:1\nT:Air\n%%MIDI program 1\nK:G\n"G" !trill!^f2 z | [K:D] d % end\n';

test('tokenizes a tune without falling over', () => {
  const state = EditorState.create({ doc: SRC, extensions: abcLanguage() });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  expect(tree?.length).toBe(state.doc.length);
});

test('offers header fields at the start of a line', () => {
  const at = (doc: string, explicit = false) =>
    completeFields(new CompletionContext(EditorState.create({ doc }), doc.length, explicit));

  expect(at('X:1\nT')?.options.map((option) => option.label)).toContain('T:');
  expect(at('X:1\n%%M')?.options.map((option) => option.label)).toContain('%%MIDI program ');
  expect(at('X:1\n')).toBeNull();
  expect(at('X:1\n', true)?.options.length).toBeGreaterThan(5);
  expect(at('X:1\nK:C\nCDE')).toBeNull();
});
