import { type Cmd, type CursorCtx, type Edit, type HeaderKey } from '../../core/engine';
import { mapOutside, singleSpaces, tidyLines } from '../../core/format';

/**
 * alphaTex text for toolbar commands. Pure string work, no alphaTab: this
 * module is part of the initial load, the renderer is not.
 */

// Strings 1 (high E) to 6 of a guitar in standard tuning, as MIDI numbers:
// what alphaTab assumes for a track without \tuning.
const STANDARD_TUNING = [64, 59, 55, 50, 45, 40];
const HIGHEST_FRET = 24;

const PITCH = /^([A-Ga-g])(#{1,2}|b{1,2}|n)?(-?\d)$/;
const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Scientific pitch ("C4", "F#5", "Bb3") as a MIDI number; C4 is 60. */
export function midiOf(pitch: string): number | null {
  const match = PITCH.exec(pitch);
  if (!match) return null;
  const [, letter, accidental = '', octave] = match;
  const shift = accidental.startsWith('#')
    ? accidental.length
    : accidental.startsWith('b')
      ? -accidental.length
      : 0;
  return (Number(octave) + 1) * 12 + SEMITONES[letter.toUpperCase()] + shift;
}

/**
 * Where an instrument plays a MIDI pitch, as fret.string: the highest string
 * that reaches it, so the lowest fret. Pitches out of its range move by
 * octaves until they fit. The tuning lists the open strings from string 1
 * (the highest) down, as \tuning writes them.
 */
export function fretString(midi: number, tuning: number[] = STANDARD_TUNING): string {
  const lowest = Math.min(...tuning);
  const highest = Math.max(...tuning) + HIGHEST_FRET;
  let pitch = midi;
  while (pitch < lowest) pitch += 12;
  while (pitch > highest) pitch -= 12;
  const string = tuning.findIndex((open) => pitch >= open && pitch - open <= HIGHEST_FRET);
  return `${pitch - tuning[string]}.${string + 1}`;
}

/** Where each track starts, with the tuning its \tuning gives, in source order. */
function tunings(src: string): Array<{ from: number; tuning: number[] }> {
  const tracks: Array<{ from: number; tuning: number[] }> = [{ from: 0, tuning: STANDARD_TUNING }];
  const tag = /\\(track|tuning)\b\s*(?:\(([^)]*)\))?/g;
  for (const match of src.matchAll(tag)) {
    if (match[1] === 'track') {
      tracks.push({ from: match.index ?? 0, tuning: STANDARD_TUNING });
      continue;
    }
    const pitches = (match[2] ?? '').split(/\s+/).map(midiOf);
    if (pitches.length && pitches.every((pitch) => pitch !== null)) {
      tracks[tracks.length - 1].tuning = pitches as number[];
    }
  }
  return tracks;
}

/** The open strings of the track at pos, high to low. */
export function tuningAt(src: string, pos: number): number[] {
  return tunings(src)
    .filter((track) => track.from <= pos)
    .at(-1)!.tuning;
}

// A note: fret.string (a fret, "-" for a tie, "x" for a dead note) or a
// pitch name on a staff without tablature, then its effects in braces.
const NOTE_VALUE = String.raw`(?:(?:\d+|-|x)\.\d+|[A-Ga-g](?:#{1,2}|b{1,2}|n)?-?\d)`;
const NOTE = new RegExp(String.raw`(${NOTE_VALUE})(\{[^}]*\})?`, 'g');
const BEAT = new RegExp(
  String.raw`^(r|\((?:\s*${NOTE_VALUE}(?:\{[^}]*\})?)+\s*\)|${NOTE_VALUE}(?:\{[^}]*\})?)` +
    String.raw`(?:\.(\d+))?(\s*\{[^}]*\})?(\*\d+)?$`
);

export interface BeatToken {
  from: number;
  to: number;
  /** "r", one note or a chord in parentheses, with the note effects. */
  notes: string;
  /** The duration written on the beat, if any ("4", "8"). */
  duration?: string;
  /** The beat effects, without their braces. */
  effects?: string;
  /** "*3" when the beat is repeated. */
  multiplier: string;
}

/**
 * The text of the token that ends right before pos: back to a space that is
 * not inside parentheses, braces or quotes.
 */
function tokenBefore(src: string, pos: number): { from: number; to: number } | null {
  let to = pos;
  while (to > 0 && /[ \t]/.test(src[to - 1])) to--;
  let from = to;
  let depth = 0;
  let quoted = false;
  while (from > 0) {
    const char = src[from - 1];
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === ')' || char === '}')) depth++;
    else if (!quoted && (char === '(' || char === '{')) depth--;
    else if (!quoted && depth === 0 && /\s/.test(char)) break;
    from--;
  }
  return from < to && depth === 0 && !quoted ? { from, to } : null;
}

/** The beat that ends right before pos, allowing only spaces in between. */
export function beatBefore(src: string, pos: number): BeatToken | null {
  const lineStart = src.lastIndexOf('\n', pos - 1) + 1;
  if (src.slice(lineStart, pos).includes('//')) return null;
  let token = tokenBefore(src, pos);
  if (!token) return null;
  // Beat effects written apart from their notes: "3.3 {d}".
  if (src[token.from] === '{') {
    const notes = tokenBefore(src, token.from);
    if (notes) token = { from: notes.from, to: token.to };
  }
  const match = BEAT.exec(src.slice(token.from, token.to));
  if (!match) return null;
  return {
    ...token,
    notes: match[1],
    duration: match[2],
    effects: match[3]?.trim().slice(1, -1).trim(),
    multiplier: match[4] ?? '',
  };
}

const beatText = (beat: BeatToken): string =>
  `${beat.notes}${beat.duration ? `.${beat.duration}` : ''}` +
  // Apart from the notes when there is no duration between them, or they
  // would read as note effects.
  `${beat.effects ? `${beat.duration ? '' : ' '}{${beat.effects}}` : ''}${beat.multiplier}`;

const PROPERTY = (name: string) =>
  new RegExp(String.raw`(^|\s)${name}(\s*\([^)]*\)|\s+"[^"]*")?(?=\s|$)`);

/** Adds a property to an effect list, or takes it out when it is there. */
function toggleProperty(effects: string | undefined, name: string, text = name): string {
  const list = effects ?? '';
  if (PROPERTY(name).test(list)) return list.replace(PROPERTY(name), '').trim();
  return list ? `${list} ${text}` : text;
}

function setProperty(effects: string | undefined, name: string, text: string): string {
  const list = (effects ?? '').replace(PROPERTY(name), '').trim();
  return list ? `${list} ${text}` : text;
}

/** Rewrites each note of the beat's note list with fn. */
const mapNotes = (notes: string, fn: (value: string, effects: string | undefined) => string) =>
  notes.replace(NOTE, (_, value: string, braces: string | undefined) =>
    fn(value, braces?.slice(1, -1).trim())
  );

const withEffects = (value: string, effects: string | undefined) =>
  effects ? `${value}{${effects}}` : value;

const isRest = (beat: BeatToken | null) => !beat || beat.notes === 'r';

const ACCIDENTAL_SIGNS = { sharp: '#', flat: 'b', natural: 'n' };

/** A note one semitone up (sharp) or down (flat); natural drops the sign. */
function alter(value: string, accidental: 'sharp' | 'flat' | 'natural'): string {
  const fret = /^(\d+)\.(\d+)$/.exec(value);
  if (fret) {
    const shift = { sharp: 1, flat: -1, natural: 0 }[accidental];
    return `${Math.max(0, Number(fret[1]) + shift)}.${fret[2]}`;
  }
  const pitch = PITCH.exec(value);
  if (!pitch) return value;
  return `${pitch[1]}${ACCIDENTAL_SIGNS[accidental]}${pitch[3]}`;
}

/** Whether the staff at pos shows no tablature, so notes are pitch names. */
export function isPitchedStaff(src: string, pos: number): boolean {
  const before = src.slice(0, pos);
  const track = before.lastIndexOf('\\track');
  const staff = /\\staff\s*\{([^}]*)\}/g;
  let last: string | undefined;
  for (const match of before.matchAll(staff)) {
    if ((match.index ?? 0) > track) last = match[1];
  }
  return last !== undefined && !/\btabs\b/.test(last);
}

// A line of metadata only, such as \track "Bass" or \tuning (E4 B3 ...):
// it starts with a tag and has no note outside parentheses, braces and
// quotes. "\ro 3.3.4" is a bar.
const isMetadataLine = (line: string) =>
  /^[ \t]*\\/.test(line) &&
  !new RegExp(String.raw`(^|\s)(r|${NOTE_VALUE})(\s|\.|\{|$)`).test(
    line.replace(/\([^)]*\)|\{[^}]*\}|"[^"]*"/g, ' ')
  );

/**
 * Where the bar at pos starts: after the last bar line, or after the last
 * metadata line (a new track or staff starts its own bars).
 */
export function barStart(src: string, pos: number): number {
  const before = src.slice(0, pos);
  const bar = before.lastIndexOf('|') + 1;
  let metadata = 0;
  for (const match of before.matchAll(/^[^\n]*\n/gm)) {
    if (isMetadataLine(match[0])) metadata = (match.index ?? 0) + match[0].length;
  }
  return Math.max(bar, metadata);
}

const insertAt = (ctx: CursorCtx, insert: string): Edit => ({ from: ctx.from, to: ctx.to, insert });

/** Inserts with a space before it unless the cursor already follows one. */
const spaced = (ctx: CursorCtx, text: string): Edit => {
  const previous = ctx.src[ctx.from - 1];
  const before = ctx.from === 0 || previous === undefined || /\s/.test(previous) ? '' : ' ';
  const next = ctx.src[ctx.to];
  const after = next === undefined || /\s/.test(next) ? '' : ' ';
  return insertAt(ctx, `${before}${text}${after}`);
};

/** Puts bar metadata at the start of the bar at the cursor and closes it. */
function closeBar(ctx: CursorCtx, metadata: string): Edit {
  const start = barStart(ctx.src, ctx.from);
  const bar = ctx.src.slice(start, ctx.from);
  const tag = metadata.split(' ')[0].slice(1);
  const head = new RegExp(String.raw`^\s*\\${tag}\b`).test(bar) ? '' : `${metadata} `;
  const lead = bar.match(/^\s*/)?.[0] ?? '';
  const insert = `${lead}${head}${bar.slice(lead.length).trimEnd()} |`;
  return { from: start, to: ctx.to, insert };
}

const SCORE_FIELDS = new Set([
  'title',
  'subtitle',
  'artist',
  'album',
  'words',
  'music',
  'copyright',
  'tab',
  'instructions',
  'notices',
]);

const HEADER_TAGS: Record<HeaderKey, string> = {
  title: 'title',
  composer: 'music',
  meter: 'ts',
  key: 'ks',
  tempo: 'tempo',
  clef: 'clef',
};

function headerText(key: HeaderKey, value: string): string {
  const tag = HEADER_TAGS[key];
  switch (key) {
    case 'title':
    case 'composer':
      return `\\${tag} "${value.replace(/"/g, "'")}"`;
    case 'meter':
      return `\\${tag} (${value.replace('/', ' ')})`;
    case 'tempo':
      return `\\${tag} ${Number.parseInt(value, 10) || 120}`;
    default:
      return `\\${tag} (${value})`;
  }
}

/**
 * Sets a header: replaces its line, or adds one after the score metadata at
 * the top (title, artist...), where alphaTex expects it.
 */
function headerEdit(src: string, key: HeaderKey, value: string): Edit {
  const text = headerText(key, value);
  const existing = new RegExp(String.raw`^[ \t]*\\${HEADER_TAGS[key]}\b[^\n]*`, 'm').exec(src);
  if (existing) {
    const from = existing.index ?? 0;
    return { from, to: from + existing[0].length, insert: text };
  }
  let at = 0;
  const line = /^[ \t]*\\([A-Za-z]+)[^\n]*(\n|$)/y;
  for (let match = line.exec(src); match; match = line.exec(src)) {
    if (!SCORE_FIELDS.has(match[1].toLowerCase())) break;
    at = line.lastIndex;
  }
  const newline = at > 0 && src[at - 1] !== '\n' ? '\n' : '';
  return { from: at, to: at, insert: `${newline}${text}\n` };
}

// Note effects for the technique tools, as alphaTex writes them.
const TECHNIQUES: Record<string, string> = {
  bend: 'b (0 4)',
  slide: 'sl',
  hammer: 'h',
  palmMute: 'pm',
  harmonic: 'nh',
  vibrato: 'v',
  deadNote: 'x',
  letRing: 'lr',
  staccato: 'st',
  accent: 'ac',
  ghost: 'g',
};

/** The alphaTex edit for a toolbar command at the cursor. */
export function emitAlphaTex(cmd: Cmd, ctx: CursorCtx): Edit {
  const previous = beatBefore(ctx.src, ctx.from);
  const replace = (beat: BeatToken, next: BeatToken): Edit => {
    const insert = beatText(next);
    return {
      from: beat.from,
      to: beat.to,
      insert,
      cursor: ctx.from + insert.length - (beat.to - beat.from),
    };
  };
  switch (cmd.kind) {
    case 'note': {
      const pitched = isPitchedStaff(ctx.src, ctx.from);
      const midi = cmd.pitch ? midiOf(cmd.pitch) : null;
      let notes: string;
      if (midi !== null) {
        notes = pitched ? cmd.pitch : fretString(midi, tuningAt(ctx.src, ctx.from));
      } else if (previous && !isRest(previous)) {
        notes = mapNotes(previous.notes, (value) => value.replace(/^-/, '0'));
      } else {
        notes = pitched ? 'B4' : '0.3';
      }
      return spaced(ctx, `${notes}.${cmd.dur}${cmd.dotted ? '{d}' : ''}`);
    }
    case 'rest':
      return spaced(ctx, `r.${cmd.dur}${cmd.dotted ? '{d}' : ''}`);
    case 'dot': {
      if (!previous) return insertAt(ctx, '');
      return replace(previous, { ...previous, effects: toggleProperty(previous.effects, 'd') });
    }
    case 'accidental': {
      if (!previous || isRest(previous)) return insertAt(ctx, '');
      const notes = mapNotes(previous.notes, (value, effects) =>
        withEffects(alter(value, cmd.value), effects)
      );
      return replace(previous, { ...previous, notes });
    }
    case 'tie': {
      // A tie is written on the note it continues into: a copy of the beat.
      if (!previous || isRest(previous)) return insertAt(ctx, '');
      const notes = mapNotes(previous.notes, (value) => withEffects(value, 't'));
      return spaced(ctx, notes);
    }
    case 'bar':
      return spaced(ctx, '|');
    case 'doubleBar':
      return closeBar(ctx, '\\db');
    case 'repeatStart': {
      const bar = ctx.src.slice(barStart(ctx.src, ctx.from), ctx.from);
      return spaced(ctx, bar.trim() ? '| \\ro' : '\\ro');
    }
    case 'repeatEnd':
      return closeBar(ctx, '\\rc 2');
    case 'chord': {
      if (!previous || isRest(previous)) return insertAt(ctx, '');
      const symbol = cmd.symbol.replace(/"/g, '');
      return replace(previous, {
        ...previous,
        effects: setProperty(previous.effects, 'ch', `ch "${symbol}"`),
      });
    }
    case 'header':
      return headerEdit(ctx.src, cmd.key, cmd.value);
    case 'technique': {
      const effect = TECHNIQUES[cmd.id];
      if (!effect || !previous || isRest(previous)) return insertAt(ctx, '');
      const name = effect.split(' ')[0];
      const notes = mapNotes(previous.notes, (value, effects) =>
        withEffects(value, toggleProperty(effects, name, effect) || undefined)
      );
      return replace(previous, { ...previous, notes });
    }
  }
}

/** The score title, for the notes list. */
export const alphaTexTitle = (src: string): string | undefined =>
  /^[ \t]*\\title\s*\(?\s*"([^"]*)"/m.exec(src)?.[1].trim() || undefined;

/** alphaTex when a line starts with a backslash metadata tag (docs/adr/0010). */
export const isAlphaTex = (src: string): boolean => /^[ \t]*\\[A-Za-z]/m.test(src);

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** A note or key name moved by semitones, spelled with sharps up and flats down. */
function shiftName(name: string, semitones: number): string {
  const match = /^([A-Ga-g])(#{1,2}|b{1,2})?$/.exec(name);
  if (!match) return name;
  const midi = midiOf(`${match[1].toUpperCase()}${match[2] ?? ''}4`) ?? 60;
  const names = semitones >= 0 ? SHARP_NAMES : FLAT_NAMES;
  return names[(((midi + semitones) % 12) + 12) % 12];
}

function shiftPitch(pitch: string, semitones: number): string {
  const midi = midiOf(pitch);
  if (midi === null) return pitch;
  const moved = midi + semitones;
  const names = semitones >= 0 ? SHARP_NAMES : FLAT_NAMES;
  return `${names[((moved % 12) + 12) % 12]}${Math.floor(moved / 12) - 1}`;
}

/**
 * A fret moved by semitones on the same string while it stays on the neck;
 * otherwise the note moves to the string of the track's tuning that plays it.
 */
function shiftFret(fret: number, string: number, semitones: number, tuning: number[]): string {
  const moved = fret + semitones;
  if (moved >= 0 && moved <= HIGHEST_FRET) return `${moved}.${string}`;
  const open = tuning[string - 1] ?? tuning[0];
  return fretString(open + moved, tuning);
}

// What transposition reads: comments and strings stay as they are, tags
// with their arguments too (a \tuning names pitches that must not move),
// except the key signature; chord symbols in effects move with the notes.
const TRANSPOSABLE = new RegExp(
  [
    String.raw`//[^\n]*|/\*[\s\S]*?\*/`,
    String.raw`(\\ks\s*\(?\s*)([A-Ga-g](?:#|b)?)`,
    String.raw`\\[A-Za-z]+(?:\s*\([^)]*\))?`,
    String.raw`"[^"]*"`,
    String.raw`\{[^}]*\}`,
    String.raw`(\d+)\.(\d+)`,
    String.raw`([A-Ga-g](?:#{1,2}|b{1,2}|n)?-?\d)`,
  ].join('|'),
  'g'
);

/** The source with every note, key signature and chord symbol moved by semitones. */
export function transposeAlphaTex(src: string, semitones: number): string {
  if (semitones === 0) return src;
  const tracks = tunings(src);
  const tuningOf = (offset: number) =>
    tracks.filter((track) => track.from <= offset).at(-1)!.tuning;
  return src.replace(
    TRANSPOSABLE,
    (whole: string, ...groups: Array<string | number | undefined>) => {
      const [keyTag, key, fret, string, pitch, offset] = groups as [
        string?,
        string?,
        string?,
        string?,
        string?,
        number?,
      ];
      if (key !== undefined) return `${keyTag}${shiftName(key, semitones)}`;
      if (fret !== undefined) {
        return shiftFret(Number(fret), Number(string), semitones, tuningOf(offset ?? 0));
      }
      if (pitch !== undefined) return shiftPitch(pitch, semitones);
      if (whole.startsWith('{')) {
        return whole.replace(
          /(\bch\s+")([A-Ga-g](?:#|b)?)/g,
          (_, lead: string, root: string) => `${lead}${shiftName(root, semitones)}`
        );
      }
      return whole;
    }
  );
}

// Strings and comments, which formatting leaves as written.
const KEPT = /"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/;

/**
 * The source tidied: lines and blank lines as tidyLines leaves them, single
 * spaces between tokens and a space on each side of a bar line. alphaTex
 * reads any whitespace alike, so the music stays the same.
 */
export function formatAlphaTex(src: string): string {
  const spaced = mapOutside(tidyLines(src), KEPT, (gap, before) =>
    singleSpaces(
      gap.replace(/([^\s|])[ \t]*\|/g, '$1 |').replace(/\|[ \t]*([^\s|])/g, '| $1'),
      before
    )
  );
  return tidyLines(spaced);
}
