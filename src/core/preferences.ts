/**
 * Editor preferences, kept where the Milkdown plugin keeps its layout: in
 * the component data Standard Notes stores on the editor's component item
 * (synced, and immune to iframe origins that make localStorage fail or
 * forget), with localStorage as the fallback before registration or outside
 * the app. Nothing here goes into the note. Unknown stored values fall back
 * to the defaults, so a value from another version never breaks the editor.
 */

export type View = 'split' | 'source' | 'render';
/** Side by side or one above the other. */
export type Orientation = 'side' | 'stacked';

/** Key/value store backed by the Standard Notes component data. */
export interface PreferenceStore {
  get: (key: string) => unknown;
  set: (key: string, value: string) => void;
}

export interface Preferences {
  view: View;
  orientation: Orientation;
  /** Render pane first (left or top). */
  swapped: boolean;
  menuBar: boolean;
  toolbar: boolean;
  zoom: number;
  /** Engine id for notes whose text matches no engine. */
  defaultEngine: string;
}

const VIEWS = ['split', 'source', 'render'] as const;
const ORIENTATIONS = ['side', 'stacked'] as const;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

const STORAGE_PREFIX = 'standardnotes-stave';

let preferenceStore: PreferenceStore | null = null;

export function setPreferenceStore(store: PreferenceStore | null): void {
  preferenceStore = store;
}

function readRaw(key: string): string | null {
  try {
    const synced = preferenceStore?.get(key);
    if (typeof synced === 'string') {
      return synced;
    }
  } catch {
    // Not registered yet; localStorage below.
  }
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}-${key}`);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    preferenceStore?.set(key, value);
  } catch {
    // Not registered yet; localStorage below still keeps it.
  }
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}-${key}`, value);
  } catch {
    // Non persistable contexts keep the in-memory preference only.
  }
}

const oneOf = <T extends string>(allowed: readonly T[], fallback: T) => ({
  parse: (raw: string | null): T => allowed.find((candidate) => candidate === raw) ?? fallback,
  format: (value: T) => value,
});

const flag = (fallback: boolean) => ({
  parse: (raw: string | null) => (raw === 'true' ? true : raw === 'false' ? false : fallback),
  format: (value: boolean) => String(value),
});

export const clampZoom = (zoom: number) =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 10) / 10));

const codecs = {
  view: oneOf(VIEWS, 'split'),
  orientation: oneOf(ORIENTATIONS, 'side'),
  swapped: flag(false),
  menuBar: flag(true),
  toolbar: flag(true),
  zoom: {
    parse: (raw: string | null) => {
      const zoom = Number(raw);
      return raw !== null && Number.isFinite(zoom) ? clampZoom(zoom) : 1;
    },
    format: (value: number) => String(value),
  },
  defaultEngine: {
    parse: (raw: string | null) => raw ?? '',
    format: (value: string) => value,
  },
} satisfies {
  [K in keyof Preferences]: {
    parse: (raw: string | null) => Preferences[K];
    format: (value: Preferences[K]) => string;
  };
};

const KEYS: Record<keyof Preferences, string> = {
  view: 'view',
  orientation: 'orientation',
  swapped: 'swapped',
  menuBar: 'menu-bar',
  toolbar: 'toolbar',
  zoom: 'zoom',
  defaultEngine: 'default-engine',
};

export function readPreference<K extends keyof Preferences>(key: K): Preferences[K] {
  return codecs[key].parse(readRaw(KEYS[key])) as Preferences[K];
}

export function writePreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  const codec = codecs[key] as { format: (value: Preferences[K]) => string };
  writeRaw(KEYS[key], codec.format(value));
}

/**
 * All preferences. On phones the bars start collapsed, so the notation gets
 * the screen; a value the user chose wins over that default.
 */
export function readPreferences(mobile = false): Preferences {
  const prefs = Object.fromEntries(
    (Object.keys(codecs) as Array<keyof Preferences>).map((key) => [key, readPreference(key)])
  ) as unknown as Preferences;
  if (mobile) {
    if (readRaw(KEYS.menuBar) === null) prefs.menuBar = false;
    if (readRaw(KEYS.toolbar) === null) prefs.toolbar = false;
  }
  return prefs;
}
