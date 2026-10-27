import * as alphaTab from '@coderline/alphatab';
import {
  type EngineInstance,
  type ExportFormat,
  type Layout,
  type Player,
  type PlayerState,
  type RenderOpts,
  type ThemeColors,
  type ViewDef,
} from '../../core/engine';
import { parse, type Parsed } from './parse';
import { transposeAlphaTex } from './syntax';
import threadUrl from './player-thread?worker&url';

/**
 * The alphaTex renderer and player, loaded on demand (docs/adr/0009).
 * alphaTab parses the text here, on the main thread, so its diagnostics and
 * the source range of every beat are at hand; it draws SVG into the pane
 * and plays through its own worker and audio worklet with the SoundFont
 * shipped in the build (docs/adr/0011).
 */

// Paths relative to the page, never a CDN; vite.config.ts copies the files.
const FONT = 'font/Bravura.woff2';
const SOUNDFONT = 'soundfont/sonivox.sf3';
const HIGHLIGHT = 'stave-beat-marker';
// A Play that never gets ready: no worker, or a SoundFont that never loads.
const PLAYER_TIMEOUT_MS = 30_000;

export const VIEWS: ViewDef[] = [
  { id: 'both', label: 'Score and tab' },
  { id: 'score', label: 'Score' },
  { id: 'tab', label: 'Tab' },
];

const PROFILES: Record<string, alphaTab.StaveProfile> = {
  both: alphaTab.StaveProfile.Default,
  score: alphaTab.StaveProfile.Score,
  tab: alphaTab.StaveProfile.Tab,
};

const LAYOUTS: Record<Layout, alphaTab.LayoutMode> = {
  page: alphaTab.LayoutMode.Page,
  horizontal: alphaTab.LayoutMode.Horizontal,
};

const url = (path: string) => new URL(path, document.baseURI).href;

// alphaTab draws at about twice the size of abcjs; at this scale a staff
// of either engine looks the same at the same zoom.
const BASE_SCALE = 0.6;

/**
 * How alphaTab starts its player (docs/adr/0015). Inside the Standard Notes
 * iframe the page has an opaque origin: it may not start a worker from the
 * plugin's URL, and a worker started from a blob has an opaque origin too,
 * so it may not import that URL either, nor run as a module. The worker
 * runs as a classic script from a blob of its whole code, fetched by the
 * page before Play. The audio worklet is added by the page, which may load
 * it.
 */
let workerSource: string | undefined;

async function loadWorkerSource(): Promise<void> {
  if (workerSource) return;
  const response = await fetch(url(threadUrl));
  if (!response.ok) throw new Error(`The player could not be loaded (${response.status}).`);
  workerSource = await response.text();
}

alphaTab.Environment.initializeMain(
  () => {
    if (!workerSource) throw new Error('The player worker is not loaded.');
    const blob = new Blob([workerSource], { type: 'text/javascript' });
    return new Worker(URL.createObjectURL(blob));
  },
  (context) => context.audioWorklet.addModule(url(threadUrl))
);

/** Any CSS color as rgb()/rgba(), the forms alphaTab reads. */
function cssColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.color = color;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return /^rgba?\(/.test(resolved) ? resolved : '#000000';
}

const resources = (theme: ThemeColors) => {
  const foreground = cssColor(theme.foreground);
  const neutral = cssColor(theme.neutral);
  return {
    mainGlyphColor: foreground,
    scoreInfoColor: foreground,
    barSeparatorColor: foreground,
    secondaryGlyphColor: neutral,
    staffLineColor: neutral,
    barNumberColor: neutral,
  };
};

/** Waits for the first of two events, with a time limit. */
function once<T>(
  event: alphaTab.IEventEmitterOfT<T> | alphaTab.IEventEmitter,
  failure: alphaTab.IEventEmitterOfT<Error>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      offEvent();
      offFailure();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    const offEvent = (event as alphaTab.IEventEmitter).on(() => {
      done();
      resolve();
    });
    const offFailure = failure.on((error) => {
      done();
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

class AlphaTexPlayer implements Player {
  private state: PlayerState = {
    playing: false,
    speed: 1,
    loop: false,
    tracks: [],
    metronome: false,
    countIn: false,
  };
  private listeners: Array<(state: PlayerState) => void> = [];

  constructor(private api: alphaTab.AlphaTabApi) {
    api.playerStateChanged.on((event) => this.emit({ playing: event.state === 1 }));
    api.playerFinished.on(() => {
      if (!this.state.loop) this.emit({ playing: false });
    });
  }

  emit(change: Partial<PlayerState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener(this.state);
  }

  onStateChange(cb: (state: PlayerState) => void) {
    this.listeners.push(cb);
    cb(this.state);
  }

  /** The tracks of a new score, unmuted; alphaTab resets them on load. */
  setScore(score: alphaTab.model.Score) {
    this.emit({
      playing: false,
      tracks: score.tracks.map((track) => ({ name: track.name, muted: false, solo: false })),
    });
  }

  async play() {
    const { api } = this;
    if (!api.score) return;
    // The SoundFont (1 MB) loads on the first Play, not when a note opens.
    if (api.actualPlayerMode === alphaTab.PlayerMode.Disabled) {
      await loadWorkerSource();
      api.settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
      api.settings.player.soundFont = url(SOUNDFONT);
      api.updateSettings();
      if (!api.player) {
        api.settings.player.playerMode = alphaTab.PlayerMode.Disabled;
        api.updateSettings();
        throw new Error('This browser cannot start the player (Web Workers and Web Audio).');
      }
    }
    if (!api.isReadyForPlayback) {
      this.emit({ playing: true });
      try {
        await once(api.playerReady, api.error, PLAYER_TIMEOUT_MS, 'The player did not start.');
      } catch (error) {
        this.emit({ playing: false });
        throw error;
      }
    }
    api.playbackSpeed = this.state.speed;
    api.isLooping = this.state.loop;
    this.applyClicks();
    if (!api.play()) {
      this.emit({ playing: false });
      throw new Error('The player is not ready.');
    }
  }

  pause() {
    this.api.pause();
  }

  stop() {
    if (this.api.player) this.api.stop();
    if (this.state.playing) this.emit({ playing: false });
  }

  setSpeed(speed: number) {
    this.api.playbackSpeed = speed;
    this.emit({ speed });
  }

  setLoop(loop: boolean) {
    this.api.isLooping = loop;
    this.emit({ loop });
  }

  /** alphaTab plays a click and a count-in when their volume is above zero. */
  private applyClicks() {
    if (!this.api.player) return;
    this.api.metronomeVolume = this.state.metronome ? 1 : 0;
    this.api.countInVolume = this.state.countIn ? 1 : 0;
  }

  setMetronome(metronome: boolean) {
    this.emit({ metronome });
    this.applyClicks();
  }

  setCountIn(countIn: boolean) {
    this.emit({ countIn });
    this.applyClicks();
  }

  private setTrack(index: number, change: { muted?: boolean; solo?: boolean }) {
    const track = this.api.score?.tracks[index];
    if (!track) return;
    if (change.muted !== undefined) this.api.changeTrackMute([track], change.muted);
    if (change.solo !== undefined) this.api.changeTrackSolo([track], change.solo);
    this.emit({
      tracks: (this.state.tracks ?? []).map((state, i) =>
        i === index ? { ...state, ...change } : state
      ),
    });
  }

  setTrackMute(index: number, muted: boolean) {
    this.setTrack(index, { muted });
  }

  setTrackSolo(index: number, solo: boolean) {
    this.setTrack(index, { solo });
  }
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

/**
 * The rendered score as one SVG, in black on white for other programs. The
 * music font goes inside it: an SVG file cannot reach the plugin's files.
 */
async function exportSvg(surface: HTMLElement): Promise<string> {
  const font = new Uint8Array(await (await fetch(url(FONT))).arrayBuffer());
  const box = surface.getBoundingClientRect();
  const parts = Array.from(surface.querySelectorAll('svg')).map((svg) => {
    const rect = svg.getBoundingClientRect();
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('x', String(rect.left - box.left));
    copy.setAttribute('y', String(rect.top - box.top));
    copy.removeAttribute('style');
    return copy.outerHTML;
  });
  const width = Math.ceil(surface.scrollWidth);
  const height = Math.ceil(surface.scrollHeight);
  const fontFamily = getComputedStyle(surface).getPropertyValue('--at-font-family').trim();
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<style>@font-face{font-family:${fontFamily || 'alphaTab'};src:url(data:font/woff2;base64,${toBase64(font)}) format('woff2')}svg{color:#000}</style>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}

async function svgToPng(svg: string): Promise<Blob> {
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = source;
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
    URL.revokeObjectURL(source);
  }
}

function exportMidi(score: alphaTab.model.Score, settings: alphaTab.Settings): Blob {
  const midi = new alphaTab.midi.MidiFile();
  // Standard MIDI files: per-note bends (MIDI 2.0) become channel bends.
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);
  new alphaTab.midi.MidiFileGenerator(score, settings, handler).generate();
  return new Blob([midi.toBinary() as BlobPart], { type: 'audio/midi' });
}

export async function mountAlphaTex(el: HTMLElement, opts: RenderOpts): Promise<EngineInstance> {
  let theme = opts.theme;
  let view = PROFILES[opts.view ?? ''] !== undefined ? (opts.view as string) : VIEWS[0].id;
  let parsed: Parsed = { errors: [], ranges: new Map() };
  let onClick: ((range: [number, number]) => void) | undefined;

  const api = new alphaTab.AlphaTabApi(el, {
    core: {
      engine: 'svg',
      // Small scores draw faster here than through a second copy of
      // alphaTab in a worker; the player still runs in one.
      useWorkers: false,
      enableLazyLoading: false,
      smuflFontSources: new Map([[alphaTab.FontFileFormat.Woff2, url(FONT)]]),
      logLevel: alphaTab.LogLevel.None,
    },
    display: {
      scale: opts.zoom * BASE_SCALE,
      // The pane has a padding of its own.
      padding: [8, 8],
      layoutMode: LAYOUTS[opts.layout ?? 'page'],
      staveProfile: PROFILES[view],
      resources: resources(theme),
    },
    notation: {
      // The track names and tunings above the first system overlap each
      // other in alphaTab 1.8.4; each staff already names its track, and the
      // source states any tuning.
      elements: new Map([[alphaTab.NotationElement.GuitarTuning, false]]),
    },
    player: {
      playerMode: alphaTab.PlayerMode.Disabled,
      enableCursor: true,
      enableUserInteraction: false,
      scrollMode: alphaTab.ScrollMode.Off,
    },
  });
  const player = new AlphaTexPlayer(api);

  let rendered: (() => void) | undefined;
  api.postRenderFinished.on(() => rendered?.());
  const draw = () =>
    new Promise<void>((resolve) => {
      rendered = resolve;
      api.render();
    });

  // On release, as a click: the press itself would take the focus back from
  // the source after onClick gives it to it.
  api.beatMouseUp.on((beat) => {
    const range = beat && parsed.ranges.get(beat);
    if (range) onClick?.(range);
  });

  const marker = document.createElement('div');
  marker.className = HIGHLIGHT;
  marker.hidden = true;

  return {
    async render(src) {
      parsed = parse(src, api.settings);
      if (parsed.score) {
        player.stop();
        await new Promise<void>((resolve) => {
          rendered = resolve;
          api.renderScore(
            parsed.score as alphaTab.model.Score,
            parsed.score?.tracks.map((track) => track.index)
          );
        });
        player.setScore(parsed.score);
      }
      return { errors: parsed.errors };
    },
    onSourceClick(cb) {
      onClick = cb;
    },
    highlight([from]) {
      marker.hidden = true;
      const lookup = api.boundsLookup;
      if (!lookup) return;
      for (const [beat, [start, end]] of parsed.ranges) {
        if (from < start || from > end) continue;
        const bounds = lookup.findBeat(beat)?.visualBounds;
        if (!bounds) return;
        const surface = el.querySelector('.at-surface');
        if (!surface) return;
        Object.assign(marker.style, {
          left: `${bounds.x}px`,
          top: `${bounds.y}px`,
          width: `${bounds.w}px`,
          height: `${bounds.h}px`,
        });
        marker.hidden = false;
        if (marker.parentElement !== surface) surface.appendChild(marker);
        return;
      }
    },
    player,
    exportFormats: ['svg', 'png', 'midi', 'gp7'],
    async export(fmt: ExportFormat) {
      const score = api.score;
      if (!score) throw new Error('Nothing to export yet.');
      if (fmt === 'midi') return exportMidi(score, api.settings);
      if (fmt === 'gp7') {
        const bytes = new alphaTab.exporter.Gp7Exporter().export(score, api.settings);
        return new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
      }
      const surface = el.querySelector<HTMLElement>('.at-surface');
      if (!surface) throw new Error('Nothing to export yet.');
      // Black on white, whatever the theme, then back.
      setResources(resources({ ...theme, foreground: '#000000', neutral: '#000000' }));
      await draw();
      try {
        const svg = await exportSvg(surface);
        if (fmt === 'png') return svgToPng(svg);
        return new Blob([svg], { type: 'image/svg+xml' });
      } finally {
        setResources(resources(theme));
        await draw();
      }
    },
    async transpose(text, semitones) {
      return transposeAlphaTex(text, semitones);
    },
    setTheme(next) {
      theme = next;
      setResources(resources(theme));
      if (api.score) void draw();
    },
    setZoom(next) {
      api.settings.display.scale = next * BASE_SCALE;
      api.updateSettings();
      if (api.score) void draw();
    },
    views: VIEWS,
    setView(id) {
      if (PROFILES[id] === undefined) return;
      view = id;
      api.settings.display.staveProfile = PROFILES[view];
      api.updateSettings();
      if (api.score) void draw();
    },
    setLayout(layout) {
      if (api.settings.display.layoutMode === LAYOUTS[layout]) return;
      api.settings.display.layoutMode = LAYOUTS[layout];
      api.updateSettings();
      if (api.score) void draw();
    },
    destroy() {
      player.stop();
      api.destroy();
      el.innerHTML = '';
    },
  };

  function setResources(colors: ReturnType<typeof resources>) {
    const target = api.settings.display.resources as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(colors)) {
      target[key] = alphaTab.model.Color.fromJson(value);
    }
  }
}
