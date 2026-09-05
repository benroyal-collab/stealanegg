/**
 * A modal panel.
 *
 * Focus is trapped while it is open and Escape always closes it, because a
 * child who opens a menu by accident must never feel stuck. The scrim is
 * clickable for the same reason.
 */

import { useEffect, useRef } from 'react';
import { Icon } from '../Icon';

export interface PanelProps {
  icon: string;
  title: string;
  intro?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Panel({ icon, title, intro, onClose, children }: PanelProps): React.ReactElement {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || panel.current === null) return;

      // Focus trap. Without it, tabbing walks out of the dialog and into the
      // canvas, which for a keyboard-only player is a dead end.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        <div className="panel__head">
          <Icon name={icon} size={30} />
          <h2>{title}</h2>
          <button type="button" className="panel__close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={24} />
          </button>
        </div>
        {intro === undefined ? null : <p className="panel__intro">{intro}</p>}
        {children}
      </div>
    </div>
  );
}
