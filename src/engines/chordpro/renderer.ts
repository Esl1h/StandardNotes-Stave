import {
  type EngineInstance,
  type ExportFormat,
  type RenderOpts,
  type ThemeColors,
} from '../../core/engine';
import {
  parseChordPro,
  transposeChordPro,
  type Item,
  type Segment,
  type SectionKind,
} from './syntax';

/**
 * The ChordPro renderer, loaded on demand (docs/adr/0009): the song as HTML,
 * chords over the lyrics they are sung on. Every text from the note goes in
 * through textContent, never as markup. The sheet's styles live in it, so
 * the SVG export, which wraps the same HTML, looks the same on paper.
 */

const HIGHLIGHT = 'stave-highlight';

const LABELS: Record<SectionKind, string> = {
  chorus: 'Chorus',
  verse: 'Verse',
  bridge: 'Bridge',
  tab: 'Tab',
  grid: 'Grid',
};

const META_ORDER: Array<[string, string]> = [
  ['key', 'Key'],
  ['capo', 'Capo'],
  ['tempo', 'Tempo'],
  ['time', 'Time'],
  ['duration', 'Duration'],
];

// Colors come from custom properties the pane sets from the theme, and the
// SVG export sets to black on white.
const STYLE = `
.chordpro-sheet { color: var(--cp-text); font-family: var(--sn-stylekit-sans-serif-font, sans-serif); line-height: 1.3; }
.chordpro-sheet h1 { font-size: 1.6em; margin: 0 0 0.1em; }
.chordpro-sheet .cp-subtitle, .chordpro-sheet .cp-artist { margin: 0; color: var(--cp-muted); }
.chordpro-sheet .cp-facts { margin: 0.4em 0 0.8em; color: var(--cp-muted); font-size: 0.9em; }
.chordpro-sheet .cp-line { display: flex; flex-wrap: wrap; align-items: flex-end; min-height: 1.3em; }
.chordpro-sheet .cp-seg { display: inline-flex; flex-direction: column; white-space: pre; }
.chordpro-sheet .cp-chord { color: var(--cp-chord); font-weight: 600; min-height: 1.3em; padding-right: 0.4em; }
.chordpro-sheet .cp-line.cp-no-chords .cp-chord { display: none; }
.chordpro-sheet .cp-blank { height: 0.8em; }
.chordpro-sheet .cp-section { margin: 0.3em 0; }
.chordpro-sheet .cp-chorus { border-left: 3px solid var(--cp-chord); padding-left: 0.8em; }
.chordpro-sheet .cp-label, .chordpro-sheet .cp-chorus-ref { font-weight: 600; margin: 0.3em 0 0.1em; }
.chordpro-sheet .cp-comment { margin: 0.3em 0; color: var(--cp-muted); }
.chordpro-sheet .cp-italic { font-style: italic; }
.chordpro-sheet .cp-box { border: 1px solid var(--cp-muted); display: inline-block; padding: 0 0.4em; }
.chordpro-sheet .cp-raw { font-family: var(--sn-stylekit-monospace-font, monospace); margin: 0; white-space: pre; }
`;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const spanning = (node: HTMLElement, from: number, to: number) => {
  node.dataset.from = String(from);
  node.dataset.to = String(to);
  return node;
};

function lyricsLine(segments: Segment[], from: number, to: number): HTMLElement {
  const line = spanning(el('div', 'cp-line'), from, to);
  if (!segments.some((segment) => segment.chord !== undefined)) line.classList.add('cp-no-chords');
  for (const segment of segments) {
    const seg = spanning(el('span', 'cp-seg'), segment.from, segment.to);
    const chord = el('span', 'cp-chord', segment.chord ?? '');
    if (segment.chordFrom !== undefined && segment.chordTo !== undefined) {
      spanning(chord, segment.chordFrom, segment.chordTo);
    }
    // A chord over no text still needs the room of its name.
    seg.append(chord, el('span', 'cp-lyric', segment.text || (segment.chord ? ' ' : '')));
    line.append(seg);
  }
  return line;
}

/** The song as a sheet: title and facts, then sections, comments and lines. */
export function drawSong(src: string, into: HTMLElement): ReturnType<typeof parseChordPro> {
  const song = parseChordPro(src);
  const sheet = el('div', 'chordpro-sheet');
  const { meta } = song;
  if (meta.title) sheet.append(el('h1', 'cp-title', meta.title));
  if (meta.subtitle) sheet.append(el('p', 'cp-subtitle', meta.subtitle));
  const by = [
    meta.artist,
    meta.composer && `Music: ${meta.composer}`,
    meta.lyricist && `Lyrics: ${meta.lyricist}`,
  ]
    .filter(Boolean)
    .join(' · ');
  if (by) sheet.append(el('p', 'cp-artist', by));
  const facts = META_ORDER.filter(([key]) => meta[key]).map(
    ([key, label]) => `${label} ${meta[key]}`
  );
  if (facts.length) sheet.append(el('p', 'cp-facts', facts.join(' · ')));

  let parent: HTMLElement = sheet;
  for (const item of song.items as Item[]) {
    switch (item.kind) {
      case 'start': {
        const section = spanning(
          el('section', `cp-section cp-${item.section}`),
          item.from,
          item.to
        );
        section.append(el('p', 'cp-label', item.label || LABELS[item.section]));
        sheet.append(section);
        parent = section;
        break;
      }
      case 'end':
        parent = sheet;
        break;
      case 'lyrics':
        parent.append(lyricsLine(item.segments, item.from, item.to));
        break;
      case 'comment': {
        const className = item.style === 'plain' ? 'cp-comment' : `cp-comment cp-${item.style}`;
        parent.append(spanning(el('p', className, item.text), item.from, item.to));
        break;
      }
      case 'raw':
        parent.append(spanning(el('pre', 'cp-raw', item.text), item.from, item.to));
        break;
      case 'chorus':
        parent.append(
          spanning(el('p', 'cp-chorus-ref', item.label || 'Chorus'), item.from, item.to)
        );
        break;
      case 'blank':
        parent.append(el('div', 'cp-blank'));
        break;
    }
  }
  into.replaceChildren(el('style', '', STYLE), sheet);
  return song;
}

const colors = (theme: ThemeColors) => ({
  '--cp-text': theme.foreground,
  '--cp-muted': `color-mix(in srgb, ${theme.foreground} 70%, ${theme.background})`,
  '--cp-chord': theme.accent,
});

/**
 * The sheet as an SVG file, black on white: the HTML inside a foreignObject,
 * which browsers draw and print as they draw the page.
 */
function exportSvg(target: HTMLElement): string {
  const sheet = target.querySelector<HTMLElement>('.chordpro-sheet');
  if (!sheet) throw new Error('Nothing to export yet.');
  const width = Math.ceil(sheet.scrollWidth) + 32;
  const height = Math.ceil(sheet.scrollHeight) + 32;
  const holder = document.createElement('div');
  holder.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  holder.style.padding = '16px';
  for (const [name, value] of Object.entries(
    colors({
      foreground: '#000000',
      background: '#ffffff',
      neutral: '#555555',
      accent: '#000000',
      danger: '#000000',
    })
  )) {
    holder.style.setProperty(name, value);
  }
  holder.append(el('style', '', STYLE), sheet.cloneNode(true));
  const body = new XMLSerializer().serializeToString(holder);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<foreignObject width="100%" height="100%">${body}</foreignObject>`,
    '</svg>',
  ].join('\n');
}

export async function mountChordPro(
  target: HTMLElement,
  opts: RenderOpts
): Promise<EngineInstance> {
  let onClick: ((range: [number, number]) => void) | undefined;
  let highlighted: Element | undefined;

  const setTheme = (theme: ThemeColors) => {
    for (const [name, value] of Object.entries(colors(theme)))
      target.style.setProperty(name, value);
  };
  const setZoom = (zoom: number) => {
    target.style.fontSize = `${zoom * 100}%`;
  };
  setTheme(opts.theme);
  setZoom(opts.zoom);

  const clicked = (event: MouseEvent) => {
    const node = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-from]');
    if (node && target.contains(node)) {
      onClick?.([Number(node.dataset.from), Number(node.dataset.to)]);
    }
  };
  target.addEventListener('click', clicked);

  return {
    async render(src) {
      highlighted = undefined;
      return { errors: drawSong(src, target).errors };
    },
    onSourceClick(cb) {
      onClick = cb;
    },
    highlight([from]) {
      highlighted?.classList.remove(HIGHLIGHT);
      // The innermost element that holds the offset: a chord, then its segment.
      const found = Array.from(
        target.querySelectorAll<HTMLElement>('.cp-seg, .cp-chord[data-from]')
      )
        .filter((node) => Number(node.dataset.from) <= from && from <= Number(node.dataset.to))
        .pop();
      highlighted = found;
      found?.classList.add(HIGHLIGHT);
    },
    exportFormats: ['svg'],
    async export(fmt: ExportFormat) {
      if (fmt !== 'svg') throw new Error(`ChordPro cannot be exported as ${fmt}.`);
      return new Blob([exportSvg(target)], { type: 'image/svg+xml' });
    },
    async transpose(text, semitones) {
      return transposeChordPro(text, semitones);
    },
    setTheme,
    setZoom,
    destroy() {
      target.removeEventListener('click', clicked);
      target.replaceChildren();
      target.style.removeProperty('font-size');
    },
  };
}
