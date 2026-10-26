import * as alphaTab from '@coderline/alphatab';
import fc from 'fast-check';
import { type Cmd, type Dur, type Edit } from '../../core/engine';
import {
  alphaTexTitle,
  barStart,
  beatBefore,
  emitAlphaTex,
  fretString,
  isAlphaTex,
  isPitchedStaff,
  midiOf,
  transposeAlphaTex,
} from './syntax';

const apply = (src: string, edit: Edit) =>
  src.slice(0, edit.from) + edit.insert + src.slice(edit.to);

/** Applies cmd at the end of src (or at `at`), returning the new text. */
const run = (src: string, cmd: Cmd, at = src.length) =>
  apply(src, emitAlphaTex(cmd, { src, from: at, to: at }));

const HEADER = '\\title "Test"\n\\tempo 120\n\\track "Guitar"\n\\staff {score tabs}\n';
const PITCHED = '\\title "Test"\n\\track "Flute"\n\\staff {score}\n';

/** Every diagnostic of alphaTab's own parser that is not a mere hint. */
function problems(src: string): string[] {
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.logErrors = false;
  importer.initFromString(src, new alphaTab.Settings());
  try {
    importer.readScore();
  } catch {
    // The diagnostics below say why.
  }
  return [
    ...importer.lexerDiagnostics.items,
    ...importer.parserDiagnostics.items,
    ...importer.semanticDiagnostics.items,
  ]
    .filter((diagnostic) => diagnostic.severity > 0)
    .map((diagnostic) => diagnostic.message);
}

describe('pitches', () => {
  test('reads scientific pitches', () => {
    expect(midiOf('C4')).toBe(60);
    expect(midiOf('F#5')).toBe(78);
    expect(midiOf('Bb3')).toBe(58);
    expect(midiOf('E2')).toBe(40);
    expect(midiOf('nonsense')).toBeNull();
  });

  test('places pitches on the guitar at the lowest fret', () => {
    expect(fretString(64)).toBe('0.1');
    expect(fretString(60)).toBe('1.2');
    expect(fretString(40)).toBe('0.6');
    expect(fretString(41)).toBe('1.6');
    // Out of range: moved by octaves.
    expect(fretString(28)).toBe('0.6');
    expect(fretString(100)).toBe('24.1');
  });
});

describe('the beat before the cursor', () => {
  test('reads notes, duration, effects and multiplier', () => {
    const src = `${HEADER}3.3.4 (0.1 2.2{h}).8{d ch "Am"}*2 `;
    expect(beatBefore(src, src.length)).toMatchObject({
      notes: '(0.1 2.2{h})',
      duration: '8',
      effects: 'd ch "Am"',
      multiplier: '*2',
    });
    expect(beatBefore(`${HEADER}r.2`, `${HEADER}r.2`.length)).toMatchObject({ notes: 'r' });
  });

  test('takes beat effects written apart from their notes', () => {
    const src = `${HEADER}3.3{pm} {d}`;
    expect(beatBefore(src, src.length)).toMatchObject({ notes: '3.3{pm}', effects: 'd' });
  });

  test('ignores bar lines, metadata and comments', () => {
    expect(beatBefore(`${HEADER}3.3 |`, `${HEADER}3.3 |`.length)).toBeNull();
    expect(beatBefore(HEADER, HEADER.length)).toBeNull();
    expect(beatBefore(`${HEADER}// 3.3`, `${HEADER}// 3.3`.length)).toBeNull();
  });

  test('knows whether the staff has tablature', () => {
    expect(isPitchedStaff(HEADER, HEADER.length)).toBe(false);
    expect(isPitchedStaff(PITCHED, PITCHED.length)).toBe(true);
    expect(isPitchedStaff('3.3.4', 5)).toBe(false);
    // A new track starts over.
    const both = `${PITCHED}C4.4\n\\track "Guitar"\n`;
    expect(isPitchedStaff(both, both.length)).toBe(false);
  });

  test('finds where the bar starts', () => {
    const src = `${HEADER}3.3.4 | 5.3 7.3`;
    expect(barStart(src, src.length)).toBe(src.indexOf('| ') + 1);
    expect(barStart(`${HEADER}3.3`, `${HEADER}3.3`.length)).toBe(HEADER.length);
    // A bar that opens with metadata is still a bar.
    const repeat = `${HEADER}\\ro 3.3.4\n5.3`;
    expect(barStart(repeat, repeat.length)).toBe(HEADER.length);
  });
});

describe('commands', () => {
  test('inserts notes and rests with their duration', () => {
    expect(run(HEADER, { kind: 'note', pitch: 'E4', dur: 4 })).toBe(`${HEADER}0.1.4`);
    expect(run(`${HEADER}3.3.4`, { kind: 'note', pitch: '', dur: 8 })).toBe(`${HEADER}3.3.4 3.3.8`);
    expect(run(HEADER, { kind: 'note', pitch: '', dur: 2, dotted: true })).toBe(
      `${HEADER}0.3.2{d}`
    );
    expect(run(HEADER, { kind: 'rest', dur: 2 })).toBe(`${HEADER}r.2`);
  });

  test('writes pitch names on a staff without tablature', () => {
    expect(run(PITCHED, { kind: 'note', pitch: 'F#4', dur: 4 })).toBe(`${PITCHED}F#4.4`);
    expect(run(PITCHED, { kind: 'note', pitch: '', dur: 4 })).toBe(`${PITCHED}B4.4`);
  });

  test('repeats the notes of the beat before, without their effects', () => {
    expect(run(`${HEADER}(0.1 2.2{h}).4 `, { kind: 'note', pitch: '', dur: 4 })).toBe(
      `${HEADER}(0.1 2.2{h}).4 (0.1 2.2).4`
    );
  });

  test('dots the beat before the cursor, and takes the dot off', () => {
    expect(run(`${HEADER}3.3.4`, { kind: 'dot' })).toBe(`${HEADER}3.3.4{d}`);
    expect(run(`${HEADER}3.3.4{d}`, { kind: 'dot' })).toBe(`${HEADER}3.3.4`);
    expect(run(`${HEADER}3.3`, { kind: 'dot' })).toBe(`${HEADER}3.3 {d}`);
    expect(run(`${HEADER}|`, { kind: 'dot' })).toBe(`${HEADER}|`);
  });

  test('moves frets by a semitone and sets pitch accidentals', () => {
    expect(run(`${HEADER}3.3{h}.4`, { kind: 'accidental', value: 'sharp' })).toBe(
      `${HEADER}4.3{h}.4`
    );
    expect(run(`${HEADER}0.3.4`, { kind: 'accidental', value: 'flat' })).toBe(`${HEADER}0.3.4`);
    expect(run(`${PITCHED}C4.4`, { kind: 'accidental', value: 'flat' })).toBe(`${PITCHED}Cb4.4`);
    expect(run(`${HEADER}r.4`, { kind: 'accidental', value: 'sharp' })).toBe(`${HEADER}r.4`);
  });

  test('ties into a copy of the beat before', () => {
    expect(run(`${HEADER}(0.1 2.2).2`, { kind: 'tie' })).toBe(
      `${HEADER}(0.1 2.2).2 (0.1{t} 2.2{t})`
    );
    expect(run(`${HEADER}r.2`, { kind: 'tie' })).toBe(`${HEADER}r.2`);
  });

  test('puts bar lines and repeats', () => {
    expect(run(`${HEADER}3.3.4`, { kind: 'bar' })).toBe(`${HEADER}3.3.4 |`);
    expect(run(`${HEADER}3.3.4 `, { kind: 'repeatStart' })).toBe(`${HEADER}3.3.4 | \\ro`);
    expect(run(`${HEADER}3.3.4 | `, { kind: 'repeatStart' })).toBe(`${HEADER}3.3.4 | \\ro`);
    expect(run(`${HEADER}3.3.4 | 5.3`, { kind: 'repeatEnd' })).toBe(
      `${HEADER}3.3.4 | \\rc 2 5.3 |`
    );
    expect(run(`${HEADER}3.3.4`, { kind: 'doubleBar' })).toBe(`${HEADER}\\db 3.3.4 |`);
    expect(run(`${HEADER}\\db 3.3.4`, { kind: 'doubleBar' })).toBe(`${HEADER}\\db 3.3.4 |`);
  });

  test('chord symbols and techniques on the beat before', () => {
    expect(run(`${HEADER}3.3.4`, { kind: 'chord', symbol: 'Am"7' })).toBe(
      `${HEADER}3.3.4{ch "Am7"}`
    );
    expect(run(`${HEADER}3.3.4{ch "C"}`, { kind: 'chord', symbol: 'G' })).toBe(
      `${HEADER}3.3.4{ch "G"}`
    );
    expect(run(`${HEADER}3.3.4`, { kind: 'technique', id: 'bend' })).toBe(
      `${HEADER}3.3{b (0 4)}.4`
    );
    expect(run(`${HEADER}3.3{b (0 4)}.4`, { kind: 'technique', id: 'bend' })).toBe(
      `${HEADER}3.3.4`
    );
    expect(run(`${HEADER}3.3.4`, { kind: 'technique', id: 'unknown' })).toBe(`${HEADER}3.3.4`);
  });

  test('sets headers in place or after the score metadata', () => {
    expect(run(HEADER, { kind: 'header', key: 'title', value: 'Air' })).toBe(
      HEADER.replace('"Test"', '"Air"')
    );
    expect(run(HEADER, { kind: 'header', key: 'composer', value: 'Anon' })).toBe(
      HEADER.replace('\\tempo', '\\music "Anon"\n\\tempo')
    );
    expect(run(HEADER, { kind: 'header', key: 'tempo', value: '96' })).toBe(
      HEADER.replace('120', '96')
    );
    expect(run('3.3.4', { kind: 'header', key: 'meter', value: '3/4' })).toBe('\\ts (3 4)\n3.3.4');
  });
});

describe('detection and title', () => {
  test('detects alphaTex by its metadata lines', () => {
    expect(isAlphaTex(HEADER)).toBe(true);
    expect(isAlphaTex('  \\tempo 90\n3.3.4')).toBe(true);
    expect(isAlphaTex('X:1\nK:C')).toBe(false);
    expect(isAlphaTex('plain text')).toBe(false);
  });

  test('reads the title', () => {
    expect(alphaTexTitle(HEADER)).toBe('Test');
    expect(alphaTexTitle('\\title ("Paren")')).toBe('Paren');
    expect(alphaTexTitle('3.3.4')).toBeUndefined();
  });
});

describe('what the toolbar writes is valid alphaTex', () => {
  const durations = fc.constantFrom<Dur>(1, 2, 4, 8, 16, 32, 64);
  const pitches = fc
    .tuple(
      fc.constantFrom(...'CDEFGAB'),
      fc.constantFrom('', '#', 'b'),
      fc.integer({ min: 2, max: 6 })
    )
    .map(([letter, accidental, octave]) => `${letter}${accidental}${octave}`);
  const commands: fc.Arbitrary<Cmd> = fc.oneof(
    fc.record({
      kind: fc.constant('note' as const),
      pitch: pitches,
      dur: durations,
      dotted: fc.boolean(),
    }),
    fc.record({ kind: fc.constant('note' as const), pitch: fc.constant(''), dur: durations }),
    fc.record({ kind: fc.constant('rest' as const), dur: durations }),
    fc.constantFrom<Cmd>(
      { kind: 'dot' },
      { kind: 'tie' },
      { kind: 'bar' },
      { kind: 'doubleBar' },
      { kind: 'repeatStart' },
      { kind: 'repeatEnd' },
      { kind: 'accidental', value: 'sharp' },
      { kind: 'accidental', value: 'flat' },
      { kind: 'accidental', value: 'natural' },
      { kind: 'technique', id: 'bend' },
      { kind: 'technique', id: 'hammer' },
      { kind: 'technique', id: 'palmMute' },
      { kind: 'technique', id: 'harmonic' },
      { kind: 'technique', id: 'slide' },
      { kind: 'chord', symbol: 'G7' },
      { kind: 'header', key: 'title', value: 'Tune' },
      { kind: 'header', key: 'tempo', value: '90' },
      { kind: 'header', key: 'composer', value: 'Someone' }
    )
  );

  test.each([
    ['a staff with tablature', HEADER],
    ['a staff without tablature', PITCHED],
  ])('on %s, a sequence of commands parses without warnings', (_, header) => {
    fc.assert(
      fc.property(fc.array(commands, { maxLength: 30 }), (cmds) => {
        // A note to start from, as a template has.
        let src = `${header}${header === PITCHED ? 'C4.4' : '0.3.4'}`;
        for (const cmd of cmds) src = run(src, cmd);
        expect(problems(src)).toEqual([]);
      }),
      { numRuns: 200 }
    );
  });
});

describe('transposition', () => {
  test('moves frets, pitches, the key and chord symbols', () => {
    expect(transposeAlphaTex('3.3.4 (0.1 2.2).8{ch "Am"}', 2)).toBe('5.3.4 (2.1 4.2).8{ch "Bm"}');
    expect(transposeAlphaTex('\\ks (G)\n\\staff {score}\nC4.4 Bb3', -1)).toBe(
      '\\ks (Gb)\n\\staff {score}\nB3.4 A3'
    );
    expect(transposeAlphaTex('\\ks G\nC4', 1)).toBe('\\ks G#\nC#4');
  });

  test('leaves titles, comments, tunings and tempo alone', () => {
    const src =
      '\\title "C4 Blues"\n\\tuning (E4 B3 G3 D3 A2 E2)\n\\tempo 120\n// 3.3 stays\n3.3.4';
    expect(transposeAlphaTex(src, 3)).toBe(src.replace(/3\.3\.4$/, '6.3.4'));
  });

  test('moves a fret off the neck to another string', () => {
    // Open D string down a tone: C on the A string.
    expect(transposeAlphaTex('0.4.4', -2)).toBe('3.5.4');
    expect(transposeAlphaTex('3.3.4', 0)).toBe('3.3.4');
  });

  test('up and down again gives the notes back', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 5, max: 12 }), fc.integer({ min: 1, max: 6 }))),
        fc.integer({ min: 1, max: 5 }),
        (notes, semitones) => {
          const src = notes.map(([fret, string]) => `${fret}.${string}.4`).join(' ');
          expect(transposeAlphaTex(transposeAlphaTex(src, semitones), -semitones)).toBe(src);
        }
      )
    );
  });
});
