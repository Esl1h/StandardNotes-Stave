import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setPreferenceStore } from '../core/preferences';
import Workspace from './Workspace';

const { one, two } = vi.hoisted(() => {
  const instance = () => ({
    render: vi.fn(async () => ({ errors: [] })),
    setTheme: vi.fn(),
    destroy: vi.fn(),
  });
  const fakeEngine = (id: string, label: string, prefix: string) => ({
    id,
    label,
    extension: id,
    detect: (src: string) => src.startsWith(prefix),
    title: () => undefined,
    template: () => `${prefix} template`,
    example: () => `${prefix} example`,
    emit: (cmd: { kind: string; dur?: number }, ctx: { from: number; to: number }) => ({
      from: ctx.from,
      to: ctx.to,
      insert: cmd.kind === 'note' ? `<${label} note ${cmd.dur}>` : `<${cmd.kind}>`,
    }),
    mount: vi.fn(async () => instance()),
    tools: () => [
      {
        id: 'quarter',
        label: 'Quarter note',
        icon: 'quarter',
        group: 'Duration',
        cmd: { kind: 'note', pitch: '', dur: 4 },
      },
      { id: 'bar', label: 'Bar line', icon: 'bar', group: 'Bars', cmd: { kind: 'bar' } },
    ],
    cheatsheet: () => [{ title: 'Notes', rows: [{ syntax: 'C', meaning: 'Middle C' }] }],
  });
  return { one: fakeEngine('one', 'One', '1:'), two: fakeEngine('two', 'Two', '2:') };
});

vi.mock('../engines/registry', () => ({
  ENGINES: [one, two],
  engineById: (id: string) => [one, two].find((engine) => engine.id === id),
  detectEngine: (src: string, defaultId = '') =>
    [one, two].find((engine) => engine.detect(src)) ??
    [one, two].find((engine) => engine.id === defaultId) ??
    one,
}));

const setup = (text: string, { locked = false } = {}) => {
  const onTextChange = vi.fn();
  const view = render(
    <Workspace
      rawText={text}
      epoch={1}
      locked={locked}
      mobile={false}
      onTextChange={onTextChange}
    />
  );
  return { onTextChange, view };
};

beforeEach(() => {
  window.localStorage.clear();
  setPreferenceStore(null);
});

test('offers the engines for an empty note and starts from a template', () => {
  const { onTextChange } = setup('');

  fireEvent.click(screen.getByRole('button', { name: 'Two' }));

  expect(onTextChange).toHaveBeenCalledWith('2: template');
  expect(window.localStorage.getItem('standardnotes-stave-default-engine')).toBe('two');
});

test('an empty note opens an example', () => {
  const { onTextChange } = setup('');

  fireEvent.click(screen.getByRole('button', { name: 'Two example' }));
  expect(onTextChange).toHaveBeenCalledWith('2: example');
  fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Open the One example' }));
  expect(onTextChange).toHaveBeenLastCalledWith('1: example');
});

test('a written note does not offer to open an example', () => {
  setup('1: notes');

  fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
  expect(screen.getByRole('menuitem', { name: 'Open the Two example' })).toHaveAttribute(
    'aria-disabled',
    'true'
  );
});

test('shows the detected engine and mounts its renderer', async () => {
  setup('2: notes');

  expect(screen.getByRole('combobox', { name: 'Notation' })).toHaveValue('two');
  await waitFor(() => expect(two.mount).toHaveBeenCalled());
});

test('a toolbar button inserts the engine syntax at the cursor', () => {
  const { onTextChange } = setup('1: ');

  fireEvent.click(screen.getByRole('button', { name: 'Quarter note' }));

  expect(onTextChange).toHaveBeenLastCalledWith('<One note 4>1: ');
});

test('a duration key inserts a note when the focus is outside the source', () => {
  const { onTextChange } = setup('1: ');

  fireEvent.keyDown(document.body, { code: 'Digit4', key: '4' });

  expect(onTextChange).toHaveBeenLastCalledWith('<One note 8>1: ');
});

test('switching the engine of a written note asks first and keeps the text', async () => {
  const { onTextChange } = setup('1: notes');
  const select = screen.getByRole('combobox', { name: 'Notation' });

  fireEvent.change(select, { target: { value: 'two' } });
  expect(screen.getByRole('dialog', { name: 'Switch to Two?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(select).toHaveValue('one');

  fireEvent.change(select, { target: { value: 'two' } });
  fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
  expect(select).toHaveValue('two');
  expect(onTextChange).not.toHaveBeenCalled();
});

test('a locked note disables the tools and the engine choice', () => {
  setup('1: notes', { locked: true });

  expect(screen.getByRole('button', { name: 'Quarter note' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Notation' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('locked');
});

test('Help shows the engine cheat sheet', () => {
  setup('1: notes');

  fireEvent.click(screen.getByRole('menuitem', { name: 'Help' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'One cheat sheet' }));

  const dialog = screen.getByRole('dialog', { name: 'One cheat sheet' });
  expect(dialog).toHaveTextContent('Middle C');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('the view menu changes and remembers the layout', () => {
  const { view } = setup('1: notes');

  fireEvent.click(screen.getByRole('menuitem', { name: 'View' }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Rendering only' }));

  expect(view.container.querySelector('.source-pane')).toBeNull();
  expect(window.localStorage.getItem('standardnotes-stave-view')).toBe('render');
});

test('Ctrl+Shift+M hides and shows the bars', () => {
  setup('1: notes');

  act(() => {
    fireEvent.keyDown(document.body, { code: 'KeyM', key: 'M', ctrlKey: true, shiftKey: true });
  });
  expect(screen.queryByRole('menubar')).toBeNull();
  expect(screen.queryByRole('toolbar')).toBeNull();

  fireEvent.keyDown(document.body, { code: 'KeyM', key: 'M', ctrlKey: true, shiftKey: true });
  expect(screen.getByRole('menubar')).toBeInTheDocument();
});

test('a failed playback says why and shows Play again', async () => {
  const player = {
    play: vi.fn(async () => {
      throw new Error('The piano samples could not be loaded (C4).');
    }),
    pause: vi.fn(),
    stop: vi.fn(),
    setSpeed: vi.fn(),
    setLoop: vi.fn(),
    onStateChange: vi.fn((cb: (state: object) => void) =>
      cb({ playing: false, speed: 1, loop: false })
    ),
  };
  one.mount.mockImplementationOnce(
    async () =>
      ({
        render: vi.fn(async () => ({ errors: [] })),
        setTheme: vi.fn(),
        destroy: vi.fn(),
        player,
      }) as never
  );
  setup('1: notes');

  fireEvent.click(await screen.findByRole('button', { name: 'Play' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('samples could not be loaded (C4)');
  expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
});

test('offers the views, track and click controls of the renderer', async () => {
  const setView = vi.fn();
  const setTrackMute = vi.fn();
  const setTrackSolo = vi.fn();
  const setMetronome = vi.fn();
  const setCountIn = vi.fn();
  const player = {
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    setSpeed: vi.fn(),
    setLoop: vi.fn(),
    setTrackMute,
    setTrackSolo,
    setMetronome,
    setCountIn,
    onStateChange: vi.fn((cb: (state: object) => void) =>
      cb({
        playing: false,
        speed: 1,
        loop: false,
        metronome: false,
        countIn: true,
        tracks: [
          { name: 'Guitar', muted: false, solo: false },
          { name: '', muted: true, solo: false },
        ],
      })
    ),
  };
  one.mount.mockImplementationOnce(
    async () =>
      ({
        render: vi.fn(async () => ({ errors: [] })),
        setTheme: vi.fn(),
        destroy: vi.fn(),
        player,
        views: [
          { id: 'both', label: 'Score and tab' },
          { id: 'tab', label: 'Tab' },
        ],
        setView,
      }) as never
  );
  setup('1: notes');
  await screen.findByRole('button', { name: 'Play' });

  fireEvent.click(screen.getByRole('menuitem', { name: 'View' }));
  expect(screen.getByRole('menuitemcheckbox', { name: 'Score and tab' })).toHaveAttribute(
    'aria-checked',
    'true'
  );
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tab' }));
  await waitFor(() => expect(setView).toHaveBeenLastCalledWith('tab'));
  expect(window.localStorage.getItem('standardnotes-stave-render-view')).toBe('tab');

  fireEvent.click(screen.getByRole('menuitem', { name: 'Play' }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Solo Guitar' }));
  expect(setTrackSolo).toHaveBeenCalledWith(0, true);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Play' }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Mute Track 2' }));
  expect(setTrackMute).toHaveBeenCalledWith(1, false);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Play' }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Metronome' }));
  expect(setMetronome).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Play' }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Count-in' }));
  expect(setCountIn).toHaveBeenCalledWith(false);
});

test('a failed export says why', async () => {
  one.mount.mockImplementationOnce(
    async () =>
      ({
        render: vi.fn(async () => ({ errors: [] })),
        setTheme: vi.fn(),
        destroy: vi.fn(),
        exportFormats: ['midi'],
        export: vi.fn(async () => {
          throw new Error('No notes.');
        }),
      }) as never
  );
  setup('1: notes');
  // The renderer mounts asynchronously; its export formats come with it.
  await act(async () => {});

  fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /^Export MIDI file/ }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Export failed: No notes.');
});
