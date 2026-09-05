/**
 * Rarity, mutation and size rolls.
 *
 * Design law #3: variance lives on the payout, not the challenge. These
 * functions are the only place variance is allowed to enter the game.
 */

import {
  MUTATION_ODDS,
  RARITY_WEIGHTS,
  SIZE_ODDS,
  SIZE_MULTIPLIER,
  MUTATION_MULTIPLIER,
} from '../data/balance';
import { speciesForBiome } from '../data/creatures';
import type { Rng } from './rng';
import type { BiomeId, EggRoll, MutationId, Rarity, SizeId, Species } from './types';

export function rollRarity(rng: Rng): Rarity {
  return rng.weighted(RARITY_WEIGHTS);
}

export function rollMutation(rng: Rng): MutationId {
  return rng.weighted(MUTATION_ODDS);
}

export function rollSize(rng: Rng): SizeId {
  return rng.weighted(SIZE_ODDS);
}

/**
 * Roll a complete egg for a biome.
 *
 * A biome does not host every rarity. When the rolled rarity has no species
 * in this biome we step down to the closest rarity that does, rather than
 * re-rolling -- stepping down keeps the published rarity weights honest
 * instead of silently inflating the common tiers.
 */
export function rollEgg(rng: Rng, biome: BiomeId): EggRoll {
  const pool = speciesForBiome(biome);
  if (pool.length === 0) throw new Error(`No species defined for biome ${biome}`);

  const wanted = rollRarity(rng);
  const species = pickNearestRarity(rng, pool, wanted);

  return {
    speciesId: species.id,
    rarity: species.rarity,
    mutation: rollMutation(rng),
    size: rollSize(rng),
  };
}

const RARITY_ORDER: readonly Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'secret',
];

function pickNearestRarity(rng: Rng, pool: readonly Species[], wanted: Rarity): Species {
  const wantedIndex = RARITY_ORDER.indexOf(wanted);
  for (let step = 0; step < RARITY_ORDER.length; step++) {
    const down = RARITY_ORDER[wantedIndex - step];
    if (down !== undefined) {
      const matches = pool.filter((s) => s.rarity === down);
      if (matches.length > 0) return rng.pick(matches);
    }
  }
  // Nothing at or below the rolled rarity exists here; take the cheapest.
  return pool.reduce((lowest, s) =>
    RARITY_ORDER.indexOf(s.rarity) < RARITY_ORDER.indexOf(lowest.rarity) ? s : lowest,
  );
}

/** Income per second a hatched creature contributes when placed in a habitat. */
export function creatureIncome(roll: EggRoll, baseIncome: number): number {
  return baseIncome * MUTATION_MULTIPLIER[roll.mutation] * SIZE_MULTIPLIER[roll.size];
}

/** Stable identity for "the same kind of thing", used by the Breeding Hut. */
export function rollKey(roll: EggRoll): string {
  return `${roll.speciesId}:${roll.mutation}:${roll.size}`;
}
