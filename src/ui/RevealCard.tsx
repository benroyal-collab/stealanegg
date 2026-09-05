/**
 * "Look what you found!"
 *
 * The payoff card. Shown for a few seconds when an egg goes into the
 * incubator, because the moment of finding out what you got is the whole
 * reward and it deserves its own beat.
 *
 * Rarity is stated three ways -- word, pips, colour -- so it reads the same
 * for every player.
 */

import { useEffect } from 'react';
import { useGame } from '../state/store';
import { requireSpecies } from '../data/creatures';
import { MUTATION_DEFS, RARITY_COLOURS, RARITY_LABEL, RARITY_PIPS } from '../data/mutations';
import { SIZE_MULTIPLIER } from '../data/balance';
import { Icon } from './Icon';

const SIZE_LABEL = { tiny: 'Tiny', normal: 'Normal', big: 'Big', huge: 'Huge' } as const;

export function RevealCard(): React.ReactElement | null {
  const reveal = useGame((s) => s.reveal);
  const setReveal = useGame((s) => s.setReveal);
  const colourblind = useGame((s) => s.save.settings.colourblind);

  useEffect(() => {
    if (reveal === null) return;
    const id = window.setTimeout(() => setReveal(null), 4200);
    return () => window.clearTimeout(id);
  }, [reveal, setReveal]);

  if (reveal === null) return null;

  const species = requireSpecies(reveal.speciesId);
  const mutation = MUTATION_DEFS[reveal.mutation];
  const palette = RARITY_COLOURS[colourblind];
  const special = reveal.mutation !== 'none' || reveal.size !== 'normal';

  return (
    <div className="reveal" role="status" aria-live="polite">
      <div className="reveal__card">
        <Icon name="egg" size={40} />
        <div>
          <strong className="reveal__name">{species.name} egg</strong>
          <div className="reveal__row" style={{ color: palette[reveal.rarity] }}>
            {RARITY_LABEL[reveal.rarity]}
            <span className="pips" aria-hidden="true">
              {Array.from({ length: RARITY_PIPS[reveal.rarity] }, (_, i) => (
                <span key={i} className="pips__pip" />
              ))}
            </span>
          </div>
          {special ? (
            <div className="reveal__row">
              {reveal.mutation === 'none' ? null : <span>{mutation.label}</span>}
              {reveal.size === 'normal' ? null : (
                <span>
                  {SIZE_LABEL[reveal.size]} · {SIZE_MULTIPLIER[reveal.size]}× donations
                </span>
              )}
            </div>
          ) : null}
          {reveal.mutation === 'none' ? null : (
            <p className="reveal__caption">{mutation.caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}
