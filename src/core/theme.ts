import { type ThemeColors } from './engine';

/**
 * The active Standard Notes theme as plain colors, for renderers that take
 * colors as options instead of CSS (docs/adr/0012). Read at runtime, so
 * every theme works without code of its own.
 */

const VARIABLES: Record<keyof ThemeColors, string> = {
  foreground: '--sn-stylekit-contrast-foreground-color',
  background: '--sn-stylekit-contrast-background-color',
  neutral: '--sn-stylekit-neutral-color',
  accent: '--sn-stylekit-info-color',
  danger: '--sn-stylekit-danger-color',
};

// The light theme, for the moment before the host stylesheet arrives.
const FALLBACK: ThemeColors = {
  foreground: '#191919',
  background: '#ffffff',
  neutral: '#72767e',
  accent: '#086dd6',
  danger: '#cc2128',
};

export function themeColors(element: Element = document.documentElement): ThemeColors {
  const style = getComputedStyle(element);
  return Object.fromEntries(
    (Object.keys(VARIABLES) as Array<keyof ThemeColors>).map((key) => [
      key,
      style.getPropertyValue(VARIABLES[key]).trim() || FALLBACK[key],
    ])
  ) as unknown as ThemeColors;
}

/**
 * Calls back when the theme may have changed: the host adds or removes its
 * theme stylesheet in the head, and the color scheme can flip.
 */
export function watchTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.head, { childList: true, subtree: true, attributes: true });
  const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  scheme?.addEventListener?.('change', onChange);
  return () => {
    observer.disconnect();
    scheme?.removeEventListener?.('change', onChange);
  };
}
