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
