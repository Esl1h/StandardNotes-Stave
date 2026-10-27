import { type CheatsheetSection, type Engine, type ToolDef } from '../../core/engine';
import EXAMPLE from '../../../examples/alphatex.atex?raw';
import { alphaTexLanguage } from './language';
import { alphaTexTitle, emitAlphaTex, formatAlphaTex, isAlphaTex } from './syntax';

const TEMPLATE = `\\title "Untitled"
\\tempo 120
\\ts (4 4)
\\track "Guitar"
\\staff {score tabs}
0.6.4 2.6 3.6 2.6 | 0.5.4 2.5 3.5 2.5 | (0.6 2.5 2.4).2 r.2
`;

const note = (id: string, label: string, dur: 1 | 2 | 4 | 8 | 16, shortcut: string): ToolDef => ({
  id,
  label,
  icon: id as ToolDef['icon'],
  shortcut,
  group: 'Durations',
  cmd: { kind: 'note', pitch: '', dur },
});

const technique = (id: string, label: string, glyph: string): ToolDef => ({
  id,
  label,
  glyph,
  group: 'Techniques',
  cmd: { kind: 'technique', id },
});

const TOOLS: ToolDef[] = [
  note('whole', 'Whole note', 1, '1'),
  note('half', 'Half note', 2, '2'),
  note('quarter', 'Quarter note', 4, '3'),
  note('eighth', 'Eighth note', 8, '4'),
  note('sixteenth', '16th note', 16, '5'),
  {
    id: 'rest',
    label: 'Quarter rest',
    icon: 'rest',
    shortcut: '0',
    group: 'Durations',
    cmd: { kind: 'rest', dur: 4 },
  },
  { id: 'dot', label: 'Dot', icon: 'dot', shortcut: '.', group: 'Durations', cmd: { kind: 'dot' } },
  {
    id: 'sharp',
    label: 'Sharp (a fret up)',
    icon: 'sharp',
    group: 'Accidentals',
    cmd: { kind: 'accidental', value: 'sharp' },
  },
  {
    id: 'flat',
    label: 'Flat (a fret down)',
    icon: 'flat',
    group: 'Accidentals',
    cmd: { kind: 'accidental', value: 'flat' },
  },
  {
    id: 'natural',
    label: 'Natural',
    icon: 'natural',
    group: 'Accidentals',
    cmd: { kind: 'accidental', value: 'natural' },
  },
  { id: 'tie', label: 'Tie', icon: 'tie', group: 'Tie', cmd: { kind: 'tie' } },
  { id: 'bar', label: 'Bar line', icon: 'bar', shortcut: '|', group: 'Bars', cmd: { kind: 'bar' } },
  {
    id: 'double-bar',
    label: 'Double bar line',
    icon: 'doubleBar',
    group: 'Bars',
    cmd: { kind: 'doubleBar' },
  },
  {
    id: 'repeat-start',
    label: 'Start repeat',
    icon: 'repeatStart',
    group: 'Bars',
    cmd: { kind: 'repeatStart' },
  },
  {
    id: 'repeat-end',
    label: 'End repeat',
    icon: 'repeatEnd',
    group: 'Bars',
    cmd: { kind: 'repeatEnd' },
  },
  technique('bend', 'Bend a full tone', 'b'),
  technique('slide', 'Slide', 'sl'),
  technique('hammer', 'Hammer-on or pull-off', 'h'),
  technique('palmMute', 'Palm mute', 'pm'),
  technique('harmonic', 'Natural harmonic', 'nh'),
  technique('vibrato', 'Vibrato', '~'),
  technique('deadNote', 'Dead note', 'x'),
  {
    id: 'chord',
    label: 'Chord symbol',
    glyph: 'C7',
    group: 'Chords',
    cmd: { kind: 'chord', symbol: 'C' },
  },
];

const CHEATSHEET: CheatsheetSection[] = [
  {
    title: 'Metadata',
    rows: [
      { syntax: '\\title "Song"', meaning: 'Title; also \\artist, \\album, \\music' },
      { syntax: '\\tempo 120', meaning: 'Tempo in quarter notes per minute' },
      { syntax: '\\ts (3 4)', meaning: 'Time signature' },
      { syntax: '\\ks (G)', meaning: 'Key signature' },
      { syntax: '\\track "Bass"', meaning: 'Starts a track' },
      { syntax: '\\staff {score tabs}', meaning: 'Standard notation, tablature or both' },
      { syntax: '\\tuning (E4 B3 G3 D3 A2 E2)', meaning: 'String tuning, high to low' },
      {
        syntax: '\\tuning (G2 D2 A1 E1)',
        meaning: '4-string bass; (G2 D2 A1 E1 B0) for 5 strings',
      },
      { syntax: '\\instrument (electricbassfinger)', meaning: 'Sound for playback' },
    ],
  },
  {
    title: 'Notes',
    rows: [
      { syntax: '3.2.4', meaning: 'Fret 3 on string 2, a quarter note' },
      { syntax: '3.2 5.2', meaning: 'The duration carries on to the next notes' },
      { syntax: '(0.1 2.2 2.3).2', meaning: 'Chord' },
      { syntax: 'r.8', meaning: 'Eighth rest' },
      { syntax: '3.2.4{d}', meaning: 'Dotted' },
      { syntax: '3.2.8*4', meaning: 'Repeated four times' },
      { syntax: '3.2{t}', meaning: 'Tied to the note before' },
      { syntax: 'C4.4 D#4 Eb4', meaning: 'Pitch names, on a staff without tablature' },
    ],
  },
  {
    title: 'Bars and structure',
    rows: [
      { syntax: '|', meaning: 'Bar line' },
      { syntax: '\\ro', meaning: 'Repeat opens at this bar' },
      { syntax: '\\rc 2', meaning: 'Repeat closes at this bar, played twice' },
      { syntax: '\\db', meaning: 'Double bar line after this bar' },
      { syntax: '3.2.4{ch "Am"}', meaning: 'Chord symbol' },
      { syntax: '// text', meaning: 'Comment' },
    ],
  },
  {
    title: 'Techniques',
    rows: [
      { syntax: '7.3{b (0 4)}', meaning: 'Bend a full tone' },
      { syntax: '5.3{h} 7.3', meaning: 'Hammer-on (or pull-off) to the next note' },
      { syntax: '5.3{sl} 7.3', meaning: 'Slide to the next note' },
      { syntax: '0.6{pm}', meaning: 'Palm mute' },
      { syntax: '12.1{nh}', meaning: 'Natural harmonic' },
      { syntax: '5.2{v}', meaning: 'Vibrato' },
      { syntax: '0.6{x}', meaning: 'Dead note' },
    ],
  },
];

export const alphaTexEngine: Engine = {
  id: 'alphatex',
  label: 'alphaTex',
  extension: 'atex',
  detect: isAlphaTex,
  title: alphaTexTitle,
  template: () => TEMPLATE,
  example: () => EXAMPLE,
  emit: emitAlphaTex,
  format: formatAlphaTex,
  async mount(el, opts) {
    const { mountAlphaTex } = await import('./renderer');
    return mountAlphaTex(el, opts);
  },
  tools: () => TOOLS,
  cheatsheet: () => CHEATSHEET,
  language: alphaTexLanguage,
};
