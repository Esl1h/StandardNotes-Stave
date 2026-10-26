import { mountAbc, parseWarnings } from './renderer';

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

    expect(states.at(-1)).toEqual({ playing: false, speed: 0.5, loop: true });
  });

  test('says so when the browser cannot play audio', async () => {
    const instance = await mountAbc(document.createElement('div'), { theme, zoom: 1 });
    await instance.render('X:1\nK:C\nC|]\n');

    // jsdom has no Web Audio.
    await expect(instance.player!.play()).rejects.toThrow('cannot play audio');
    instance.player!.pause();
    instance.player!.stop();
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
