import abcjs from 'abcjs';
import { abcEngine } from '.';

test('the template is valid ABC that the engine detects', () => {
  const template = abcEngine.template();
  expect(abcEngine.detect(template)).toBe(true);
  expect(abcEngine.title(template)).toBe('Untitled');
  expect(abcjs.parseOnly(template)[0].warnings ?? []).toEqual([]);
});

test('every tool writes valid ABC after the template', () => {
  for (const tool of abcEngine.tools()) {
    const src = abcEngine.template().replace(/\|\]\n$/, '');
    const edit = abcEngine.emit(tool.cmd, { src, from: src.length, to: src.length });
    const next = src.slice(0, edit.from) + edit.insert + src.slice(edit.to);
    expect([tool.id, abcjs.parseOnly(next)[0].warnings ?? []]).toEqual([tool.id, []]);
    expect(tool.label).not.toBe('');
    expect(tool.icon ?? tool.glyph).toBeTruthy();
  }
});

test('the cheat sheet examples are valid ABC', () => {
  const sections = abcEngine.cheatsheet();
  expect(sections.map((section) => section.title)).toEqual([
    'Header',
    'Notes',
    'Bars and structure',
    'Ornaments',
  ]);
  for (const row of sections.find((section) => section.title === 'Notes')!.rows) {
    const [tune] = abcjs.parseOnly(`X:1\nL:1/8\nK:C\n${row.syntax}|]\n`);
    expect([row.syntax, tune.warnings ?? []]).toEqual([row.syntax, []]);
  }
});

test('mounts the renderer on demand', async () => {
  const el = document.createElement('div');
  const instance = await abcEngine.mount(el, {
    theme: {
      foreground: '#000',
      background: '#fff',
      neutral: '#777',
      accent: '#06c',
      danger: '#c00',
    },
    zoom: 1,
  });
  expect(instance.player).toBeDefined();
  expect(instance.exportFormats).toEqual(['svg', 'png', 'midi']);
  instance.destroy();
});
