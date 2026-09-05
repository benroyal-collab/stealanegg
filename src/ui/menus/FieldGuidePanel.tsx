/**
 * The Field Guide: the collection index, and the Breeding Hut.
 *
 * Undiscovered species are shown as silhouettes with their biome named, so
 * the collection reads as an invitation rather than a wall of locks. There is
 * no way to buy an entry and no randomised purchase anywhere in it.
 */

import { useMemo, useState } from 'react';
import { SPECIES } from '../../data/creatures';
import { BIOME_DEFS, BIOME_ORDER } from '../../data/biomes';
import { MUTATION_DEFS, RARITY_COLOURS, RARITY_LABEL, RARITY_PIPS } from '../../data/mutations';
import { useGame } from '../../state/store';
import { Icon } from '../Icon';
import { Panel } from './Panel';
import { rollKey } from '../../sim/rolls';
import type { OwnedCreature } from '../../sim/types';

export function FieldGuidePanel(): React.ReactElement {
  const save = useGame((s) => s.save);
  const close = useGame((s) => s.setMenu);
  const fuse = useGame((s) => s.fuse);
  const [selected, setSelected] = useState<string[]>([]);

  const palette = RARITY_COLOURS[save.settings.colourblind];
  const discovered = new Set(save.discovered);

  /** Groups of three-or-more identical creatures: the Breeding Hut's input. */
  const fusable = useMemo(() => {
    const groups = new Map<string, OwnedCreature[]>();
    for (const creature of save.creatures) {
      const key = rollKey(creature);
      const list = groups.get(key) ?? [];
      list.push(creature);
      groups.set(key, list);
    }
    return [...groups.values()].filter((group) => group.length >= 3);
  }, [save.creatures]);

  return (
    <Panel
      icon="guide"
      title="Field Guide"
      intro="Every kind of hatchling you have met. Find three the same and the Breeding Hut can turn them into something rarer."
      onClose={() => close('none')}
    >
      <section>
        <h3>
          <Icon name="breeding" size={22} /> Breeding Hut
        </h3>
        {fusable.length === 0 ? (
          <p className="field__hint">
            Nothing to fuse yet. Bring home three of the same kind and they can become one of the
            next rarity up. Nothing is ever lost or destroyed.
          </p>
        ) : (
          <div className="button-row">
            {fusable.map((group) => {
              const first = group[0]!;
              const species = SPECIES.find((s) => s.id === first.speciesId);
              const uids = group.slice(0, 3).map((c) => c.uid);
              const active = selected.join(',') === uids.join(',');
              return (
                <button
                  key={rollKey(first)}
                  type="button"
                  className={`button${active ? ' button--primary' : ''}`}
                  onClick={() => {
                    if (active) fuse(uids);
                    else setSelected(uids);
                  }}
                >
                  <Icon name="fuse" size={22} />
                  {active ? 'Fuse them!' : `3 × ${species?.name ?? first.speciesId}`}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {BIOME_ORDER.map((biomeId) => {
        const biome = BIOME_DEFS[biomeId];
        const list = SPECIES.filter((s) => s.biome === biomeId);
        const found = list.filter((s) => discovered.has(s.id)).length;

        return (
          <section key={biomeId}>
            <h3>
              <Icon name="map" size={22} /> {biome.name}
              <span className="field__hint" style={{ marginLeft: 8 }}>
                {found} of {list.length} found
              </span>
            </h3>

            <div className="guide__grid">
              {list.map((species) => {
                const known = discovered.has(species.id);
                const owned = save.creatures.filter((c) => c.speciesId === species.id);
                const bestMutation = owned.reduce<string | null>(
                  (best, c) => (c.mutation !== 'none' ? MUTATION_DEFS[c.mutation].label : best),
                  null,
                );

                return (
                  <div
                    key={species.id}
                    className={`guide__card${known ? '' : ' guide__card--locked'}`}
                  >
                    <span className="guide__name">
                      {known ? species.name : 'Not found yet'}
                      {/*
                        Rarity is a word, a pip count and a colour -- three
                        signals, so removing any one of them still leaves it
                        readable.
                      */}
                      <span
                        className="pips"
                        style={{ color: palette[species.rarity] }}
                        aria-hidden="true"
                      >
                        {Array.from({ length: RARITY_PIPS[species.rarity] }, (_, i) => (
                          <span key={i} className="pips__pip" />
                        ))}
                      </span>
                    </span>
                    <span className="guide__blurb">
                      {RARITY_LABEL[species.rarity]}
                      {known ? ` · ${species.blurb}` : ' · keep looking!'}
                    </span>
                    {known && owned.length > 0 ? (
                      <span className="guide__blurb">
                        You have {owned.length}
                        {bestMutation === null ? '' : ` · ${bestMutation}`}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </Panel>
  );
}
