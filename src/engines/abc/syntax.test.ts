import abcjs from 'abcjs';
import fc from 'fast-check';
import { type Cmd, type Dur, type Edit } from '../../core/engine';
import {
  abcPitch,
  abcTitle,
  durationText,
  emitAbc,
  isAbc,
  lengthText,
  noteBefore,
  parseLength,
  unitLength,
} from './syntax';

const apply = (src: string, edit: Edit) =>
  src.slice(0, edit.from) + edit.insert + src.slice(edit.to);

/** Applies cmd at the end of src (or at `at`), returning the new text. */
const run = (src: string, cmd: Cmd, at = src.length) =>
  apply(src, emitAbc(cmd, { src, from: at, to: at }));

const HEADER = 'X:1\nT:Test\nM:4/4\nL:1/8\nK:C\n';

describe('lengths', () => {
  test('writes and reads ABC length suffixes', () => {
    expect(lengthText([1, 1])).toBe('');
    expect(lengthText([2, 1])).toBe('2');
    expect(lengthText([1, 2])).toBe('/');
    expect(lengthText([1, 4])).toBe('/4');
    expect(lengthText([3, 2])).toBe('3/2');
    expect(parseLength('')).toEqual([1, 1]);
    expect(parseLength('/')).toEqual([1, 2]);
    expect(parseLength('//')).toEqual([1, 4]);
    expect(parseLength('3/')).toEqual([3, 2]);
    expect(parseLength('6/4')).toEqual([3, 2]);
  });

  test('round trips any length', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 64 }), fc.integer({ min: 1, max: 64 }), (p, q) => {
        const text = lengthText([p, q]);
        const [a, b] = parseLength(text);
        expect(a / b).toBeCloseTo(p / q);
      })
    );
  });

  test('takes the unit length from L:, or from the meter', () => {
    expect(unitLength('X:1\nL:1/4\nK:C\n', 20)).toEqual([1, 4]);
    expect(unitLength('X:1\nM:2/4\nK:C\n', 20)).toEqual([1, 16]);
    expect(unitLength('X:1\nM:6/8\nK:C\n', 20)).toEqual([1, 8]);
    expect(unitLength('X:1\nM:C\nK:C\n', 20)).toEqual([1, 8]);
    expect(unitLength('X:1\nK:C\n', 10)).toEqual([1, 8]);
    // The L: in force at the cursor, not a later one.
    const src = 'X:1\nL:1/8\nK:C\nCD\nL:1/4\nEF';
    expect(unitLength(src, src.indexOf('CD'))).toEqual([1, 8]);
    expect(unitLength(src, src.length)).toEqual([1, 4]);
  });

  test('writes durations against the unit length', () => {
    expect(durationText(8, [1, 8])).toBe('');
    expect(durationText(4, [1, 8])).toBe('2');
    expect(durationText(1, [1, 8])).toBe('8');
    expect(durationText(16, [1, 8])).toBe('/');
    expect(durationText(4, [1, 8], true)).toBe('3');
    expect(durationText(4, [1, 4])).toBe('');
  });
});

describe('pitches', () => {
  test('writes scientific pitches as ABC', () => {
    expect(abcPitch('C4')).toBe('C');
    expect(abcPitch('C5')).toBe('c');
    expect(abcPitch('C6')).toBe("c'");
    expect(abcPitch('C3')).toBe('C,');
    expect(abcPitch('F#4')).toBe('^F');
    expect(abcPitch('Bb3')).toBe('_B,');
    expect(abcPitch('En5')).toBe('=e');
    expect(abcPitch('nonsense')).toBe('B');
  });
});

describe('the note before the cursor', () => {
  test('finds it across spaces only', () => {
    const src = `${HEADER}C D2 ^f'/ `;
    expect(noteBefore(src, src.length)).toMatchObject({
      accidental: '^',
      letter: 'f',
      octave: "'",
      length: '/',
    });
    expect(noteBefore(`${HEADER}C |`, `${HEADER}C |`.length)).toBeNull();
  });

  test('ignores headers, comments and chord symbols', () => {
    expect(noteBefore('X:1\nT:Abc', 9)).toBeNull();
    expect(noteBefore(`${HEADER}C % note`, `${HEADER}C % note`.length)).toBeNull();
    expect(noteBefore(`${HEADER}"Am"`, `${HEADER}"Am"`.length)).toBeNull();
  });
});

describe('commands', () => {
  test('inserts notes and rests in the unit length', () => {
    expect(run(HEADER, { kind: 'note', pitch: 'E4', dur: 4 })).toBe(`${HEADER}E2`);
    expect(run(HEADER, { kind: 'note', pitch: 'E4', dur: 8 })).toBe(`${HEADER}E`);
    expect(run(HEADER, { kind: 'rest', dur: 2 })).toBe(`${HEADER}z4`);
  });

  test("a note's own accidental replaces one typed ahead of it", () => {
    expect(run(`${HEADER}^`, { kind: 'note', pitch: 'Bb4', dur: 8 })).toBe(`${HEADER}_B`);
    expect(run(`${HEADER}^`, { kind: 'note', pitch: 'B4', dur: 8 })).toBe(`${HEADER}^B`);
  });

  test('repeats the pitch of the note before when none is given', () => {
    expect(run(`${HEADER}^f'2 `, { kind: 'note', pitch: '', dur: 8 })).toBe(`${HEADER}^f'2 f'`);
    expect(run(HEADER, { kind: 'note', pitch: '', dur: 8 })).toBe(`${HEADER}B`);
  });

  test('dots the note before the cursor', () => {
    expect(run(`${HEADER}C2`, { kind: 'dot' })).toBe(`${HEADER}C3`);
    expect(run(`${HEADER}C`, { kind: 'dot' })).toBe(`${HEADER}C3/2`);
    expect(run(`${HEADER}C3`, { kind: 'dot' })).toBe(`${HEADER}C2`);
    expect(run(`${HEADER}C6`, { kind: 'dot' })).toBe(`${HEADER}C4`);
    expect(run(`${HEADER}|`, { kind: 'dot' })).toBe(`${HEADER}|`);
  });

  test('sets the accidental of the note before the cursor', () => {
    expect(run(`${HEADER}C2`, { kind: 'accidental', value: 'sharp' })).toBe(`${HEADER}^C2`);
    expect(run(`${HEADER}^C2`, { kind: 'accidental', value: 'natural' })).toBe(`${HEADER}=C2`);
    expect(run(`${HEADER}|`, { kind: 'accidental', value: 'flat' })).toBe(`${HEADER}|`);
  });

  test('puts bar lines and repeats between spaces', () => {
    expect(run(`${HEADER}CD`, { kind: 'bar' })).toBe(`${HEADER}CD |`);
    expect(run(`${HEADER}CD `, { kind: 'repeatEnd' })).toBe(`${HEADER}CD :|`);
    expect(run(`${HEADER}CD`, { kind: 'repeatStart' }, HEADER.length)).toBe(`${HEADER}|: CD`);
  });

  test('ties and chords', () => {
    expect(run(`${HEADER}C2`, { kind: 'tie' })).toBe(`${HEADER}C2-`);
    expect(run(`${HEADER}C2 `, { kind: 'tie' })).toBe(`${HEADER}C2- `);
    expect(run(`${HEADER}C2-`, { kind: 'tie' })).toBe(`${HEADER}C2-`);
    expect(run(`${HEADER}z2`, { kind: 'tie' })).toBe(`${HEADER}z2`);
    expect(run(HEADER, { kind: 'chord', symbol: 'Am"7' })).toBe(`${HEADER}"Am7"`);
  });

  test('decorates the note before the cursor', () => {
    expect(run(`${HEADER}C2`, { kind: 'technique', id: 'fermata' })).toBe(`${HEADER}!fermata!C2`);
    expect(run(`${HEADER}C2`, { kind: 'technique', id: 'unknown' })).toBe(`${HEADER}C2`);
  });

  test('sets header fields in place or where ABC expects them', () => {
    expect(run(HEADER, { kind: 'header', key: 'title', value: 'Air' })).toBe(
      HEADER.replace('T:Test', 'T:Air')
    );
    expect(run('X:1\nK:C\nCD', { kind: 'header', key: 'composer', value: 'Anon' })).toBe(
      'X:1\nC:Anon\nK:C\nCD'
    );
    expect(run('X:1\nK:C\nCD', { kind: 'header', key: 'tempo', value: '96' })).toBe(
      'X:1\nQ:1/4=96\nK:C\nCD'
    );
    expect(run('X:1\nK:G clef=bass\nCD', { kind: 'header', key: 'clef', value: 'treble' })).toBe(
      'X:1\nK:G clef=treble\nCD'
    );
  });
});

describe('detection and title', () => {
  test('detects ABC by its X: line', () => {
    expect(isAbc('X:1\nK:C')).toBe(true);
    expect(isAbc('\n\n  X: 2\nK:C')).toBe(true);
    expect(isAbc('T:No X\nK:C')).toBe(false);
    expect(isAbc('\\title "x"')).toBe(false);
  });

  test('reads the first title', () => {
    expect(abcTitle('X:1\nT: Air \nT:Second\nK:C')).toBe('Air');
    expect(abcTitle('X:1\nK:C')).toBeUndefined();
  });
});

describe('what the toolbar writes is valid ABC', () => {
  const durations = fc.constantFrom<Dur>(1, 2, 4, 8, 16, 32);
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
      { kind: 'technique', id: 'trill' },
      { kind: 'technique', id: 'fermata' },
      { kind: 'technique', id: 'staccato' },
      { kind: 'chord', symbol: 'G7' },
      { kind: 'header', key: 'title', value: 'Tune' },
      { kind: 'header', key: 'tempo', value: '90' },
      { kind: 'header', key: 'composer', value: 'Someone' }
    )
  );

  test('a sequence of commands parses without warnings', () => {
    fc.assert(
      fc.property(fc.array(commands, { maxLength: 30 }), (cmds) => {
        let src = HEADER;
        for (const cmd of cmds) src = run(src, cmd);
        const [tune] = abcjs.parseOnly(src);
        expect(tune.warnings ?? []).toEqual([]);
      }),
      { numRuns: 300 }
    );
  });
});
