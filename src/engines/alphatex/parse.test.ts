import * as alphaTab from '@coderline/alphatab';
import { parse } from './parse';

const HEADER = '\\title "Test"\n\\track "Guitar"\n\\staff {score tabs}\n';

test('reads the score and the source range of every beat', () => {
  const src = `${HEADER}3.3.4 (0.1 2.2).8*2 | r.2`;
  const { score, errors, ranges } = parse(src, new alphaTab.Settings());

  expect(errors).toEqual([]);
  expect(score?.title).toBe('Test');
  const beats = score!.tracks[0].staves[0].bars.flatMap((bar) => bar.voices[0].beats);
  expect(beats.map((beat) => src.slice(...ranges.get(beat)!))).toEqual([
    '3.3.4',
    '(0.1 2.2).8*2',
    '(0.1 2.2).8*2',
    'r.2',
  ]);
});

test('reports errors with a range, even where alphaTab points at a place', () => {
  const src = `${HEADER}3.3.4 5.9`;
  const { score, errors } = parse(src, new alphaTab.Settings());

  expect(score).toBeUndefined();
  expect(errors).toEqual([
    expect.objectContaining({ line: 4, from: src.indexOf('.9'), to: src.indexOf('.9') + 1 }),
  ]);
});

test('reports hints as nothing and a source it cannot read as an error', () => {
  expect(parse(`${HEADER}. 3.3.4`, new alphaTab.Settings()).errors).toEqual([]);
  expect(parse('(', new alphaTab.Settings()).errors.length).toBeGreaterThan(0);
});
