import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { ensureSyntaxTree } from '@codemirror/language';
import { alphaTexLanguage, completeTags } from './language';

const SRC =
  '\\title "Air"\n/* block\ncomment */\n\\staff {score tabs}\n3.3{h}.4{d} (0.1 2.2).8 r | C4.4 // end\n';

test('tokenizes a score without falling over', () => {
  const state = EditorState.create({ doc: SRC, extensions: alphaTexLanguage() });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  expect(tree?.length).toBe(state.doc.length);
});

test('offers metadata tags after a backslash', () => {
  const at = (doc: string) =>
    completeTags(new CompletionContext(EditorState.create({ doc }), doc.length, false));

  expect(at('\\ti')?.options.map((option) => option.label)).toContain('\\title');
  expect(at('3.3.4 \\')?.options.length).toBeGreaterThan(10);
  expect(at('3.3.4')).toBeNull();
});
