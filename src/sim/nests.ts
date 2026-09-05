/**
 * Nests: where eggs sit, and when they come back.
 *
 * Pure state plus a fixed-step tick, so respawn timing is testable without a
 * renderer. Positions come from the terrain sampler the render layer passes
 * in, which keeps this module free of three.js while still guaranteeing every
 * nest sits on walkable ground.
 */

import { EGG } from '../data/balance';
import { rollEgg } from './rolls';
import type { Rng } from './rng';
import type { BiomeId, EggRoll, Vec2 } from './types';

export interface Nest {
  readonly index: number;
  readonly position: Vec2;
  /** Ground height, so the renderer can sit the nest on the terrain. */
  readonly groundY: number;
  /** The egg currently in the nest, or null while it is respawning. */
  egg: EggRoll | null;
  /** Seconds until the next egg appears. Zero when one is present. */
  respawnIn: number;
  /**
   * Rare and above respawn on a slower cycle, so a lucky nest cannot be
   * farmed by standing next to it.
   */
  cycleRemaining: number;
  /** True while a rival is walking towards this nest. */
  contested: boolean;
}

export interface NestPlacement {
  readonly position: Vec2;
  readonly groundY: number;
}

const RARE_OR_BETTER = new Set(['rare', 'epic', 'legendary', 'mythic', 'secret']);

export function createNests(
  placements: readonly NestPlacement[],
  biome: BiomeId,
  rng: Rng,
): Nest[] {
  return placements.map((placement, index) => ({
    index,
    position: { ...placement.position },
    groundY: placement.groundY,
    egg: rollEgg(rng, biome),
    respawnIn: 0,
    cycleRemaining: 0,
    contested: false,
  }));
}

export interface NestTickResult {
  /** Nests that gained an egg this tick, for the "new egg" chime. */
  readonly respawned: number[];
}

export function tickNests(
  nests: Nest[],
  biome: BiomeId,
  rng: Rng,
  dt: number,
  out: NestTickResult & { respawned: number[] },
): void {
  out.respawned.length = 0;

  for (const nest of nests) {
    if (nest.cycleRemaining > 0) nest.cycleRemaining = Math.max(0, nest.cycleRemaining - dt);
    if (nest.egg !== null) continue;

    nest.respawnIn -= dt;
    if (nest.respawnIn > 0) continue;

    // Roll until we get something this nest is allowed to produce right now.
    // A single re-roll, not a loop: biasing towards common is the point.
    let roll = rollEgg(rng, biome);
    if (nest.cycleRemaining > 0 && RARE_OR_BETTER.has(roll.rarity)) {
      roll = downgrade(rng, biome, roll);
    }

    nest.egg = roll;
    nest.respawnIn = 0;
    if (RARE_OR_BETTER.has(roll.rarity)) nest.cycleRemaining = EGG.rarePlusCycleSeconds;
    out.respawned.push(nest.index);
  }
}

/** Take an egg. Starts the respawn timer. */
export function takeEgg(nest: Nest): EggRoll | null {
  const egg = nest.egg;
  if (egg === null) return null;
  nest.egg = null;
  nest.respawnIn = EGG.respawnSeconds;
  nest.contested = false;
  return egg;
}

/**
 * A rival claimed this nest. Identical to the player taking it, except that
 * nothing enters the player's incubator -- the cost is the twenty seconds
 * they spent walking there, and nothing else.
 */
export function claimByRival(nest: Nest): void {
  nest.egg = null;
  nest.respawnIn = EGG.respawnSeconds;
  nest.contested = false;
}

/** Nearest nest holding an egg, within `radius`. */
export function nearestEgg(nests: readonly Nest[], from: Vec2, radius: number): Nest | null {
  let best: Nest | null = null;
  let bestDistance = radius;
  for (const nest of nests) {
    if (nest.egg === null) continue;
    const distance = Math.hypot(nest.position.x - from.x, nest.position.z - from.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = nest;
    }
  }
  return best;
}

function downgrade(rng: Rng, biome: BiomeId, roll: EggRoll): EggRoll {
  // One re-roll. If it comes up rare again, accept it -- a hard guarantee
  // would make the cycle feel like a lockout rather than a cooldown.
  const second = rollEgg(rng, biome);
  return RARE_OR_BETTER.has(second.rarity) ? roll : second;
}
