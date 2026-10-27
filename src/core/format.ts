/**
 * Text tidying shared by the engines' Format source: only changes that keep
 * the music as it is.
 */

/**
 * Line ends become LF, lines lose trailing blanks, runs of blank lines become
 * one (in ABC a blank line ends a tune, so one is kept) and the text ends
 * with a single newline.
 */
export function tidyLines(src: string): string {
  const lines = src
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());
  const kept = lines.filter((line, i) => line !== '' || (i > 0 && lines[i - 1] !== ''));
  const text = kept.join('\n').replace(/^\n+|\n+$/g, '');
  return text ? `${text}\n` : '';
}

/**
 * Rewrites the text between the spans `kept` matches (strings, comments),
 * which stay as written. `fn` gets each gap and the character before it.
 */
export function mapOutside(
  text: string,
  kept: RegExp,
  fn: (gap: string, before: string) => string
): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(new RegExp(kept.source, `${kept.flags.replace('g', '')}g`))) {
    out += fn(text.slice(last, match.index), text[last - 1] ?? '') + match[0];
    last = match.index + match[0].length;
  }
  return out + fn(text.slice(last), text[last - 1] ?? '');
}

/** Runs of spaces and tabs as one space, except indentation at a line start. */
export const singleSpaces = (gap: string, before: string): string =>
  gap.replace(/[ \t]+/g, (run, offset: number) => {
    const previous = offset > 0 ? gap[offset - 1] : before;
    return previous === '\n' || previous === '' ? run : ' ';
  });
