import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export type MenuItem =
  | {
      label: string;
      onSelect: () => void;
      shortcut?: string;
      disabled?: boolean;
      /** Shown with a check mark when true; a toggle or a choice. */
      checked?: boolean;
    }
  | 'separator';

export interface MenuDef {
  id: string;
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  menus: MenuDef[];
  /** Content at the right end of the bar (the engine selector). */
  trailing?: React.ReactNode;
}

/**
 * File, Edit, View... as a WAI-ARIA menubar: Arrow keys move between the
 * menus and their items, Enter or Space opens and selects, Escape closes.
 */
function MenuBar({ menus, trailing }: MenuBarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Focus the first item of a menu as it opens, as menus do.
  useEffect(() => {
    if (open) {
      barRef.current
        ?.querySelector<HTMLElement>(`#menu-${open} [role^="menuitem"]:not([aria-disabled="true"])`)
        ?.focus();
    }
  }, [open]);

  const moveMenu = (from: string, step: number) => {
    const index = menus.findIndex((menu) => menu.id === from);
    const next = menus[(index + step + menus.length) % menus.length].id;
    setOpen((current) => (current ? next : null));
    buttons.current[next]?.focus();
  };

  const onItemsKeyDown = (menu: MenuDef) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]:not([aria-disabled="true"])'
      )
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveMenu(menu.id, event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(null);
      buttons.current[menu.id]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(null);
    }
  };

  return (
    <div className="menu-bar" ref={barRef}>
      <div role="menubar" aria-label="Editor menu" className="menu-bar-menus">
        {menus.map((menu) => (
          <div className="menu" key={menu.id}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === menu.id}
              className={open === menu.id ? 'active' : undefined}
              ref={(element) => {
                buttons.current[menu.id] = element;
              }}
              onClick={() => setOpen(open === menu.id ? null : menu.id)}
              onMouseEnter={() => open && open !== menu.id && setOpen(menu.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setOpen(menu.id);
                } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveMenu(menu.id, event.key === 'ArrowRight' ? 1 : -1);
                }
              }}
            >
              {menu.label}
            </button>
            {open === menu.id && (
              <div
                id={`menu-${menu.id}`}
                role="menu"
                aria-label={menu.label}
                className="menu-list"
                onKeyDown={onItemsKeyDown(menu)}
              >
                {menu.items.map((item, index) =>
                  item === 'separator' ? (
                    <div role="separator" className="menu-separator" key={`sep-${index}`} />
                  ) : (
                    <button
                      type="button"
                      key={item.label}
                      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                      aria-checked={item.checked}
                      aria-disabled={item.disabled || undefined}
                      tabIndex={-1}
                      onClick={() => {
                        if (item.disabled) return;
                        setOpen(null);
                        item.onSelect();
                      }}
                    >
                      <span className="menu-check" aria-hidden="true">
                        {item.checked && <Check size={14} />}
                      </span>
                      <span className="menu-label">{item.label}</span>
                      {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="spacer" />
      {trailing}
    </div>
  );
}

export default MenuBar;
