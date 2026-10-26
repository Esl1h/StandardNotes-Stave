import abcjs, { type MidiBuffer, type TimingCallbacks, type TuneObject } from 'abcjs';
import {
  type EngineInstance,
  type ExportFormat,
  type Player,
  type PlayerState,
  type RenderOpts,
  type SourceError,
  type ThemeColors,
} from '../../core/engine';

/**
 * The ABC renderer and player, loaded on demand (docs/adr/0009). abcjs
 * draws SVG into the pane and plays through Web Audio with the piano
 * samples shipped in the build (docs/adr/0011).
 */

const SOUNDFONT = 'soundfont/FluidR3_GM/';
// The only instrument shipped; every track plays on it.
const INSTRUMENT = 'acoustic_grand_piano';
const HIGHLIGHT = 'stave-highlight';
const PLAYING = 'stave-playing';

/**
 * abcjs warnings as source errors. They read "Music Line:6:7: message:
 * excerpt", with the excerpt in HTML; line and column are 1-based.
 */
export function parseWarnings(warnings: string[] | undefined): SourceError[] {
  return (warnings ?? []).map((warning) => {
    const text = warning.replace(/<[^>]*>/g, '');
    const match = /^(?:Music )?Line:\s*(\d+):(\d+):\s*([^]*?)(?::\s{2}[^]*)?$/.exec(text);
    if (!match) return { message: text, line: 1, column: 1 };
    return { message: match[3].trim(), line: Number(match[1]), column: Number(match[2]) };
  });
}

const sourceFile = () => new URL(SOUNDFONT, document.baseURI).href;

class AbcPlayer implements Player {
  private synth: MidiBuffer | null = null;
  private timing: TimingCallbacks | null = null;
  private state: PlayerState = { playing: false, speed: 1, loop: false };
  private listeners: Array<(state: PlayerState) => void> = [];
  private paused = false;

  constructor(
    private tune: () => TuneObject | undefined,
    private cursor: (elements: Element[][]) => void
  ) {}

  private emit(change: Partial<PlayerState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener(this.state);
  }

  onStateChange(cb: (state: PlayerState) => void) {
    this.listeners.push(cb);
    cb(this.state);
  }

  async play() {
    const tune = this.tune();
    if (!tune) return;
    if (this.paused && this.synth && this.timing) {
      this.paused = false;
      this.synth.resume();
      this.timing.start();
      this.emit({ playing: true });
      return;
    }
    this.stop();
    if (!abcjs.synth.supportsAudio()) {
      throw new Error('This browser cannot play audio.');
    }
    const synth = new abcjs.synth.CreateSynth();
    this.synth = synth;
    this.emit({ playing: true });
    try {
      const loading = await synth.init({
        visualObj: tune,
        millisecondsPerMeasure: tune.millisecondsPerMeasure() / this.state.speed,
        options: {
          soundFontUrl: sourceFile(),
          drumOff: true,
          sequenceCallback: (tracks) =>
            tracks.map((track) => track.map((note) => ({ ...note, instrument: INSTRUMENT }))),
          onEnded: () => this.ended(),
        },
      });
      // abcjs resolves even when no sample loaded, and plays silence.
      if (loading.error.length && !loading.loaded.length && !loading.cached.length) {
        throw new Error(`The piano samples could not be loaded (${loading.error[0]}).`);
      }
      await synth.prime();
    } catch (error) {
      if (this.synth === synth) this.stop();
      // abcjs rejects with plain { message } objects too.
      const message = (error as { message?: unknown })?.message;
      throw error instanceof Error ? error : new Error(String(message ?? error));
    }
    // Stopped or replaced while the samples were loading.
    if (this.synth !== synth) return;
    this.timing = new abcjs.TimingCallbacks(tune, {
      qpm: tune.getBpm() * this.state.speed,
      eventCallback: (event) => {
        this.cursor(event?.elements ?? []);
        return undefined;
      },
    });
    synth.start();
    this.timing.start();
  }

  private ended() {
    if (this.state.loop && this.synth) {
      this.timing?.stop();
      this.synth.seek(0);
      this.synth.start();
      this.timing?.start(0);
      return;
    }
    this.stop();
  }

  pause() {
    if (!this.synth || !this.state.playing) return;
    this.synth.pause();
    this.timing?.pause();
    this.paused = true;
    this.emit({ playing: false });
  }

  stop() {
    this.synth?.stop();
    this.timing?.stop();
    this.synth = null;
    this.timing = null;
    this.paused = false;
    this.cursor([]);
    if (this.state.playing) this.emit({ playing: false });
  }

  setSpeed(speed: number) {
    const wasPlaying = this.state.playing;
    this.stop();
    this.emit({ speed });
    if (wasPlaying) void this.play();
  }

  setLoop(loop: boolean) {
    this.emit({ loop });
  }
}

/** The SVG of every tune, stacked, in black on white for other programs. */
function exportSvg(src: string): string {
  const holder = document.createElement('div');
  holder.style.position = 'absolute';
  holder.style.left = '-10000px';
  document.body.appendChild(holder);
  try {
    abcjs.renderAbc(holder, src, { foregroundColor: '#000000', add_classes: false });
    const svgs = Array.from(holder.querySelectorAll('svg'));
    let y = 0;
    let width = 0;
    const parts = svgs.map((svg) => {
      const w = Number(svg.getAttribute('width')) || svg.viewBox.baseVal?.width || 0;
      const h = Number(svg.getAttribute('height')) || svg.viewBox.baseVal?.height || 0;
      svg.setAttribute('y', String(y));
      svg.removeAttribute('role');
      y += h;
      width = Math.max(width, w);
      return svg.outerHTML;
    });
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}">`,
      `<rect width="100%" height="100%" fill="#ffffff"/>`,
      ...parts,
      '</svg>',
    ].join('\n');
  } finally {
    holder.remove();
  }
}

async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // Twice the size, for a sharp print.
    const canvas = document.createElement('canvas');
    canvas.width = image.width * 2;
    canvas.height = image.height * 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas available.');
    context.scale(2, 2);
    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed.'))))
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function mountAbc(el: HTMLElement, opts: RenderOpts): Promise<EngineInstance> {
  let theme: ThemeColors = opts.theme;
  let zoom = opts.zoom;
  let src = '';
  let tunes: TuneObject[] = [];
  let onClick: ((range: [number, number]) => void) | undefined;
  let highlighted: Element[] = [];
  let playing: Element[] = [];

  const mark = (elements: Element[], className: string) => {
    for (const element of elements) element.classList.add(className);
    return elements;
  };
  const unmark = (elements: Element[], className: string) => {
    for (const element of elements) element.classList.remove(className);
  };

  const player = new AbcPlayer(
    () => tunes[0],
    (elements) => {
      unmark(playing, PLAYING);
      playing = mark(elements.flat(), PLAYING);
    }
  );

  const draw = (): SourceError[] => {
    tunes = abcjs.renderAbc(el, src, {
      add_classes: true,
      responsive: 'resize',
      scale: zoom,
      foregroundColor: theme.foreground,
      selectionColor: theme.accent,
      clickListener: (element) => {
        if (typeof element.startChar === 'number' && typeof element.endChar === 'number') {
          // abcjs counts the space after a note as part of it.
          let end = element.endChar;
          while (end > element.startChar && /\s/.test(src[end - 1])) end--;
          onClick?.([element.startChar, end]);
        }
      },
    });
    highlighted = [];
    playing = [];
    return tunes.flatMap((tune) => parseWarnings(tune.warnings));
  };

  return {
    async render(next) {
      if (next !== src) player.stop();
      src = next;
      return { errors: draw() };
    },
    onSourceClick(cb) {
      onClick = cb;
    },
    highlight([from]) {
      unmark(highlighted, HIGHLIGHT);
      const element = tunes
        .map((tune) => tune.getElementFromChar(from))
        .find((found) => found && (found as { abselem?: unknown }).abselem) as
        { abselem?: { elemset?: SVGElement[] } } | undefined;
      highlighted = mark(element?.abselem?.elemset ?? [], HIGHLIGHT);
    },
    player,
    exportFormats: ['svg', 'png', 'midi'],
    async export(fmt: ExportFormat) {
      if (fmt === 'midi') {
        const files = abcjs.synth.getMidiFile(src, { midiOutputType: 'binary' }) as unknown as
          Uint8Array[] | Uint8Array;
        const first = Array.isArray(files) ? files[0] : files;
        return new Blob([first as BlobPart], { type: 'audio/midi' });
      }
      const svg = exportSvg(src);
      if (fmt === 'png') return svgToPng(svg);
      return new Blob([svg], { type: 'image/svg+xml' });
    },
    async transpose(text, semitones) {
      return abcjs.strTranspose(text, abcjs.parseOnly(text), semitones);
    },
    setTheme(next) {
      theme = next;
      if (src) draw();
    },
    setZoom(next) {
      zoom = next;
      if (src) draw();
    },
    destroy() {
      player.stop();
      el.innerHTML = '';
    },
  };
}
