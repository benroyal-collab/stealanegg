import { describe, expect, it } from 'vitest';
import { WORLD, GUARDIAN } from '../../src/data/balance';
import { BIOME_DEFS } from '../../src/data/biomes';
import { createNests } from '../../src/sim/nests';
import { Rng } from '../../src/sim/rng';
import type { BiomeId } from '../../src/sim/types';
import { generateTerrain } from '../../src/render/world/terrain';
import {
  createGuardians,
  createLoopRuntime,
  isHome,
  stepLoop,
  type LoopEvent,
  type LoopStepInput,
} from '../../src/systems/loop';

/**
 * Home is safe.
 *
 * The screenshot gate for Mirrormere captured the ranger flat on his back in
 * the middle of the sanctuary, next to the incubator, with the swan standing
 * over him -- on a run where the test had not moved the player at all. Nest
 * zero sits eighteen metres out and its guardian patrols a loop up to ten
 * metres wide, so the loop reached well inside the clearing, and nothing in
 * the simulation said the clearing was special.
 *
 * For a child that is the worst possible first ten seconds: knocked over at
 * the spawn, before touching anything, by something they never saw coming.
 */

const BIOMES = Object.keys(BIOME_DEFS) as BiomeId[];
const DT = 1 / 20;
const NEST_ZERO = { x: 0, z: -WORLD.tutorialNestDistance };

function world(biome: BiomeId) {
  const field = generateTerrain(BIOME_DEFS[biome].terrain, 1);
  const nests = createNests([{ position: NEST_ZERO, groundY: 0 }], biome, new Rng('safe-nests'));
  const runtime = createLoopRuntime(biome, nests);
  runtime.guardians = createGuardians(nests, field, () => 0, new Rng(`${biome}-safe`));
  return runtime;
}

function input(x: number, z: number): LoopStepInput {
  return {
    playerPosition: { x, z },
    playerGroundY: 0,
    playerNoiseRadius: 6,
    playerPace: 6,
    difficulty: 'standard',
    hasLineOfSight: () => true,
    groundAt: () => 0,
    dt: DT,
  };
}

describe('the sanctuary', () => {
  it('keeps every patrol route outside the clearing', () => {
    for (const biome of BIOMES) {
      for (const point of world(biome).guardians[0]!.route) {
        expect(Math.hypot(point.x, point.z), biome).toBeGreaterThan(WORLD.sanctuaryRadius);
      }
    }
  });

  it('never lets a guardian in, or knocks over a player standing at the spawn', () => {
    // A full minute stood at the spawn, in plain sight and making noise.
    const events: LoopEvent[] = [];
    for (const biome of BIOMES) {
      const runtime = world(biome);
      const rng = new Rng('safe-step');
      for (let t = 0; t < 60; t += DT) {
        stepLoop(runtime, input(0, 0), rng, events);
        expect(
          events.some((e) => e.type === 'caught'),
          `${biome} caught a player at home`,
        ).toBe(false);
        for (const guardian of runtime.guardians) {
          expect(
            Math.hypot(guardian.position.x, guardian.position.z),
            `${biome} guardian walked into the sanctuary`,
          ).toBeGreaterThanOrEqual(WORLD.sanctuaryRadius);
          expect(guardian.runtime.state, biome).not.toBe('chase');
        }
      }
    }
  });

  it('calls off a chase the moment the player crosses into it', () => {
    const runtime = world('glade');
    const guardian = runtime.guardians[0]!;
    guardian.runtime.state = 'chase';
    guardian.position = { x: 0, z: -(WORLD.sanctuaryRadius + GUARDIAN.catchRadius) };
    const events: LoopEvent[] = [];

    // One step inside the edge, with the guardian right behind.
    stepLoop(runtime, input(0, -(WORLD.sanctuaryRadius - 0.5)), new Rng('x'), events);
    expect(guardian.runtime.state).not.toBe('chase');
    expect(events.some((e) => e.type === 'caught')).toBe(false);
    // The caption track says so: "The guardian has given up. You are safe."
    expect(events.some((e) => e.type === 'guardianGaveUp')).toBe(true);
  });

  it('agrees with itself about where home is', () => {
    expect(isHome({ x: 0, z: 0 })).toBe(true);
    expect(isHome({ x: 0, z: -(WORLD.sanctuaryRadius - 0.01) })).toBe(true);
    expect(isHome(NEST_ZERO)).toBe(false);
  });
});
