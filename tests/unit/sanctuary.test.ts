import { describe, expect, it } from 'vitest';
import { SPAWN_CORRIDOR_HALF_WIDTH, STATIONS } from '../../src/render/world/Sanctuary';
import { EGG, MOVEMENT } from '../../src/data/balance';

/**
 * The level-design rule from CLAUDE.md, asserted rather than trusted.
 *
 * Nest zero is placed eighteen metres directly ahead of the spawn in every
 * biome, and `sim/session.ts` measures the "first egg inside sixty seconds"
 * target over exactly that walk. If anything with a collider stands in that
 * lane, the pacing target is describing a route the player cannot take -- and
 * the only test that would notice is a five-minute end-to-end run.
 */

/** Straight ahead of the spawn is negative Z; the nest is at -18. */
const NEST_Z = -18;
const SPAWN_Z = 6;

describe('the lane between the spawn and the first nest', () => {
  it('is wide enough for the player to fit through', () => {
    // Every station collider is at most 1.1m in half-width.
    expect(SPAWN_CORRIDOR_HALF_WIDTH).toBeGreaterThan(1.1 + MOVEMENT.capsuleRadius);
  });

  it('has nothing standing in it', () => {
    for (const station of STATIONS) {
      const [x, , z] = station.position;
      const inTheLane = z <= SPAWN_Z && z >= NEST_Z;
      if (!inTheLane) continue;
      expect(
        Math.abs(x),
        `${station.id} stands in the walk from the spawn to the first nest`,
      ).toBeGreaterThanOrEqual(SPAWN_CORRIDOR_HALF_WIDTH);
    }
  });

  it('still puts the incubator within reach of someone walking it', () => {
    // Off the path, but not so far off that a child carrying an egg home has
    // to go looking for it.
    const incubator = STATIONS.find((s) => s.id === 'incubator');
    expect(incubator).toBeDefined();
    const [x] = incubator!.position;
    expect(Math.abs(x), 'the incubator is out of reach of the path home').toBeLessThan(
      EGG.depositRadius,
    );
  });
});
