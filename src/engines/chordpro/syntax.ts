import { type Cmd, type CursorCtx, type Edit, type SourceError } from '../../core/engine';
import { tidyLines } from '../../core/format';

/**
 * ChordPro read and written as text: lyrics with [chords] inline and
 * {directives} on lines of their own (https://www.chordpro.org). Stave
 * parses it itself: ChordSheetJS, the usual library, is GPL-2.0-only,
 * which the AGPL-3.0 plugin cannot include (docs/adr/0008).
 */

/** A chord and the lyrics sung from it, with their source offsets. */
export interface Segment {
  chord?: string;
  /** Offsets of the chord name, without its brackets. */
  chordFrom?: number;
  chordTo?: number;
  text: string;
  from: number;
  to: number;
}

export type SectionKind = 'chorus' | 'verse' | 'bridge' | 'tab' | 'grid';

export type Item =
  | { kind: 'lyrics'; segments: Segment[]; from: number; to: number }
  | { kind: 'comment'; text: string; style: 'plain' | 'italic' | 'box'; from: number; to: number }
  | { kind: 'start'; section: SectionKind; label: string; from: number; to: number }
  | { kind: 'end'; from: number; to: number }
  | { kind: 'raw'; text: string; from: number; to: number }
  | { kind: 'chorus'; label: string; from: number; to: number }
  | { kind: 'blank' };

export interface Song {
  /** Title, artist, key and the other song facts, by canonical name. */
  meta: Record<string, string>;
  items: Item[];
  errors: SourceError[];
}

const ALIASES: Record<string, string> = {
  t: 'title',
  st: 'subtitle',
  c: 'comment',
  ci: 'comment_italic',
  cb: 'comment_box',
  soc: 'start_of_chorus',
  eoc: 'end_of_chorus',
  sov: 'start_of_verse',
  eov: 'end_of_verse',
  sob: 'start_of_bridge',
  eob: 'end_of_bridge',
  sot: 'start_of_tab',
  eot: 'end_of_tab',
  sog: 'start_of_grid',
  eog: 'end_of_grid',
  np: 'new_page',
  npp: 'new_physical_page',
  ns: 'new_song',
  col: 'columns',
  colb: 'column_break',
};

const META = new Set([
  'title',
  'subtitle',
  'artist',
  'composer',
  'lyricist',
  'arranger',
  'album',
  'year',
  'copyright',
  'key',
  'capo',
  'tempo',
  'time',
  'duration',
]);

// Directives about fonts, pages and chord diagrams: valid, nothing to draw.
const IGNORED = new Set([
  'new_page',
  'new_physical_page',
  'new_song',
  'columns',
  'column_break',
  'define',
  'chord',
  'pagetype',
  'titles',
  'diagrams',
  'grid',
  'no_grid',
  'image',
  'meta',
  'transpose',
  'textfont',
  'textsize',
  'textcolour',
  'chordfont',
  'chordsize',
  'chordcolour',
  'tabfont',
  'tabsize',
  'tabcolour',
]);

const SECTIONS: Record<string, SectionKind> = {
  chorus: 'chorus',
  verse: 'verse',
  bridge: 'bridge',
  tab: 'tab',
  grid: 'grid',
};

/** Line and column (1-based) of an offset. */
function position(src: string, offset: number): { line: number; column: number } {
  const before = src.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

const DIRECTIVE = /^\s*\{\s*([A-Za-z_]+)(?:\s*[:\s]\s*([^}]*?))?\s*\}\s*$/;

/**
 * A lyrics line as chords and the text sung from each; text before the
 * first chord has no chord. Each segment spans its [chord] and its text.
 */
function segments(line: string, start: number, error: (offset: number, message: string) => void) {
  const parts: Segment[] = [];
  let last = 0;
  let chord: (Pick<Segment, 'chord' | 'chordFrom' | 'chordTo'> & { at: number }) | undefined;
  const flush = (end: number) => {
    if (!chord && end === last) return;
    const { at, ...named } = chord ?? { at: last };
    parts.push({ ...named, text: line.slice(last, end), from: start + at, to: start + end });
  };
  for (const match of line.matchAll(/\[([^\]]*)\]/g)) {
    flush(match.index);
    const name = match[1].trim();
    const nameAt = match.index + 1 + match[1].indexOf(name);
    chord = {
      chord: name,
      chordFrom: start + nameAt,
      chordTo: start + nameAt + name.length,
      at: match.index,
    };
    last = match.index + match[0].length;
  }
  flush(line.length);
  const unclosed = line.indexOf('[', last);
  if (unclosed !== -1) error(start + unclosed, 'A chord is not closed with ]');
  return parts;
}

/** The song as items to draw, with its facts and what is wrong in it. */
export function parseChordPro(src: string): Song {
  const meta: Record<string, string> = {};
  const items: Item[] = [];
  const errors: SourceError[] = [];
  const error = (offset: number, message: string, to?: number) =>
    errors.push({ message, ...position(src, offset), from: offset, to: to ?? offset + 1 });
  const open: Array<{ section: SectionKind; from: number; to: number }> = [];
  let offset = 0;
  for (const line of src.split('\n')) {
    const from = offset;
    const to = from + line.length;
    offset = to + 1;
    const raw = open.length > 0 && ['tab', 'grid'].includes(open[open.length - 1].section);
    const directive = DIRECTIVE.exec(line);
    if (directive) {
      const name = ALIASES[directive[1].toLowerCase()] ?? directive[1].toLowerCase();
      const value = (directive[2] ?? '').trim();
      const sectionMatch = /^(start|end)_of_(\w+)$/.exec(name);
      if (raw && !(sectionMatch?.[1] === 'end')) {
        items.push({ kind: 'raw', text: line, from, to });
      } else if (META.has(name)) {
        meta[name] = value;
      } else if (name.startsWith('comment')) {
        const style =
          name === 'comment_italic' ? 'italic' : name === 'comment_box' ? 'box' : 'plain';
        items.push({ kind: 'comment', text: value, style, from, to });
      } else if (sectionMatch) {
        const section = SECTIONS[sectionMatch[2]] ?? 'verse';
        if (sectionMatch[1] === 'start') {
          if (open.length) error(from, 'A section starts inside another one', to);
          open.push({ section, from, to });
          items.push({ kind: 'start', section, label: value, from, to });
        } else if (open.pop()?.section !== section) {
          error(from, `{${name}} closes no ${sectionMatch[2]}`, to);
        } else {
          items.push({ kind: 'end', from, to });
        }
      } else if (name === 'chorus') {
        items.push({ kind: 'chorus', label: value, from, to });
      } else if (!IGNORED.has(name) && !name.startsWith('x_')) {
        error(from + line.indexOf(directive[1]), `Unknown directive {${directive[1]}}`, to);
      }
      continue;
    }
    if (raw) {
      items.push({ kind: 'raw', text: line, from, to });
    } else if (/^\s*#/.test(line)) {
      // A comment for whoever edits the source, not shown.
    } else if (line.trim() === '') {
      items.push({ kind: 'blank' });
    } else if (/^\s*\{/.test(line)) {
      error(from + line.indexOf('{'), 'A directive is not closed with }', to);
    } else {
      items.push({ kind: 'lyrics', segments: segments(line, from, error), from, to });
    }
  }
  for (const section of open) {
    error(section.from, `The ${section.section} is not closed`, section.to);
  }
  return { meta, items, errors };
}

const CHORD_LIKE = /\[[A-G](?:#|b)?[^\]\s]{0,10}\]/;

/** ChordPro: song directives, or lyrics with [chords] in them. */
export const isChordPro = (src: string): boolean =>
  /^\s*\{\s*(?:t|title|st|subtitle|artist|soc|start_of_chorus|sov|start_of_verse|c|comment|key|capo)\s*[:}\s]/m.test(
    src
  ) ||
  src
    .split('\n')
    .some((line) => CHORD_LIKE.test(line) && /[A-Za-z]{2,}/.test(line.replace(/\[[^\]]*\]/g, '')));

export const chordProTitle = (src: string): string | undefined =>
  /^\s*\{\s*(?:title|t)\s*:\s*([^}]*?)\s*\}/m.exec(src)?.[1] || undefined;

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A note name moved by semitones; sharps going up, flats going down. */
function shiftNote(note: string, semitones: number): string {
  const value = STEP[note[0].toUpperCase()] + (note[1] === '#' ? 1 : note[1] === 'b' ? -1 : 0);
  return (semitones >= 0 ? SHARPS : FLATS)[(((value + semitones) % 12) + 12) % 12];
}

/** A chord name moved by semitones: its root and any bass after a slash. */
export function transposeChord(chord: string, semitones: number): string {
  return chord.replace(
    /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/,
    (_, root: string, rest: string, bass?: string) =>
      `${shiftNote(root, semitones)}${rest}${bass ? `/${shiftNote(bass, semitones)}` : ''}`
  );
}

/** The source with every chord and the key moved by semitones; the rest as written. */
export function transposeChordPro(src: string, semitones: number): string {
  if (semitones === 0) return src;
  return src
    .split('\n')
    .map((line) => {
      const key = /^(\s*\{\s*key\s*[:\s]\s*)([^}]*?)(\s*\}\s*)$/i.exec(line);
      if (key) return key[1] + transposeChord(key[2], semitones) + key[3];
      if (DIRECTIVE.test(line) || /^\s*#/.test(line)) return line;
      return line.replace(
        /\[([^\]]*)\]/g,
        (_, chord: string) => `[${transposeChord(chord, semitones)}]`
      );
    })
    .join('\n');
}

/** The source tidied as every notation is: lines and blank lines only. */
export const formatChordPro = (src: string): string => tidyLines(src);

const HEADERS: Partial<Record<string, string>> = {
  title: 'title',
  composer: 'composer',
  key: 'key',
  tempo: 'tempo',
  meter: 'time',
};

/** A directive line at the start, or its value replaced when it is there. */
function directiveEdit(src: string, name: string, value: string): Edit {
  const existing = new RegExp(`^(\\s*\\{\\s*${name}\\s*:\\s*)([^}]*?)(\\s*\\})`, 'mi').exec(src);
  if (existing) {
    const from = existing.index + existing[1].length;
    return { from, to: from + existing[2].length, insert: value };
  }
  return {
    from: 0,
    to: 0,
    insert: `{${name}: ${value}}\n`,
    cursor: name.length + 3 + value.length,
  };
}

/** Lines that wrap the selection, or an empty section with the cursor inside. */
function wrapEdit(ctx: CursorCtx, start: string, end: string): Edit {
  const lineStart = ctx.src.lastIndexOf('\n', ctx.from - 1) + 1;
  if (ctx.from === ctx.to) {
    const before = ctx.from === lineStart ? '' : '\n';
    const insert = `${before}${start}\n\n${end}\n`;
    return {
      from: ctx.from,
      to: ctx.to,
      insert,
      cursor: ctx.from + before.length + start.length + 1,
    };
  }
  const lineEnd = ctx.src.indexOf('\n', ctx.to - 1);
  const to = lineEnd === -1 ? ctx.src.length : lineEnd;
  const body = ctx.src.slice(lineStart, to);
  return { from: lineStart, to, insert: `${start}\n${body}\n${end}` };
}

/** A toolbar command as ChordPro; commands about notes do nothing here. */
export function emitChordPro(cmd: Cmd, ctx: CursorCtx): Edit {
  const at = (insert: string, cursor = insert.length): Edit => ({
    from: ctx.from,
    to: ctx.to,
    insert,
    cursor: ctx.from + cursor,
  });
  switch (cmd.kind) {
    case 'chord':
      return at(`[${cmd.symbol}]`);
    case 'header': {
      const name = HEADERS[cmd.key];
      return name ? directiveEdit(ctx.src, name, cmd.value) : at('', 0);
    }
    case 'technique':
      switch (cmd.id) {
        case 'chorus':
          return wrapEdit(ctx, '{start_of_chorus}', '{end_of_chorus}');
        case 'verse':
          return wrapEdit(ctx, '{start_of_verse}', '{end_of_verse}');
        case 'bridge':
          return wrapEdit(ctx, '{start_of_bridge}', '{end_of_bridge}');
        case 'tab':
          return wrapEdit(ctx, '{start_of_tab}', '{end_of_tab}');
        case 'comment': {
          // A directive is a line of its own.
          const lineStart = ctx.src.lastIndexOf('\n', ctx.from - 1) + 1;
          const before = ctx.from === lineStart ? '' : '\n';
          return at(`${before}{comment: }\n`, before.length + '{comment: '.length);
        }
        case 'capo':
          return directiveEdit(ctx.src, 'capo', '2');
      }
      return at('', 0);
    default:
      return { from: ctx.from, to: ctx.from, insert: '' };
  }
}
