import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { type Extension } from '@codemirror/state';

/** ABC tokens for highlighting: fields, comments, decorations, chords, bars, notes. */
const parser: StreamParser<{ inHeader: boolean }> = {
  name: 'abc',
  startState: () => ({ inHeader: false }),
  token(stream, state) {
    if (stream.sol()) {
      state.inHeader = false;
      if (stream.match(/^%%\S+/)) return 'meta';
      if (stream.match(/^[A-Za-z]:/)) {
        state.inHeader = true;
        return 'keyword';
      }
    }
    if (stream.match(/^%.*/)) return 'comment';
    if (state.inHeader) {
      stream.skipToEnd();
      return 'string';
    }
    if (stream.match(/^"[^"]*"?/)) return 'string';
    if (stream.match(/^![^!\s]*!?/) || stream.match(/^\+[^+\s]*\+?/)) return 'attributeName';
    if (stream.match(/^\[[A-Za-z]:[^\]]*\]?/)) return 'keyword';
    if (stream.match(/^(:*\|+:*|\[\||\|\]|::|\[\d)/)) return 'operator';
    if (stream.match(/^(\^{1,2}|_{1,2}|=)?[A-Ga-g][,']*/)) return 'variableName';
    if (stream.match(/^[zxZX]/)) return 'atom';
    if (stream.match(/^\d*\/*\d+|^\/+/)) return 'number';
    if (stream.match(/^[-()<>{}~.TuvHLMOPS]/)) return 'punctuation';
    stream.next();
    return null;
  },
};

const FIELDS: Array<[string, string]> = [
  ['X:', 'Reference number, starts a tune'],
  ['T:', 'Title'],
  ['C:', 'Composer'],
  ['M:', 'Meter, as in M:4/4 or M:6/8'],
  ['L:', 'Unit note length, as in L:1/8'],
  ['Q:', 'Tempo, as in Q:1/4=120'],
  ['K:', 'Key, the last header field, as in K:G or K:Am'],
  ['V:', 'Voice'],
  ['W:', 'Words after the tune'],
  ['w:', 'Lyrics under the line above'],
  ['%%MIDI program ', 'Instrument for playback (General MIDI number)'],
];

/** Header fields offered at the start of a line. */
export function completeFields(context: CompletionContext) {
  // A field is one letter and a colon; more letters are notes.
  const word = context.matchBefore(/^(%%[A-Za-z]*|[A-Za-z]?:?)$/m);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: FIELDS.map(([label, detail]) => ({ label, detail, type: 'keyword' })),
    validFor: /^(%%[A-Za-z]*|[A-Za-z]?:?)$/,
  };
}

export const abcLanguage = (): Extension => [
  StreamLanguage.define(parser),
  autocompletion({ override: [completeFields] }),
];
