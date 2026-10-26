import { shortcutFor } from './shortcuts';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

test('digits pick the note duration outside the editor', () => {
  expect(shortcutFor(key({ code: 'Digit1', key: '1' }), false)).toEqual({ type: 'note', dur: 1 });
  expect(shortcutFor(key({ code: 'Digit3', key: '3' }), false)).toEqual({ type: 'note', dur: 4 });
  expect(shortcutFor(key({ code: 'Digit7', key: '7' }), false)).toEqual({ type: 'note', dur: 64 });
  expect(shortcutFor(key({ code: 'Digit0', key: '0' }), false)).toEqual({ type: 'rest' });
});

test('single keys type in the editor and need Alt there', () => {
  expect(shortcutFor(key({ code: 'Digit3', key: '3' }), true)).toBeNull();
  expect(shortcutFor(key({ code: 'Digit3', key: '£', altKey: true }), true)).toEqual({
    type: 'note',
    dur: 4,
  });
  expect(shortcutFor(key({ code: 'Digit3', key: '3', altKey: true }), false)).toBeNull();
});

test('dot, bar and play', () => {
  expect(shortcutFor(key({ code: 'Period', key: '.' }), false)).toEqual({ type: 'dot' });
  expect(shortcutFor(key({ code: 'Backslash', key: '|', shiftKey: true }), false)).toEqual({
    type: 'bar',
  });
  expect(shortcutFor(key({ code: 'IntlBackslash', key: '|' }), false)).toEqual({ type: 'bar' });
  expect(shortcutFor(key({ code: 'Space', key: ' ' }), false)).toEqual({ type: 'playPause' });
  expect(shortcutFor(key({ code: 'Space', key: ' ', altKey: true }), true)).toEqual({
    type: 'playPause',
  });
});

test('Ctrl shortcuts work everywhere', () => {
  for (const inEditor of [true, false]) {
    expect(shortcutFor(key({ key: 'ArrowUp', ctrlKey: true }), inEditor)).toEqual({
      type: 'transpose',
      semitones: 1,
    });
    expect(shortcutFor(key({ key: 'ArrowDown', metaKey: true }), inEditor)).toEqual({
      type: 'transpose',
      semitones: -1,
    });
    expect(
      shortcutFor(key({ code: 'KeyE', key: 'E', ctrlKey: true, shiftKey: true }), inEditor)
    ).toEqual({ type: 'export' });
    expect(
      shortcutFor(key({ code: 'KeyM', key: 'M', ctrlKey: true, shiftKey: true }), inEditor)
    ).toEqual({ type: 'toggleBars' });
    expect(shortcutFor(key({ code: 'Backslash', key: '\\', ctrlKey: true }), inEditor)).toEqual({
      type: 'toggleSplit',
    });
  }
});

test('leaves other keys alone', () => {
  expect(shortcutFor(key({ code: 'KeyA', key: 'a' }), false)).toBeNull();
  expect(shortcutFor(key({ code: 'KeyZ', key: 'z', ctrlKey: true }), true)).toBeNull();
  expect(shortcutFor(key({ code: 'Digit1', key: '!', shiftKey: true }), false)).toBeNull();
});
