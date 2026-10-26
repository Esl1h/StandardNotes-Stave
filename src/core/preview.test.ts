import fc from 'fast-check';
import { type Engine } from './engine';
import { notePreview, PREVIEW_LIMIT, truncatePreview } from './preview';

const fakeEngine = {
  label: 'ABC',
  detect: (src: string) => src.startsWith('X:'),
  title: (src: string) => /^T:(.*)$/m.exec(src)?.[1].trim() || undefined,
} as unknown as Engine;

test('shows the title and the notation of a piece', () => {
  expect(notePreview('X:1\nT: Air\nK:C\nCDE|', fakeEngine)).toBe('Air · ABC');
});

test('shows the start of the text when there is no title', () => {
  expect(notePreview('X:1\nK:C\nCDE|', fakeEngine)).toBe('X:1 K:C CDE|');
  expect(notePreview('some words', fakeEngine)).toBe('some words');
  expect(notePreview('some words', undefined)).toBe('some words');
});

test('is never empty and never longer than the limit', () => {
  fc.assert(
    fc.property(fc.string(), (text) => {
      const preview = truncatePreview(text);
      expect(preview.length).toBeGreaterThan(0);
      expect(preview.length).toBeLessThanOrEqual(PREVIEW_LIMIT);
    })
  );
});
