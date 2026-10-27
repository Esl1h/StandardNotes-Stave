import fc from 'fast-check';
import { type Cmd, type Edit } from '../../core/engine';
import {
  chordProTitle,
  emitChordPro,
  formatChordPro,
  isChordPro,
  parseChordPro,
  transposeChord,
  transposeChordPro,
} from './syntax';

const apply = (src: string, edit: Edit) =>
  src.slice(0, edit.from) + edit.insert + src.slice(edit.to);

const run = (src: string, cmd: Cmd, from = src.length, to = from) =>
  apply(src, emitChordPro(cmd, { src, from, to }));

describe('parsing', () => {
  test('reads the song facts, sections, comments and chords over lyrics', () => {
    const src = [
      '{title: Morning}',
      '{artist: Someone}',
      '{key: G}',
      '# a note for the editor',
      '{start_of_verse: Verse 1}',
      'The [G]sun comes [C]up',
      '{end_of_verse}',
      '',
      '{c: Slowly}',
      '{soc}',
      '[D]',
      '{eoc}',
      '{chorus}',
    ].join('\n');
    const song = parseChordPro(src);

    expect(song.errors).toEqual([]);
    expect(song.meta).toEqual({ title: 'Morning', artist: 'Someone', key: 'G' });
    expect(song.items.map((item) => item.kind)).toEqual([
      'start',
      'lyrics',
      'end',
      'blank',
      'comment',
      'start',
      'lyrics',
      'end',
      'chorus',
    ]);
    const lyrics = song.items[1] as Extract<(typeof song.items)[number], { kind: 'lyrics' }>;
    expect(lyrics.segments.map(({ chord, text }) => [chord, text])).toEqual([
      [undefined, 'The '],
      ['G', 'sun comes '],
      ['C', 'up'],
    ]);
    // Each segment spans its chord in brackets and its text.
    const g = lyrics.segments[1];
    expect(src.slice(g.from, g.to)).toBe('[G]sun comes ');
    expect(src.slice(g.chordFrom, g.chordTo)).toBe('G');
  });

  test('keeps tab sections as written', () => {
    const song = parseChordPro('{sot}\ne|--[3]--|\n{c: not a comment}\n{eot}');
    expect(song.items.map((item) => item.kind)).toEqual(['start', 'raw', 'raw', 'end']);
    expect(song.errors).toEqual([]);
  });

  test('reports what is wrong with line and column', () => {
    const song = parseChordPro('{title: A}\nla [G la\n{bogus: x}\n{eov}\n{soc}\n{oops');
    expect(song.errors.map(({ message, line, column }) => [message, line, column])).toEqual([
      ['A chord is not closed with ]', 2, 4],
      ['Unknown directive {bogus}', 3, 2],
      ['{end_of_verse} closes no verse', 4, 1],
      ['A directive is not closed with }', 6, 1],
      ['The chorus is not closed', 5, 1],
    ]);
  });

  test('never throws, whatever the text', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom('[', ']', '{', '}', ':', '\n', 'a', 'G', ' ') }),
        (src) => {
          const song = parseChordPro(src);
          for (const error of song.errors) {
            expect(error.from).toBeGreaterThanOrEqual(0);
            expect(error.to).toBeLessThanOrEqual(src.length + 1);
          }
        }
      ),
      { numRuns: 500 }
    );
  });
});

describe('detection and title', () => {
  test.each([
    ['{title: Song}\n[G]la', true],
    ['{t:Song}', true],
    ['Some [Am]lyrics [G]here', true],
    ['{soc}\nla\n{eoc}', true],
    ['X:1\nK:C\n[CEG]', false],
    ['A note with a [link] in it', false],
    ['', false],
  ])('%j is ChordPro: %s', (src, expected) => {
    expect(isChordPro(src)).toBe(expected);
  });

  test('takes the title from {title} or {t}', () => {
    expect(chordProTitle('{artist: x}\n{title:  Morning }')).toBe('Morning');
    expect(chordProTitle('{t: Short}')).toBe('Short');
    expect(chordProTitle('[G]la')).toBeUndefined();
  });
});

describe('transposition', () => {
  test('moves roots and basses, sharps up and flats down', () => {
    expect(transposeChord('G', 2)).toBe('A');
    expect(transposeChord('Am7', 3)).toBe('Cm7');
    expect(transposeChord('D/F#', -1)).toBe('Db/F');
    expect(transposeChord('Bbmaj7', 1)).toBe('Bmaj7');
    expect(transposeChord('N.C.', 2)).toBe('N.C.');
  });

  test('moves the chords and the key, and leaves the rest as written', () => {
    const src = '{title: In G}\n{key: G}\n# [G] stays\n[G]Sun [D/F#]up\n{c: [G] stays}';
    expect(transposeChordPro(src, 2)).toBe(
      '{title: In G}\n{key: A}\n# [G] stays\n[A]Sun [E/G#]up\n{c: [G] stays}'
    );
  });

  test('a round trip gives the same pitches', () => {
    const chord = fc.tuple(
      fc.constantFrom('C', 'C#', 'Db', 'D', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'),
      fc.constantFrom('', 'm', '7', 'maj7', 'sus4')
    );
    const midi = (name: string) =>
      ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[name[0] as 'C'] +
      (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0);
    fc.assert(
      fc.property(chord, fc.integer({ min: -11, max: 11 }), ([root, rest], semitones) => {
        const back = transposeChord(transposeChord(root + rest, semitones), -semitones);
        expect((midi(back) + 12) % 12).toBe((midi(root) + 12) % 12);
        expect(back.slice(back.length - rest.length)).toBe(rest);
      })
    );
  });
});

describe('writing', () => {
  test('inserts chords at the cursor', () => {
    expect(run('la ', { kind: 'chord', symbol: 'Am' })).toBe('la [Am]');
  });

  test('sets the title and the capo, replacing a value already there', () => {
    expect(run('[G]la', { kind: 'header', key: 'title', value: 'Song' }, 0)).toBe(
      '{title: Song}\n[G]la'
    );
    expect(run('{title: Old}\nla', { kind: 'header', key: 'title', value: 'New' })).toBe(
      '{title: New}\nla'
    );
    expect(run('la', { kind: 'technique', id: 'capo' })).toBe('{capo: 2}\nla');
  });

  test('wraps the selected lines in a chorus, or opens an empty one', () => {
    const src = 'one\ntwo\nthree';
    expect(run(src, { kind: 'technique', id: 'chorus' }, 5, 9)).toBe(
      'one\n{start_of_chorus}\ntwo\nthree\n{end_of_chorus}'
    );
    const empty = emitChordPro({ kind: 'technique', id: 'verse' }, { src: '', from: 0, to: 0 });
    expect(apply('', empty)).toBe('{start_of_verse}\n\n{end_of_verse}\n');
    expect(empty.cursor).toBe('{start_of_verse}\n'.length);
  });

  test('ignores commands about notes', () => {
    expect(run('la', { kind: 'note', pitch: '', dur: 4 })).toBe('la');
    expect(run('la', { kind: 'bar' })).toBe('la');
  });

  test('everything the toolbar writes parses without errors', () => {
    const cmd = fc.constantFrom<Cmd>(
      { kind: 'chord', symbol: 'G' },
      { kind: 'chord', symbol: 'D/F#' },
      { kind: 'technique', id: 'chorus' },
      { kind: 'technique', id: 'verse' },
      { kind: 'technique', id: 'bridge' },
      { kind: 'technique', id: 'comment' },
      { kind: 'technique', id: 'capo' },
      { kind: 'header', key: 'title', value: 'T' },
      { kind: 'header', key: 'key', value: 'G' }
    );
    fc.assert(
      fc.property(fc.array(cmd, { maxLength: 20 }), (cmds) => {
        let src = 'la la\n';
        for (const each of cmds) src = run(src, each) + 'la\n';
        expect(parseChordPro(src).errors).toEqual([]);
      }),
      { numRuns: 200 }
    );
  });

  test('formats as lines only', () => {
    expect(formatChordPro('{t: A}  \r\n\n\n[G]la  la\n')).toBe('{t: A}\n\n[G]la  la\n');
  });
});
