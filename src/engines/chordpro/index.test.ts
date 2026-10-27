import { chordProEngine } from '.';
import { parseChordPro } from './syntax';

test('the template is valid ChordPro that the engine detects', () => {
  const template = chordProEngine.template();
  expect(chordProEngine.detect(template)).toBe(true);
  expect(chordProEngine.title(template)).toBe('Untitled');
  expect(parseChordPro(template).errors).toEqual([]);
});

test('the example is valid ChordPro that the engine detects', () => {
  const example = chordProEngine.example!();
  expect(chordProEngine.detect(example)).toBe(true);
  expect(chordProEngine.title(example)).toBe('Morning on the Stave');
  expect(parseChordPro(example).errors).toEqual([]);
});

test('every tool writes valid ChordPro after the template', () => {
  for (const tool of chordProEngine.tools()) {
    const src = chordProEngine.template();
    const edit = chordProEngine.emit(tool.cmd, { src, from: src.length, to: src.length });
    const next = src.slice(0, edit.from) + edit.insert + src.slice(edit.to);
    expect([tool.id, parseChordPro(next).errors]).toEqual([tool.id, []]);
    expect(tool.label).not.toBe('');
    expect(tool.glyph).toBeTruthy();
  }
});

test('the cheat sheet examples parse', () => {
  for (const section of chordProEngine.cheatsheet()) {
    for (const row of section.rows) {
      // A section shown by its start alone is closed here.
      let src = row.syntax.replace(/\} \{/g, '}\n{');
      const start = /\{start_of_(\w+)/.exec(src);
      if (start && !src.includes(`{end_of_${start[1]}}`)) src += `\n{end_of_${start[1]}}`;
      expect([row.syntax, parseChordPro(src).errors]).toEqual([row.syntax, []]);
    }
  }
});
