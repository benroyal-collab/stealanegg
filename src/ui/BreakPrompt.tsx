/**
 * The break reminder.
 *
 * Friendly, dismissible, and it never stops the game. It does not say "you
 * have been playing too long", it does not show a timer counting up, and
 * dismissing it costs nothing. The interval is a parent setting and can be
 * turned off entirely.
 */

import { useGame } from '../state/store';
import { Icon } from './Icon';

export function BreakPrompt(): React.ReactElement | null {
  const shown = useGame((s) => s.showBreakPrompt);
  const dismiss = useGame((s) => s.dismissBreakPrompt);

  if (!shown) return null;

  return (
    <div className="scrim">
      <div className="panel break" role="dialog" aria-modal="true" aria-label="Time for a break?">
        <Icon name="clock" size={44} />
        <h2>Fancy a stretch?</h2>
        <p>
          You have been playing for a while. Your sanctuary will be exactly as you left it — the
          hatchlings will keep collecting donations while you are away.
        </p>
        <div className="button-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="button button--primary" onClick={dismiss}>
            <Icon name="play" size={20} /> Keep playing
          </button>
        </div>
      </div>
    </div>
  );
}
