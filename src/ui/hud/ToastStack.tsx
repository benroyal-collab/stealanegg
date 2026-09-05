/**
 * Toasts: "New species!", "Not enough donations yet".
 *
 * Always phrased as an invitation rather than a scolding. "Not enough
 * donations yet. Keep collecting!" and never "You can't afford that."
 */

import { useGame } from '../../state/store';
import { Icon } from '../Icon';

export function ToastStack(): React.ReactElement | null {
  const toasts = useGame((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <Icon name={toast.icon} size={22} />
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
