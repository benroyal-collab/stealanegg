/**
 * "While you were away…"
 *
 * Shown once on load when the habitats earned something. It states the cap
 * plainly rather than hiding it, because a child who understands that idling
 * is a poor deal will go and play instead, which is the point.
 */

import { ECONOMY } from '../data/balance';
import { useGame } from '../state/store';
import { formatMoney } from './format';
import { Icon } from './Icon';

export function OfflineWelcome(): React.ReactElement | null {
  const payout = useGame((s) => s.offlinePayout);
  const clear = useGame((s) => s.clearOfflinePayout);

  if (payout === null || payout <= 0) return null;

  return (
    <div className="scrim">
      <div className="panel break" role="dialog" aria-modal="true" aria-label="While you were away">
        <Icon name="coin" size={44} />
        <h2>Welcome back!</h2>
        <p>
          Your hatchlings collected <strong>{formatMoney(payout)}</strong> in donations while you
          were away.
        </p>
        <p className="field__hint">
          They only collect for {ECONOMY.offlineCapHours} hours at a time, and at half speed.
          Playing is always better than leaving the game open.
        </p>
        <div className="button-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="button button--primary" onClick={clear}>
            <Icon name="play" size={20} /> Let&apos;s go
          </button>
        </div>
      </div>
    </div>
  );
}
