import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MenuBar, { type MenuDef } from './MenuBar';

const setup = () => {
  const calls: string[] = [];
  const menus: MenuDef[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Open', onSelect: () => calls.push('open') },
        'separator',
        { label: 'Disabled', disabled: true, onSelect: () => calls.push('disabled') },
        { label: 'Save', shortcut: 'Ctrl+S', onSelect: () => calls.push('save') },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [{ label: 'Split', checked: true, onSelect: () => calls.push('split') }],
    },
  ];
  render(<MenuBar menus={menus} trailing={<span>trailing</span>} />);
  return { calls };
};

test('opens a menu and selects an item', () => {
  const { calls } = setup();

  fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Save/ }));

  expect(calls).toEqual(['save']);
  expect(screen.queryByRole('menu')).toBeNull();
});

test('moves through the items with the arrow keys, skipping disabled ones', () => {
  setup();
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'File' }), { key: 'ArrowDown' });
  const menu = screen.getByRole('menu', { name: 'File' });

  expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus();
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  expect(screen.getByRole('menuitem', { name: /Save/ })).toHaveFocus();
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus();
});

test('moves between menus and closes with Escape', () => {
  setup();
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'File' }), { key: 'ArrowDown' });

  fireEvent.keyDown(screen.getByRole('menu', { name: 'File' }), { key: 'ArrowRight' });
  expect(screen.getByRole('menu', { name: 'View' })).toBeInTheDocument();
  expect(screen.getByRole('menuitemcheckbox', { name: 'Split' })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  fireEvent.keyDown(screen.getByRole('menu', { name: 'View' }), { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'View' })).toHaveFocus();
});

test('does not run a disabled item', () => {
  const { calls } = setup();
  fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));

  fireEvent.click(screen.getByRole('menuitem', { name: 'Disabled' }));

  expect(calls).toEqual([]);
  expect(screen.getByRole('menu')).toBeInTheDocument();
});

test('closes when clicking outside', () => {
  setup();
  fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));

  fireEvent.mouseDown(document.body);

  expect(screen.queryByRole('menu')).toBeNull();
});
