import { detectEngine, engineById, ENGINES } from './registry';

test('lists the ABC engine', () => {
  expect(ENGINES.map((engine) => engine.id)).toContain('abc');
  expect(engineById('abc')?.label).toBe('ABC');
  expect(engineById('nope')).toBeUndefined();
});

test('detects the engine from the text, else the default, else the first', () => {
  expect(detectEngine('X:1\nK:C\nCDE')?.id).toBe('abc');
  expect(detectEngine('plain words', 'abc')?.id).toBe('abc');
  expect(detectEngine('plain words', 'unknown')).toBe(ENGINES[0]);
});
