import { themeColors, watchTheme } from './theme';

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.head.innerHTML = '';
});

test('reads the theme variables', () => {
  document.documentElement.style.setProperty('--sn-stylekit-contrast-foreground-color', '#eee');
  document.documentElement.style.setProperty('--sn-stylekit-info-color', ' #f80 ');

  expect(themeColors()).toMatchObject({ foreground: '#eee', accent: '#f80' });
});

test('falls back to the light theme for a variable that is not set', () => {
  expect(themeColors().background).toBe('#ffffff');
});

test('reports a new theme stylesheet', async () => {
  const onChange = vi.fn();
  const stop = watchTheme(onChange);

  document.head.appendChild(document.createElement('link'));
  await Promise.resolve();

  expect(onChange).toHaveBeenCalled();
  stop();
});
