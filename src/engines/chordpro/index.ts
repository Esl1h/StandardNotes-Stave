import { type CheatsheetSection, type Engine, type ToolDef } from '../../core/engine';
import EXAMPLE from '../../../examples/chordpro.pro?raw';
import { chordProLanguage } from './language';
import { chordProTitle, emitChordPro, formatChordPro, isChordPro } from './syntax';

const TEMPLATE = `{title: Untitled}
{artist: }
{key: C}

{start_of_verse}
[C]Lyrics go here, with [F]chords in [G]brackets
{end_of_verse}

{start_of_chorus}
[F]The chorus [G]line [C]
{end_of_chorus}
`;

const chord = (symbol: string): ToolDef => ({
  id: `chord-${symbol}`,
  label: `${symbol} chord`,
  glyph: symbol,
  group: 'Chords',
  cmd: { kind: 'chord', symbol },
});

const structure = (id: string, label: string, glyph: string): ToolDef => ({
  id,
  label,
  glyph,
  group: 'Structure',
  cmd: { kind: 'technique', id },
});

// The chords of the most common keys; any other is typed in brackets.
const TOOLS: ToolDef[] = [
  ...['C', 'G', 'D', 'A', 'E', 'F', 'Am', 'Em', 'Dm'].map(chord),
  structure('verse', 'Verse', 'Verse'),
  structure('chorus', 'Chorus', 'Chorus'),
  structure('bridge', 'Bridge', 'Bridge'),
  structure('comment', 'Comment', '{c}'),
  structure('tab', 'Tablature', 'Tab'),
  structure('capo', 'Capo', 'Capo'),
  {
    id: 'title',
    label: 'Title',
    glyph: 'Title',
    group: 'Song',
    cmd: { kind: 'header', key: 'title', value: 'Title' },
  },
  {
    id: 'key',
    label: 'Key',
    glyph: 'Key',
    group: 'Song',
    cmd: { kind: 'header', key: 'key', value: 'C' },
  },
];

const CHEATSHEET: CheatsheetSection[] = [
  {
    title: 'Song',
    rows: [
      { syntax: '{title: Song}', meaning: 'Title; also {t: Song}' },
      { syntax: '{subtitle: Live}', meaning: 'Subtitle; also {st: Live}' },
      { syntax: '{artist: Name}', meaning: 'Artist; also {composer: } and {lyricist: }' },
      { syntax: '{key: G}', meaning: 'Key, moved by transposition' },
      { syntax: '{capo: 2}', meaning: 'Capo fret' },
      { syntax: '{tempo: 120}', meaning: 'Tempo; also {time: 3/4}' },
    ],
  },
  {
    title: 'Lyrics and chords',
    rows: [
      { syntax: 'The [G]sun comes [C]up', meaning: 'Chords over the syllable that follows them' },
      { syntax: '[D/F#]', meaning: 'Chord with a bass note' },
      { syntax: '[G] [C] [D]', meaning: 'Chords with no lyrics, for an intro' },
      {
        syntax: '{comment: Slowly}',
        meaning: 'A comment in the sheet; {ci: } italic, {cb: } boxed',
      },
      { syntax: '# note', meaning: 'A note for the source only, not shown' },
    ],
  },
  {
    title: 'Sections',
    rows: [
      { syntax: '{start_of_chorus} {end_of_chorus}', meaning: 'Chorus; also {soc} and {eoc}' },
      {
        syntax: '{start_of_verse: Verse 1}',
        meaning: 'Verse with a label; {end_of_verse} closes it',
      },
      { syntax: '{start_of_bridge} {end_of_bridge}', meaning: 'Bridge; also {sob} and {eob}' },
      { syntax: '{start_of_tab} {end_of_tab}', meaning: 'Tablature, kept as written' },
      { syntax: '{chorus}', meaning: 'Repeat the chorus here' },
    ],
  },
];

export const chordProEngine: Engine = {
  id: 'chordpro',
  label: 'ChordPro',
  extension: 'pro',
  detect: isChordPro,
  title: chordProTitle,
  template: () => TEMPLATE,
  example: () => EXAMPLE,
  emit: emitChordPro,
  format: formatChordPro,
  async mount(el, opts) {
    const { mountChordPro } = await import('./renderer');
    return mountChordPro(el, opts);
  },
  tools: () => TOOLS,
  cheatsheet: () => CHEATSHEET,
  language: chordProLanguage,
};
