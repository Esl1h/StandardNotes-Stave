import abcjs from 'abcjs';
import { clickPattern, mountAbc, parseWarnings, rangeTimes } from './renderer';

const theme = {
  foreground: '#111111',
  background: '#ffffff',
  neutral: '#777777',
  accent: '#0066cc',
  danger: '#cc0000',
};

test('reads line, column and message from abcjs warnings', () => {
  expect(
    parseWarnings([
      'Music Line:6:7: Unknown character ignored:  z2 y! <span style="x">Q</span> |',
      'Something else',
    ])
  ).toEqual([
    { message: 'Unknown character ignored', line: 6, column: 7 },
    { message: 'Something else', line: 1, column: 1 },
  ]);
  expect(parseWarnings(undefined)).toEqual([]);
  // Unclosed tags and entities come out as text, never as markup.
  expect(parseWarnings(['Line:1:2: Bad <<b>x</b> &amp; <img src=x onerror=y><i']).at(0)).toEqual({
    message: 'Bad <x &',
    line: 1,
    column: 2,
  });
});

test('renders a tune and reports its errors', async () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const instance = await mountAbc(el, { theme, zoom: 1 });

  const ok = await instance.render('X:1\nT:Air\nK:C\nCDEF|]\n');
  expect(ok.errors).toEqual([]);
  expect(el.querySelector('svg')).not.toBeNull();

  const bad = await instance.render('X:1\nK:C\nCD Q EF|]\n');
  expect(bad.errors).toEqual([expect.objectContaining({ line: 3, column: 4 })]);

  instance.destroy();
  expect(el.innerHTML).toBe('');
});

test('draws a title as text, never as markup', async () => {
  const el = document.createElement('div');
  const instance = await mountAbc(el, { theme, zoom: 1 });

  await instance.render('X:1\nT:<img src=x onerror="window.pwned=1">\nK:C\nC|]\n');

  expect(el.querySelector('img')).toBeNull();
  expect(el.textContent).toContain('<img');
});

test('transposes the source', async () => {
  const instance = await mountAbc(document.createElement('div'), { theme, zoom: 1 });

  expect(await instance.transpose!('X:1\nK:C\nCDE|]\n', 2)).toBe('X:1\nK:D\nDEF|]\n');
});

test('exports MIDI and SVG', async () => {
  const instance = await mountAbc(document.createElement('div'), { theme, zoom: 1 });
  await instance.render('X:1\nT:Air\nK:C\nCDEF|]\n');

  const midi = await instance.export!('midi');
  const bytes = new Uint8Array(await midi.arrayBuffer());
  expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
  expect(midi.type).toBe('audio/midi');

  const svg = await (await instance.export!('svg')).text();
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(svg).toContain('#000000');
});

test('reports the source range of a clicked note and highlights from the source', async () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const instance = await mountAbc(el, { theme, zoom: 1 });
  const src = 'X:1\nK:C\nCDEF|]\n';
  await instance.render(src);

  instance.highlight!([src.indexOf('E'), src.indexOf('E')]);
  expect(el.querySelectorAll('.stave-highlight').length).toBeGreaterThan(0);

  instance.highlight!([0, 0]);
  expect(el.querySelectorAll('.stave-highlight')).toHaveLength(0);
});

describe('the player', () => {
  test('reports its state and keeps speed and loop', async () => {
    const instance = await mountAbc(document.createElement('div'), { theme, zoom: 1 });
    const states: unknown[] = [];
    instance.player!.onStateChange((state) => states.push(state));

    instance.player!.setLoop(true);
    instance.player!.setSpeed(0.5);

    expect(states.at(-1)).toEqual({
      playing: false,
      speed: 0.5,
      loop: true,
      metronome: false,
      countIn: false,
    });
  });

  test('says so when the browser cannot play audio', async () => {
    const instance = await mountAbc(document.createElement('div'), { theme, zoom: 1 });
    await instance.render('X:1\nK:C\nC|]\n');

    // jsdom has no Web Audio.
    await expect(instance.player!.play()).rejects.toThrow('cannot play audio');
    instance.player!.pause();
    instance.player!.stop();
  });

  test('clicks every beat of the meter, the first accented', () => {
    expect(clickPattern(4)).toBe('dddd 96 91 91 91 110 70 70 70');
    expect(clickPattern(3)).toBe('ddd 96 91 91 110 70 70');
    expect(clickPattern(0)).toBe('dddd 96 91 91 91 110 70 70 70');
  });

  test('asks abcjs for a metronome and a count-in bar', async () => {
    const inits: Array<{ options: { drum?: string; drumIntro?: number; drumOff?: boolean } }> = [];
    vi.spyOn(abcjs.synth, 'supportsAudio').mockReturnValue(true);
    vi.spyOn(abcjs.synth, 'CreateSynth').mockImplementation(function () {
      return {
        init: async (params: (typeof inits)[number]) => {
          inits.push(params);
          return { cached: [], loaded: ['C4'], error: [] };
        },
        prime: vi.fn(async () => ({ status: 'ok', duration: 1 })),
        start: vi.fn(),
        stop: vi.fn(),
        pause: vi.fn(),
      } as never;
    });
    const instance = await mountAbc(document.createElement('div'), { theme, zoom: 1 });
    await instance.render('X:1\nM:3/4\nK:C\nCDE|]\n');
    const states: Array<{ metronome?: boolean; countIn?: boolean }> = [];
    instance.player!.onStateChange((state) => states.push(state));

    await instance.player!.play();
    expect(inits.at(-1)!.options).toMatchObject({ drum: '', drumIntro: 0 });

    instance.player!.setCountIn!(true);
    await instance.player!.play();
    expect(inits.at(-1)!.options).toMatchObject({
      drum: clickPattern(3),
      drumIntro: 1,
      drumOff: true,
    });

    instance.player!.setMetronome!(true);
    await instance.player!.play();
    expect(inits.at(-1)!.options).toMatchObject({ drumIntro: 1, drumOff: false });
    expect(states.at(-1)).toMatchObject({ metronome: true, countIn: true });
    instance.player!.pause();
    instance.player!.stop();
    vi.restoreAllMocks();
  });

  test('fails and stops when no sample could be loaded', async () => {
    vi.spyOn(abcjs.synth, 'supportsAudio').mockReturnValue(true);
    vi.spyOn(abcjs.synth, 'CreateSynth').mockImplementation(function () {
      return {
        init: async () => ({ cached: [], loaded: [], error: ['C4'] }),
        prime: vi.fn(),
        stop: vi.fn(),
      } as never;
    });
    const instance = await mountAbc(document.createElement('div'), { theme, zoom: 1 });
    await instance.render('X:1\nK:C\nC|]\n');
    const states: Array<{ playing: boolean }> = [];
    instance.player!.onStateChange((state) => states.push(state));

    await expect(instance.player!.play()).rejects.toThrow('samples could not be loaded (C4)');
    expect(states.at(-1)?.playing).toBe(false);
    vi.restoreAllMocks();
  });

  test('does nothing before a tune is drawn', async () => {
    const instance = await mountAbc(document.createElement('div'), { theme, zoom: 1 });
    await expect(instance.player!.play()).resolves.toBeUndefined();
  });
});

test('redraws with a new theme and zoom', async () => {
  const el = document.createElement('div');
  const instance = await mountAbc(el, { theme, zoom: 1 });
  await instance.render('X:1\nK:C\nC|]\n');

  instance.setTheme({ ...theme, foreground: '#abcdef' });
  instance.setZoom!(1.5);

  expect(el.innerHTML).toContain('#abcdef');
});

test('lays out one system across, and pages again', async () => {
  const el = document.createElement('div');
  const instance = await mountAbc(el, { theme, zoom: 1, layout: 'horizontal' });
  // Two sections around a text line, each one line; on a page, two each.
  await instance.render('X:1\nL:1/4\nK:C\nCDEF|\nGABc|\n%%text a line of text\nCDEF|\nGABc|]\n');
  expect(el.querySelector('.abcjs-l2')).not.toBeNull();
  expect(el.querySelector('.abcjs-l3')).toBeNull();
  expect(el.classList.contains('layout-horizontal')).toBe(true);

  instance.setLayout!('page');
  expect(el.querySelector('.abcjs-l4')).not.toBeNull();
  expect(el.classList.contains('layout-horizontal')).toBe(false);
});

test('times the notes written in a source range', () => {
  const el = document.createElement('div');
  // A quarter note lasts 500 ms at this tempo.
  const src = 'X:1\nL:1/4\nQ:1/4=120\nK:C\nCDEF|GABc|]\n';
  const [tune] = abcjs.renderAbc(el, src, { add_classes: true });
  const timings = new abcjs.TimingCallbacks(tune, {}).noteTimings;
  const at = (text: string) => src.indexOf(text);

  expect(rangeTimes(timings, [at('EF'), at('F|') + 1])).toEqual({ start: 1000, end: 2000 });
  expect(rangeTimes(timings, [at('c|'), at('c|') + 1])).toEqual({ start: 3500, end: 4000 });
  expect(rangeTimes(timings, [0, at('CDEF')])).toBeUndefined();
});
