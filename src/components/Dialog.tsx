import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Buttons at the bottom; a Close button when absent. */
  actions?: React.ReactNode;
}

/** A modal panel over the editor: Escape or the backdrop closes it, and the
 * focus moves into it and back to where it was. */
function Dialog({ title, onClose, children, actions }: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current
      ?.querySelector<HTMLElement>('[data-autofocus], .dialog-actions button, button')
      ?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {/* Focusable, so the keyboard can scroll a long cheat sheet. */}
        <div className="dialog-body" tabIndex={0}>
          {children}
        </div>
        <footer className="dialog-actions">
          {actions ?? (
            <button type="button" onClick={onClose}>
              Close
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export default Dialog;
