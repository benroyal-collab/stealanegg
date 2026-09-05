/**
 * "Your egg is warming up."
 *
 * A progress pill rather than a countdown clock. The distinction matters: a
 * ticking number creates urgency, and urgency is exactly what this game is
 * not for. It fills, and when it is full it says so and invites you over.
 */

import { useEffect, useState } from 'react';
import { useGame } from '../../state/store';
import { Icon } from '../Icon';
import { requireSpecies } from '../../data/creatures';
import { MUTATION_DEFS } from '../../data/mutations';

export function IncubatorPill(): React.ReactElement | null {
  const incubator = useGame((s) => s.save.incubator);
  const [, tick] = useState(0);

  // Re-render twice a second. The pill is the only thing on screen that has
  // to animate with the clock, and 2Hz is plenty for a bar this size.
  useEffect(() => {
    if (incubator === null) return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [incubator]);

  if (incubator === null) return null;

  const progress = 1 - incubator.remaining / Math.max(incubator.total, 0.001);
  const ready = incubator.remaining <= 0;
  const species = requireSpecies(incubator.roll.speciesId);
  const mutation = MUTATION_DEFS[incubator.roll.mutation];

  return (
    <div className={`incubator${ready ? ' incubator--ready' : ''}`}>
      <Icon name="egg-warm" size={26} label="Incubator" />
      <div className="incubator__body">
        <span className="incubator__title">
          {ready ? 'Ready to hatch!' : 'Warming up…'}
          {incubator.roll.mutation === 'none' ? '' : ` ${mutation.label}`}
        </span>
        <div className="incubator__bar" role="presentation">
          <div className="incubator__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <span className="incubator__sub">
          {ready ? `Go and meet your ${species.name}` : species.name}
        </span>
      </div>
    </div>
  );
}
