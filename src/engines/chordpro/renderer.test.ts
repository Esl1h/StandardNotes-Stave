import { readFileSync } from 'node:fs';
import { mountChordPro } from './renderer';

const theme = {
  foreground: '#111111',
  background: '#ffffff',
  neutral: '#777777',
  accent: '#0066cc',
  danger: '#cc0000',
};

const EXAMPLE = readFileSync('examples/chordpro.pro', 'utf8');

const mount = async () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return { el, instance: await mountChordPro(el, { theme, zoom: 1 }) };
};

test('draws the title, facts, sections and chords over the lyrics', async () => {
  const { el, instance } = await mount();
  const { errors } = await instance.render(EXAMPLE);

  expect(errors).toEqual([]);
  expect(el.querySelector('h1')?.textContent).toBe('Morning on the Stave');
  expect(el.querySelector('.cp-facts')?.textContent).toBe('Key G · Capo 2 · Tempo 110 · Time 4/4');
  expect(el.querySelectorAll('.cp-chorus').length).toBe(1);
  expect(el.querySelector('.cp-verse .cp-label')?.textContent).toBe('Verse 1');
  expect(el.querySelector('.cp-tab .cp-raw')?.textContent).toMatch(/^e\|/);
  const first = el.querySelector('.cp-verse .cp-line .cp-seg');
  expect(first?.querySelector('.cp-chord')?.textContent).toBe('G');
  expect(first?.querySelector('.cp-lyric')?.textContent).toBe('Morning comes on the ');
});

test('puts the text of the note in as text, never as markup', async () => {
  const { el, instance } = await mount();
  await instance.render('{title: <img src=x onerror=alert(1)>}\n[<b>G</b>]la');

  expect(el.querySelector('img, b')).toBeNull();
  expect(el.querySelector('h1')?.textContent).toBe('<img src=x onerror=alert(1)>');
});

test('reports the source of a clicked chord and highlights from the source', async () => {
  const { el, instance } = await mount();
  const src = '{t: A}\nThe [G]sun [C]up';
  await instance.render(src);
  const clicks: Array<[number, number]> = [];
  instance.onSourceClick!((range) => clicks.push(range));

  (el.querySelectorAll('.cp-chord')[2] as HTMLElement).click();
  expect(src.slice(...clicks[0])).toBe('C');
  (el.querySelectorAll('.cp-lyric')[1] as HTMLElement).click();
  expect(src.slice(...clicks[1])).toBe('[G]sun ');

  instance.highlight!([src.indexOf('sun'), src.indexOf('sun')]);
  expect(el.querySelector('.stave-highlight')?.textContent).toBe('Gsun ');
  instance.highlight!([src.indexOf('G'), src.indexOf('G')]);
  expect(el.querySelector('.stave-highlight')?.textContent).toBe('G');
});

test('exports an SVG in black on white, and transposes the source', async () => {
  const { instance } = await mount();
  await instance.render('{title: A}\n[G]la');

  const svg = await (await instance.export!('svg')).text();
  expect(svg).toContain('<foreignObject');
  expect(svg).toContain('--cp-text: #000000');
  expect(svg).toContain('>A</h1>');
  await expect(instance.export!('png')).rejects.toThrow();
  expect(await instance.transpose!('{key: G}\n[G]la', 2)).toBe('{key: A}\n[A]la');
});

test('follows the theme and the zoom, and cleans up', async () => {
  const { el, instance } = await mount();
  await instance.render('[G]la');
  instance.setTheme({ ...theme, accent: '#abcdef' });
  instance.setZoom!(1.5);

  expect(el.style.getPropertyValue('--cp-chord')).toBe('#abcdef');
  expect(el.style.fontSize).toBe('150%');
  instance.destroy();
  expect(el.innerHTML).toBe('');
});
