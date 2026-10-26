import { ECHO_WINDOW_MS, EchoGuard } from './echoGuard';

const setup = () => {
  const clock = { t: 0 };
  const guard = new EchoGuard(() => clock.t);
  // Pins the open note, as the first stream of a note does.
  guard.isStaleEcho('n1', 'a', 'a');
  return { guard, clock };
};

test('ignores an earlier save of the same note', () => {
  const { guard } = setup();
  guard.recordSave('a');
  guard.recordSave('ab');

  expect(guard.isStaleEcho('n1', 'a', 'ab')).toBe(true);
});

test('accepts the current text', () => {
  const { guard } = setup();
  guard.recordSave('a');
  guard.recordSave('ab');

  expect(guard.isStaleEcho('n1', 'ab', 'ab')).toBe(false);
});

test('accepts text that was never saved, like a remote edit', () => {
  const { guard } = setup();
  guard.recordSave('a');
  guard.recordSave('ab');

  expect(guard.isStaleEcho('n1', 'xyz', 'ab')).toBe(false);
});

test('accepts any text after switching notes and forgets the saves', () => {
  const { guard } = setup();
  guard.recordSave('a');
  guard.recordSave('ab');

  expect(guard.isStaleEcho('n2', 'a', 'ab')).toBe(false);
  expect(guard.isStaleEcho('n2', 'a', 'b')).toBe(false);
});

test('accepts an old save once the window has passed', () => {
  const { guard, clock } = setup();
  guard.recordSave('a');
  clock.t = ECHO_WINDOW_MS + 1;

  expect(guard.isStaleEcho('n1', 'a', 'ab')).toBe(false);
});

test('remembers every save within the window, however many followed it', () => {
  const { guard, clock } = setup();
  guard.recordSave('1');
  for (let index = 2; index <= 11; index++) {
    clock.t += 100;
    guard.recordSave(String(index));
  }

  expect(guard.isStaleEcho('n1', '1', '11')).toBe(true);
});

test('forgets a save once the window has passed, even with later saves', () => {
  const { guard, clock } = setup();
  guard.recordSave('1');
  clock.t = ECHO_WINDOW_MS / 2;
  guard.recordSave('2');
  clock.t = ECHO_WINDOW_MS + 1;

  expect(guard.isStaleEcho('n1', '1', '3')).toBe(false);
  expect(guard.isStaleEcho('n1', '2', '3')).toBe(true);
});
