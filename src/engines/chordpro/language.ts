import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { type Extension } from '@codemirror/state';

/** ChordPro tokens for highlighting: directives and their values, chords, comments. */
const parser: StreamParser<{ inDirective: boolean }> = {
  name: 'chordpro',
  startState: () => ({ inDirective: false }),
  token(stream, state) {
    if (stream.sol()) state.inDirective = false;
    if (stream.sol() && stream.match(/^\s*#.*/)) return 'comment';
    if (state.inDirective) {
      if (stream.match(/^[^}]+/)) return 'string';
      stream.next();
      state.inDirective = false;
      return 'keyword';
    }
    if (stream.match(/^\{\s*[A-Za-z_]+\s*:?/)) {
      state.inDirective = true;
      return 'keyword';
    }
    if (stream.match(/^\[[^\]]*\]?/)) return 'attributeName';
    if (stream.match(/^[^[{]+/)) return null;
    stream.next();
    return null;
  },
};

const DIRECTIVES: Array<[string, string]> = [
  ['{title: }', 'Title'],
  ['{subtitle: }', 'Subtitle'],
  ['{artist: }', 'Artist'],
  ['{composer: }', 'Composer'],
  ['{key: }', 'Key, moved by transposition'],
  ['{capo: }', 'Capo fret'],
  ['{tempo: }', 'Tempo in beats per minute'],
  ['{time: }', 'Time signature, as in 4/4'],
  ['{comment: }', 'A comment shown in the sheet'],
  ['{start_of_chorus}', 'Starts a chorus, {soc}'],
  ['{end_of_chorus}', 'Ends a chorus, {eoc}'],
  ['{start_of_verse: }', 'Starts a verse, with an optional label'],
  ['{end_of_verse}', 'Ends a verse'],
  ['{start_of_bridge}', 'Starts a bridge'],
  ['{end_of_bridge}', 'Ends a bridge'],
  ['{start_of_tab}', 'Starts tablature, kept as written'],
  ['{end_of_tab}', 'Ends tablature'],
  ['{chorus}', 'Repeats the chorus'],
];

/** Directives offered after a brace at the start of a line. */
export function completeDirectives(context: CompletionContext) {
  const word = context.matchBefore(/^\s*\{[A-Za-z_]*$/m);
  if (!word) return null;
  const from = word.from + word.text.indexOf('{');
  return {
    from,
    options: DIRECTIVES.map(([label, detail]) => ({ label, detail, type: 'keyword' })),
    validFor: /^\{[A-Za-z_]*$/,
  };
}

export const chordProLanguage = (): Extension => [
  StreamLanguage.define(parser),
  autocompletion({ override: [completeDirectives] }),
];
