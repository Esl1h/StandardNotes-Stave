import {
  clampZoom,
  readPreference,
  readPreferences,
  setPreferenceStore,
  writePreference,
} from './preferences';

const memoryStore = (initial: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = { ...initial };
  return {
    data,
    get: (key: string) => data[key],
    set: (key: string, value: string) => (data[key] = value),
  };
};

beforeEach(() => {
  window.localStorage.clear();
  setPreferenceStore(null);
});

test('falls back to the defaults when nothing is stored', () => {
  expect(readPreferences()).toEqual({
    view: 'split',
    orientation: 'side',
    swapped: false,
    menuBar: true,
    toolbar: true,
    zoom: 1,
    defaultEngine: '',
  });
});

test('reads the component data first, then localStorage', () => {
  window.localStorage.setItem('standardnotes-stave-view', 'source');
  expect(readPreference('view')).toBe('source');

  setPreferenceStore(memoryStore({ view: 'render' }));
  expect(readPreference('view')).toBe('render');
});

test('writes to the component data and localStorage', () => {
  const store = memoryStore();
  setPreferenceStore(store);

  writePreference('menuBar', false);
  writePreference('zoom', 1.5);

  expect(store.data).toEqual({ 'menu-bar': 'false', zoom: '1.5' });
  expect(window.localStorage.getItem('standardnotes-stave-menu-bar')).toBe('false');
});

test('ignores values it does not know', () => {
  setPreferenceStore(memoryStore({ view: 'gallery', zoom: 'big', toolbar: 'maybe' }));

  expect(readPreference('view')).toBe('split');
  expect(readPreference('zoom')).toBe(1);
  expect(readPreference('toolbar')).toBe(true);
});

test('keeps the zoom within its range', () => {
  setPreferenceStore(memoryStore({ zoom: '9' }));

  expect(readPreference('zoom')).toBe(2);
  expect(clampZoom(0.1)).toBe(0.5);
  expect(clampZoom(1.04)).toBe(1);
});

test('starts with collapsed bars on phones unless the user chose otherwise', () => {
  expect(readPreferences(true)).toMatchObject({ menuBar: false, toolbar: false });

  setPreferenceStore(memoryStore({ 'menu-bar': 'true' }));
  expect(readPreferences(true)).toMatchObject({ menuBar: true, toolbar: false });
});

test('survives a store that throws before registration', () => {
  setPreferenceStore({
    get: () => {
      throw new Error('not registered');
    },
    set: () => {
      throw new Error('not registered');
    },
  });

  writePreference('view', 'render');
  expect(readPreference('view')).toBe('render');
});
