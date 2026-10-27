import abcjs, {
  type MidiBuffer,
  type NoteTimingEvent,
  type TimingCallbacks,
  type TuneObject,
} from 'abcjs';
import {
  type EngineInstance,
  type ExportFormat,
  type Layout,
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
const HIGHLIGHT = 'stave-highlight';
// Metronome clicks: abcjs plays them as a drum track, and every track plays
// on the piano, so these are high piano notes, the first beat higher.
const CLICK_ACCENT = 96;
const CLICK = 91;
const PLAYING = 'stave-playing';
// About the width abcjs gives a bar on a page.
const BAR_WIDTH = 150;

const barsIn = (tune: TuneObject) =>
  Math.max(
    0,
    ...tune.lines.flatMap((line) =>
      (line.staff ?? []).flatMap((staff) =>
        (staff.voices ?? []).map((voice) => voice.filter((el) => el.el_type === 'bar').length)
      )
    )
  );

/**
 * abcjs options for one long system. lineBreaks lists, for each section of
 * a tune (music between text lines), the bars to end a line on; none, and
 * the section is one line. A section needs a line of source at least.
 * abcjs fits the line in staffwidth, so it grows with the bars.
 */
function horizontal(src: string) {
  // Typed as number[] in abcjs 6, read as one list per section.
  const lineBreaks = src.split('\n').map(() => []) as unknown as number[];
  const bars = Math.max(1, ...abcjs.parseOnly(src, { lineBreaks }).map(barsIn));
  return { lineBreaks, staffwidth: bars * BAR_WIDTH };
}

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

// General MIDI program 0, the acoustic grand piano: the only instrument
// shipped (docs/adr/0014), so every track and the percussion play on it.
const PIANO = 0;

/**
 * The tune as abcjs's synth sees it, with every program set to the piano.
 * The synth picks the samples to load from the sequence setUpAudio builds,
 * before any callback could change it, so the change goes there.
 */
function onPiano(tune: TuneObject): TuneObject {
  return Object.create(tune, {
    setUpAudio: {
      value: (params: Parameters<TuneObject['setUpAudio']>[0]) => {
        const sequence = tune.setUpAudio(params);
        for (const track of sequence.tracks) {
          for (const event of track as Array<{ cmd?: string; instrument?: number }>) {
            if (event.cmd === 'program' || event.instrument !== undefined) {
              event.instrument = PIANO;
            }
          }
        }
        return sequence;
      },
    },
  }) as TuneObject;
}

/** An abcjs drum pattern with a click on every beat of the meter, the first accented. */
export function clickPattern(beats: number): string {
  const count = Math.max(1, Math.round(beats) || 4);
  const rest = Array.from({ length: count - 1 });
  return [
    'd'.repeat(count),
    [CLICK_ACCENT, ...rest.map(() => CLICK)].join(' '),
    [110, ...rest.map(() => 70)].join(' '),
  ].join(' ');
}

/**
 * When the music written in a source range plays, in milliseconds from the
 * start: from its first note to the next note after its last one, or the
 * end. Undefined when the range holds no note.
 */
export function rangeTimes(
  timings: NoteTimingEvent[],
  [from, to]: [number, number]
): { start: number; end: number } | undefined {
  const inRange = (event: NoteTimingEvent) =>
    (event.startCharArray ?? [event.startChar ?? -1]).some((char) => char >= from && char < to);
  const events = timings.filter((event) => event.type === 'event');
  const chosen = events.filter(inRange);
  if (!chosen.length) return undefined;
  const start = Math.min(...chosen.map((event) => event.milliseconds));
  const last = Math.max(...chosen.map((event) => event.milliseconds));
  const next = events.find((event) => event.milliseconds > last);
  const end = next?.milliseconds ?? timings[timings.length - 1]?.milliseconds ?? last;
  return { start, end };
}

class AbcPlayer implements Player {
  private synth: MidiBuffer | null = null;
  private timing: TimingCallbacks | null = null;
  private state: PlayerState = {
    playing: false,
    speed: 1,
    loop: false,
    metronome: false,
    countIn: false,
  };
  private listeners: Array<(state: PlayerState) => void> = [];
  private paused = false;
  // The cursor waits out the count-in bar, which abcjs's timing does not know.
  private introTimer: ReturnType<typeof setTimeout> | undefined;
  private introEnds = 0;
  private introLeft = 0;
  // The part of the tune a range plays, from rangeTimes.
  private window: { start: number; end: number } | undefined;

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
      if (this.introLeft > 0) this.startTiming(this.introLeft);
      else this.timing.start();
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
        visualObj: onPiano(tune),
        millisecondsPerMeasure: tune.millisecondsPerMeasure() / this.state.speed,
        options: {
          soundFontUrl: sourceFile(),
          // What abcjs uses for these same samples from its default URL.
          soundFontVolumeMultiplier: 3,
          drum:
            this.state.metronome || this.state.countIn
              ? clickPattern(tune.getMeterFraction().num)
              : '',
          // A range starts in the middle of the audio, after any intro.
          drumIntro: this.state.countIn && !this.state.range ? 1 : 0,
          // Off after the intro: a count-in without the metronome.
          drumOff: !this.state.metronome,
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
        if (this.window && event && event.milliseconds >= this.window.end) {
          this.ended();
          return undefined;
        }
        this.cursor(event?.elements ?? []);
        return undefined;
      },
    });
    this.window = this.state.range && rangeTimes(this.timing.noteTimings, this.state.range);
    if (this.window) {
      synth.seek(this.window.start / 1000, 'seconds');
      synth.start();
      this.timing.start(this.window.start / 1000, 'seconds');
      return;
    }
    synth.start();
    this.startTiming(this.introLength(tune));
  }

  private introLength(tune: TuneObject) {
    return this.state.countIn && !this.state.range
      ? tune.millisecondsPerMeasure() / this.state.speed
      : 0;
  }

  private startTiming(delay: number) {
    clearTimeout(this.introTimer);
    this.introLeft = 0;
    if (delay <= 0) {
      this.timing?.start(0);
      return;
    }
    this.introEnds = performance.now() + delay;
    this.introTimer = setTimeout(() => this.timing?.start(0), delay);
  }

  private ended() {
    const tune = this.tune();
    if (this.state.loop && this.synth && this.window) {
      this.synth.seek(this.window.start / 1000, 'seconds');
      this.timing?.setProgress(this.window.start / 1000, 'seconds');
      return;
    }
    if (this.state.loop && this.synth && tune) {
      this.timing?.stop();
      this.synth.seek(0);
      this.synth.start();
      this.startTiming(this.introLength(tune));
      return;
    }
    this.stop();
  }

  pause() {
    if (!this.synth || !this.state.playing) return;
    this.synth.pause();
    this.timing?.pause();
    clearTimeout(this.introTimer);
    this.introLeft = Math.max(0, this.introEnds - performance.now());
    this.paused = true;
    this.emit({ playing: false });
  }

  stop() {
    clearTimeout(this.introTimer);
    this.introEnds = 0;
    this.introLeft = 0;
    this.synth?.stop();
    this.timing?.stop();
    this.synth = null;
    this.timing = null;
    this.window = undefined;
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

  // Both change the audio abcjs prepares, so a running tune starts over.
  setMetronome(metronome: boolean) {
    this.restartWith({ metronome });
  }

  setCountIn(countIn: boolean) {
    this.restartWith({ countIn });
  }

  setRange(range: [number, number] | null) {
    this.restartWith({ range: range ?? undefined });
  }

  private restartWith(change: Partial<PlayerState>) {
    const wasPlaying = this.state.playing;
    this.stop();
    this.emit(change);
    if (wasPlaying) void this.play();
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
  let layout: Layout = opts.layout ?? 'page';
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
    // abcjs sizes its parent to the pane and hides what overflows.
    el.classList.toggle('layout-horizontal', layout === 'horizontal');
    tunes = abcjs.renderAbc(el, src, {
      add_classes: true,
      scale: zoom,
      ...(layout === 'horizontal' ? horizontal(src) : { responsive: 'resize' }),
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
      if (next !== src) {
        player.stop();
        // Offsets into the old text mean nothing in the new one.
        player.setRange(null);
      }
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
    setLayout(next) {
      if (next === layout) return;
      layout = next;
      if (src) draw();
    },
    destroy() {
      player.stop();
      el.innerHTML = '';
    },
  };
}
