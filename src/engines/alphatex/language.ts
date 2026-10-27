import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { type Extension } from '@codemirror/state';

/** alphaTex tokens for highlighting: tags, strings, comments, effects, bars, notes. */
const parser: StreamParser<{ inComment: boolean }> = {
  name: 'alphatex',
  startState: () => ({ inComment: false }),
  token(stream, state) {
    if (state.inComment) {
      if (stream.match(/^.*?\*\//)) state.inComment = false;
      else stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      state.inComment = true;
      return 'comment';
    }
    if (stream.match(/^\/\/.*/)) return 'comment';
    if (stream.match(/^\\[A-Za-z]+/)) return 'keyword';
    if (stream.match(/^"[^"]*"?/)) return 'string';
    if (stream.match(/^\{[^}]*\}?/)) return 'attributeName';
    if (stream.match(/^\|/)) return 'operator';
    if (stream.match(/^[A-Ga-g](#{1,2}|b{1,2}|n)?-?\d/)) return 'variableName';
    if (stream.match(/^r\b/)) return 'atom';
    if (stream.match(/^\d+/)) return 'number';
    if (stream.match(/^[-.:*()x]/)) return 'punctuation';
    stream.next();
    return null;
  },
};

const TAGS: Array<[string, string]> = [
  ['\\title', 'Title, as in \\title "Song"'],
  ['\\subtitle', 'Subtitle'],
  ['\\artist', 'Artist'],
  ['\\album', 'Album'],
  ['\\music', 'Composer'],
  ['\\words', 'Lyricist'],
  ['\\copyright', 'Copyright'],
  ['\\tempo', 'Tempo in quarter notes per minute, as in \\tempo 120'],
  ['\\ts', 'Time signature, as in \\ts (3 4)'],
  ['\\ks', 'Key signature, as in \\ks (G) or \\ks (Am)'],
  ['\\clef', 'Clef, as in \\clef (F4)'],
  ['\\track', 'Starts a track, as in \\track "Bass"'],
  ['\\staff', 'Staff of the track: {score}, {tabs} or {score tabs}'],
  ['\\tuning', 'String tuning, as in \\tuning (E4 B3 G3 D3 A2 E2)'],
  ['\\instrument', 'Instrument for playback, as in \\instrument (acousticbass)'],
  ['\\capo', 'Capo fret'],
  ['\\voice', 'Starts another voice in the staff'],
  ['\\ro', 'Opens a repeat at this bar'],
  ['\\rc', 'Closes a repeat at this bar, as in \\rc 2'],
  ['\\db', 'Double bar line at the end of this bar'],
];

/** Metadata tags offered after a backslash. */
export function completeTags(context: CompletionContext) {
  const word = context.matchBefore(/\\[A-Za-z]*/);
  if (!word) return null;
  return {
    from: word.from,
    options: TAGS.map(([label, detail]) => ({ label, detail, type: 'keyword' })),
    validFor: /^\\[A-Za-z]*$/,
  };
}

export const alphaTexLanguage = (): Extension => [
  StreamLanguage.define(parser),
  autocompletion({ override: [completeTags] }),
];
