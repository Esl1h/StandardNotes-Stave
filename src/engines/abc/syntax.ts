import { type Cmd, type CursorCtx, type Dur, type Edit, type HeaderKey } from '../../core/engine';
import { mapOutside, singleSpaces, tidyLines } from '../../core/format';

/**
 * ABC 2.1 text for toolbar commands. Pure string work, no abcjs: this
 * module is part of the initial load, the renderer is not.
 */

type Fraction = [number, number];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const reduce = ([p, q]: Fraction): Fraction => {
  const d = gcd(p, q);
  return [p / d, q / d];
};
const times = (a: Fraction, b: Fraction): Fraction => reduce([a[0] * b[0], a[1] * b[1]]);

/** A length multiplier as ABC writes it: "", "2", "/", "/4", "3/2". */
export function lengthText([p, q]: Fraction): string {
  if (q === 1) return p === 1 ? '' : String(p);
  if (p === 1) return q === 2 ? '/' : `/${q}`;
  return `${p}/${q}`;
}

const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;

/** A plain length times 3/2: 3, 3/2, 3/4, 6... */
const isDotted = ([p, q]: Fraction) => {
  const [a, b] = reduce([p * 2, q * 3]);
  return p % 3 === 0 && isPowerOfTwo(a) && isPowerOfTwo(b);
};

/** The multiplier an ABC length suffix stands for ("" is 1, "/" is 1/2). */
export function parseLength(text: string): Fraction {
  if (text === '') return [1, 1];
  const match = /^(\d*)(\/*)(\d*)$/.exec(text);
  if (!match) return [1, 1];
  const [, num, slashes, den] = match;
  const p = num ? Number(num) : 1;
  if (!slashes) return [p, 1];
  const q = den ? Number(den) : 2 ** slashes.length;
  return reduce([p, q]);
}

const fieldValue = (src: string, field: string, before = src.length): string | undefined => {
  const pattern = new RegExp(`^${field}:[ \\t]*(.*)$`, 'gm');
  let value: string | undefined;
  for (const match of src.matchAll(pattern)) {
    if ((match.index ?? 0) >= before) break;
    value = match[1].trim();
  }
  return value;
};

/**
 * The unit note length in force at `pos`: the last L: field, or the ABC
 * 2.1 default from the meter (1/16 below 3/4, otherwise 1/8).
 */
export function unitLength(src: string, pos: number): Fraction {
  const length = fieldValue(src, 'L', pos);
  const match = length && /^(\d+)\/(\d+)/.exec(length);
  if (match) return reduce([Number(match[1]), Number(match[2])]);
  const meter = fieldValue(src, 'M', pos);
  if (!meter || /^(C\|?|none)$/i.test(meter)) return [1, 8];
  const fraction = /^(\d+)\/(\d+)/.exec(meter);
  if (fraction && Number(fraction[1]) / Number(fraction[2]) < 0.75) return [1, 16];
  return [1, 8];
}

/** The length suffix of a note of duration 1/dur, dotted or not. */
export function durationText(dur: Dur, unit: Fraction, dotted = false): string {
  const multiplier = times([1, dur], [unit[1], unit[0]]);
  return lengthText(dotted ? times(multiplier, [3, 2]) : multiplier);
}

/**
 * Scientific pitch ("C4", "F#5", "Bb3") as ABC: octave 4 is uppercase,
 * 5 lowercase, and each octave further adds ' or ,.
 */
export function abcPitch(pitch: string): string {
  const match = /^([A-Ga-g])(#{1,2}|b{1,2}|n)?(-?\d)$/.exec(pitch);
  if (!match) return 'B';
  const [, letter, accidental = '', octaveText] = match;
  const octave = Number(octaveText);
  const prefix =
    { '#': '^', '##': '^^', b: '_', bb: '__', n: '=' }[
      accidental as '#' | '##' | 'b' | 'bb' | 'n'
    ] ?? '';
  const base = octave >= 5 ? letter.toLowerCase() : letter.toUpperCase();
  const marks = octave >= 5 ? "'".repeat(octave - 5) : ','.repeat(4 - octave);
  return `${prefix}${base}${marks}`;
}

// A note or rest: decorations, accidental, letter, octave marks, length, tie.
const NOTE =
  /((?:![^!\n]*!|\+[^+\n]*\+|[.~HLMOPSTuv])*)(\^{1,2}|_{1,2}|=)?([A-Ga-gzx])([,']*)(\d*\/*\d*)(-?)/g;

interface NoteToken {
  from: number;
  to: number;
  decorations: string;
  accidental: string;
  letter: string;
  octave: string;
  length: string;
  tie: string;
}

/**
 * The note or rest that ends right before `pos`, allowing only spaces in
 * between, outside comments, chord symbols and header lines.
 */
export function noteBefore(src: string, pos: number): NoteToken | null {
  const lineStart = src.lastIndexOf('\n', pos - 1) + 1;
  const line = src.slice(lineStart, pos);
  if (/^[A-Za-z]:/.test(line) || line.includes('%')) return null;
  // Chord symbols and annotations are text, not notes.
  const music = line.replace(/"[^"]*"/g, (quoted) => ' '.repeat(quoted.length));
  let last: NoteToken | null = null;
  for (const match of music.matchAll(NOTE)) {
    const from = lineStart + (match.index ?? 0);
    last = {
      from,
      to: from + match[0].length,
      decorations: match[1],
      accidental: match[2] ?? '',
      letter: match[3],
      octave: match[4],
      length: match[5],
      tie: match[6],
    };
  }
  if (!last || src.slice(last.to, pos).trim() !== '') return null;
  return last;
}

const noteText = (note: NoteToken) =>
  `${note.decorations}${note.accidental}${note.letter}${note.octave}${note.length}${note.tie}`;

const insertAt = (ctx: CursorCtx, insert: string): Edit => ({ from: ctx.from, to: ctx.to, insert });

/** Inserts with a space before it unless the cursor already follows one. */
const spaced = (ctx: CursorCtx, text: string): Edit => {
  const previous = ctx.src[ctx.from - 1];
  const before = ctx.from === 0 || previous === undefined || /\s/.test(previous) ? '' : ' ';
  const next = ctx.src[ctx.to];
  const after = next === undefined || /\s/.test(next) ? '' : ' ';
  return insertAt(ctx, `${before}${text}${after}`);
};

const HEADER_FIELDS: Record<HeaderKey, string> = {
  title: 'T',
  composer: 'C',
  meter: 'M',
  key: 'K',
  tempo: 'Q',
  clef: 'K',
};

/** Sets a header field: replaces its line, or adds one before K: (or after X:). */
function headerEdit(src: string, key: HeaderKey, value: string): Edit {
  const field = HEADER_FIELDS[key];
  const text = key === 'tempo' && /^\d+$/.test(value) ? `1/4=${value}` : value;
  if (key === 'clef') {
    const keyLine = /^K:[^\n%]*/m.exec(src);
    if (keyLine) {
      const from = keyLine.index ?? 0;
      const line = keyLine[0].replace(/\s+clef=\S+/, '').trimEnd();
      return { from, to: from + keyLine[0].length, insert: `${line} clef=${value}` };
    }
    return {
      from: src.length,
      to: src.length,
      insert: `${src && !src.endsWith('\n') ? '\n' : ''}K:C clef=${value}\n`,
    };
  }
  const existing = new RegExp(`^${field}:[^\\n]*`, 'm').exec(src);
  if (existing) {
    const from = existing.index ?? 0;
    return { from, to: from + existing[0].length, insert: `${field}:${text}` };
  }
  const line = `${field}:${text}\n`;
  // T: and C: read best right after X:; the others must come before K:.
  const anchor = field === 'T' || field === 'C' ? /^X:[^\n]*\n/m.exec(src) : null;
  if (anchor) {
    const at = (anchor.index ?? 0) + anchor[0].length;
    return { from: at, to: at, insert: line };
  }
  const keyLine = /^K:/m.exec(src);
  const at = keyLine ? keyLine.index : 0;
  return { from: at, to: at, insert: line };
}

const DECORATIONS: Record<string, string> = {
  trill: 'T',
  staccato: '.',
  accent: '!accent!',
  fermata: '!fermata!',
  roll: '~',
  mordent: '!mordent!',
  upbow: 'u',
  downbow: 'v',
};

/** The ABC edit for a toolbar command at the cursor. */
export function emitAbc(cmd: Cmd, ctx: CursorCtx): Edit {
  const unit = unitLength(ctx.src, ctx.from);
  const previous = noteBefore(ctx.src, ctx.from);
  switch (cmd.kind) {
    case 'note': {
      const pitch = cmd.pitch
        ? abcPitch(cmd.pitch)
        : previous && previous.letter !== 'z' && previous.letter !== 'x'
          ? `${previous.letter}${previous.octave}`
          : 'B';
      const edit = insertAt(ctx, `${pitch}${durationText(cmd.dur, unit, cmd.dotted)}`);
      // An accidental typed ahead of the note gives way to the note's own.
      const pending = /(\^{1,2}|_{1,2}|=)$/.exec(ctx.src.slice(0, ctx.from));
      return pending && /^[\^_=]/.test(pitch)
        ? { ...edit, from: ctx.from - pending[0].length }
        : edit;
    }
    case 'rest':
      return insertAt(ctx, `z${durationText(cmd.dur, unit, cmd.dotted)}`);
    case 'dot': {
      if (!previous) return insertAt(ctx, '');
      // A toggle: a dotted note loses its dot (abcjs cannot draw double dots).
      const current = parseLength(previous.length);
      const length = lengthText(times(current, isDotted(current) ? [2, 3] : [3, 2]));
      return {
        from: previous.from,
        to: previous.to,
        insert: noteText({ ...previous, length }),
        cursor: ctx.from + length.length - previous.length.length,
      };
    }
    case 'accidental': {
      const sign = { sharp: '^', flat: '_', natural: '=' }[cmd.value];
      // Only a note takes an accidental; a sign on its own would be an error.
      if (!previous || previous.letter === 'z' || previous.letter === 'x') {
        return insertAt(ctx, '');
      }
      return {
        from: previous.from,
        to: previous.to,
        insert: noteText({ ...previous, accidental: sign }),
        cursor: ctx.from + sign.length - previous.accidental.length,
      };
    }
    case 'tie':
      // A tie belongs right after a note that is not tied yet.
      if (!previous || previous.letter === 'z' || previous.letter === 'x' || previous.tie) {
        return insertAt(ctx, '');
      }
      return { from: previous.to, to: previous.to, insert: '-', cursor: ctx.from + 1 };
    case 'bar':
      return spaced(ctx, '|');
    case 'doubleBar':
      return spaced(ctx, '||');
    case 'repeatStart':
      return spaced(ctx, '|:');
    case 'repeatEnd':
      return spaced(ctx, ':|');
    case 'chord': {
      const edit = insertAt(ctx, `"${cmd.symbol.replace(/"/g, '')}"`);
      return { ...edit, cursor: ctx.from + edit.insert.length - 1 };
    }
    case 'header':
      return headerEdit(ctx.src, cmd.key, cmd.value);
    case 'technique': {
      const decoration = DECORATIONS[cmd.id];
      if (!decoration) return insertAt(ctx, '');
      if (!previous) return insertAt(ctx, decoration);
      return {
        from: previous.from,
        to: previous.from,
        insert: decoration,
        cursor: ctx.from + decoration.length,
      };
    }
  }
}

/** The title of the first tune, for the notes list. */
export const abcTitle = (src: string): string | undefined =>
  /^T:[ \t]*(.+)$/m.exec(src)?.[1].trim() || undefined;

/** ABC when the first line that is not empty starts with X: (docs/adr/0010). */
export const isAbc = (src: string): boolean => /^\s*X:/.test(src);

/**
 * The source tidied: lines and blank lines as tidyLines leaves them, and
 * single spaces between the notes of music lines. A space ends a beam, and
 * so do several, so the music stays the same. Fields, comments, quoted
 * chords and annotations stay as written.
 */
export function formatAbc(src: string): string {
  return tidyLines(src)
    .split('\n')
    .map((line) =>
      /^\s*(?:[A-Za-z+]:|%)/.test(line) ? line : mapOutside(line, /"[^"]*"?|%.*$/, singleSpaces)
    )
    .join('\n');
}
