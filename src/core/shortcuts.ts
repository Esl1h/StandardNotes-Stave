import { type Dur } from './engine';

/** What a keyboard shortcut asks for; the workspace carries it out. */
export type ShortcutAction =
  | { type: 'note'; dur: Dur }
  | { type: 'rest' }
  | { type: 'dot' }
  | { type: 'bar' }
  | { type: 'playPause' }
  | { type: 'transpose'; semitones: number }
  | { type: 'export' }
  | { type: 'toggleSplit' }
  | { type: 'toggleBars' };

/** Keys 1 to 7 pick the duration, longest first, as in notation programs. */
const DURATIONS: Record<string, Dur> = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 4,
  Digit4: 8,
  Digit5: 16,
  Digit6: 32,
  Digit7: 64,
};

export interface ShortcutHelp {
  keys: string;
  action: string;
}

export const SHORTCUT_HELP: ShortcutHelp[] = [
  { keys: '1 to 7', action: 'Note: whole, half, quarter, eighth, 16th, 32nd, 64th' },
  { keys: '0', action: 'Rest' },
  { keys: '.', action: 'Dot the note before the cursor' },
  { keys: '|', action: 'Bar line' },
  { keys: 'Space', action: 'Play or pause' },
  { keys: 'Alt + the keys above', action: 'The same while typing in the source' },
  { keys: 'Ctrl+Up / Ctrl+Down', action: 'Transpose a semitone up or down' },
  { keys: 'Ctrl+Shift+E', action: 'Export' },
  { keys: 'Ctrl+\\', action: 'Split view on or off' },
  { keys: 'Ctrl+Shift+M', action: 'Show or hide the bars' },
];

/**
 * The action for a key press, or null. Single keys only act outside the
 * source editor, where they would otherwise type; inside it they need Alt.
 * Digits and punctuation are read by key position (code), since Alt
 * changes the character they produce on some layouts.
 */
export function shortcutFor(event: KeyboardEvent, inEditor: boolean): ShortcutAction | null {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey) {
    if (!event.shiftKey && event.key === 'ArrowUp') return { type: 'transpose', semitones: 1 };
    if (!event.shiftKey && event.key === 'ArrowDown') return { type: 'transpose', semitones: -1 };
    if (event.shiftKey && event.code === 'KeyE') return { type: 'export' };
    if (event.shiftKey && event.code === 'KeyM') return { type: 'toggleBars' };
    if (!event.shiftKey && event.code === 'Backslash') return { type: 'toggleSplit' };
    return null;
  }
  if (mod || event.altKey !== inEditor) {
    return null;
  }
  if (event.code in DURATIONS && !event.shiftKey)
    return { type: 'note', dur: DURATIONS[event.code] };
  if (event.code === 'Digit0' && !event.shiftKey) return { type: 'rest' };
  if (event.code === 'Period' && !event.shiftKey) return { type: 'dot' };
  if (event.code === 'Backslash' && event.shiftKey) return { type: 'bar' };
  if (!inEditor && event.key === '|') return { type: 'bar' };
  if (event.code === 'Space' && !event.shiftKey) return { type: 'playPause' };
  return null;
}
