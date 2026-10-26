import { type CheatsheetSection, type Engine, type ToolDef } from '../../core/engine';
import { abcLanguage } from './language';
import { abcTitle, emitAbc, isAbc } from './syntax';

const TEMPLATE = `X:1
T:Untitled
C:
M:4/4
L:1/8
Q:1/4=120
K:C
CDEF GABc | c2 B2 A2 G2 | FGAB c4 |]
`;

const TOOLS: ToolDef[] = [
  {
    id: 'whole',
    label: 'Whole note',
    icon: 'whole',
    shortcut: '1',
    group: 'Durations',
    cmd: { kind: 'note', pitch: '', dur: 1 },
  },
  {
    id: 'half',
    label: 'Half note',
    icon: 'half',
    shortcut: '2',
    group: 'Durations',
    cmd: { kind: 'note', pitch: '', dur: 2 },
  },
  {
    id: 'quarter',
    label: 'Quarter note',
    icon: 'quarter',
    shortcut: '3',
    group: 'Durations',
    cmd: { kind: 'note', pitch: '', dur: 4 },
  },
  {
    id: 'eighth',
    label: 'Eighth note',
    icon: 'eighth',
    shortcut: '4',
    group: 'Durations',
    cmd: { kind: 'note', pitch: '', dur: 8 },
  },
  {
    id: 'sixteenth',
    label: '16th note',
    icon: 'sixteenth',
    shortcut: '5',
    group: 'Durations',
    cmd: { kind: 'note', pitch: '', dur: 16 },
  },
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
    label: 'Sharp',
    icon: 'sharp',
    group: 'Accidentals',
    cmd: { kind: 'accidental', value: 'sharp' },
  },
  {
    id: 'flat',
    label: 'Flat',
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
  {
    id: 'staccato',
    label: 'Staccato',
    glyph: '•',
    group: 'Ornaments',
    cmd: { kind: 'technique', id: 'staccato' },
  },
  {
    id: 'accent',
    label: 'Accent',
    glyph: '>',
    group: 'Ornaments',
    cmd: { kind: 'technique', id: 'accent' },
  },
  {
    id: 'trill',
    label: 'Trill',
    glyph: 'tr',
    group: 'Ornaments',
    cmd: { kind: 'technique', id: 'trill' },
  },
  {
    id: 'roll',
    label: 'Roll',
    glyph: '~',
    group: 'Ornaments',
    cmd: { kind: 'technique', id: 'roll' },
  },
  {
    id: 'fermata',
    label: 'Fermata',
    glyph: '⌒',
    group: 'Ornaments',
    cmd: { kind: 'technique', id: 'fermata' },
  },
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
    title: 'Header',
    rows: [
      { syntax: 'X:1', meaning: 'Starts a tune (first line)' },
      { syntax: 'T:Title', meaning: 'Title' },
      { syntax: 'C:Composer', meaning: 'Composer' },
      { syntax: 'M:6/8', meaning: 'Meter; M:C is common time' },
      { syntax: 'L:1/8', meaning: 'Unit note length' },
      { syntax: 'Q:1/4=120', meaning: 'Tempo' },
      { syntax: 'K:Am', meaning: 'Key, the last header line; K:G clef=bass' },
    ],
  },
  {
    title: 'Notes',
    rows: [
      { syntax: 'C D E', meaning: 'Middle C, D, E' },
      { syntax: "c c' C,", meaning: 'An octave up, two up, one down' },
      { syntax: '^F _B =C', meaning: 'Sharp, flat, natural' },
      { syntax: 'C2 C/2 C3/2', meaning: 'Twice, half and one and a half unit lengths' },
      { syntax: 'z2', meaning: 'Rest of two units' },
      { syntax: 'CDEF', meaning: 'Beamed together; a space breaks the beam' },
      { syntax: '[CEG]', meaning: 'Chord' },
      { syntax: 'C2-C2', meaning: 'Tie' },
      { syntax: '(3CDE', meaning: 'Triplet' },
    ],
  },
  {
    title: 'Bars and structure',
    rows: [
      { syntax: '| || |]', meaning: 'Bar line, double bar, final bar' },
      { syntax: '|: :|', meaning: 'Repeat' },
      { syntax: '[1 [2', meaning: 'First and second endings' },
      { syntax: '"Am"', meaning: 'Chord symbol above the next note' },
      { syntax: 'w: la la', meaning: 'Lyrics under the line above' },
      { syntax: '% text', meaning: 'Comment' },
    ],
  },
  {
    title: 'Ornaments',
    rows: [
      { syntax: '.C', meaning: 'Staccato' },
      { syntax: '!accent!C', meaning: 'Accent' },
      { syntax: 'TC', meaning: 'Trill' },
      { syntax: '~C', meaning: 'Roll' },
      { syntax: '!fermata!C', meaning: 'Fermata' },
    ],
  },
];

export const abcEngine: Engine = {
  id: 'abc',
  label: 'ABC',
  extension: 'abc',
  detect: isAbc,
  title: abcTitle,
  template: () => TEMPLATE,
  emit: emitAbc,
  async mount(el, opts) {
    const { mountAbc } = await import('./renderer');
    return mountAbc(el, opts);
  },
  tools: () => TOOLS,
  cheatsheet: () => CHEATSHEET,
  language: abcLanguage,
};
