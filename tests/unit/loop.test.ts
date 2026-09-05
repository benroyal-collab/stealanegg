import { describe, expect, it } from 'vitest';
import { EGG, GUARDIAN, RIVALS, TOOL_DEFS } from '../../src/data/balance';
import { Rng } from '../../src/sim/rng';
import {
  claimByRival,
  createNests,
  nearestEgg,
  takeEgg,
  tickNests,
  type Nest,
} from '../../src/sim/nests';
import { createRivals, stepRivals, type RivalEvent } from '../../src/sim/rivals';
import type { Vec2 } from '../../src/sim/types';

function makeNests(count = 4): Nest[] {
  const placements = Array.from({ length: count }, (_, i) => ({
    position: { x: i * 12, z: 0 },
    groundY: 0,
  }));
  return createNests(placements, 'glade', new Rng('test-nests'));
}

const tick = { respawned: [] as number[] };

function rarityOf(nest: Nest): string | null {
  return nest.egg === null ? null : nest.egg.rarity;
}

describe('nests', () => {
  it('starts every nest with an egg', () => {
    for (const nest of makeNests()) expect(nest.egg).not.toBeNull();
  });

  it('empties on take and refills after the respawn delay', () => {
    const nests = makeNests(1);
    const nest = nests[0]!;
    expect(takeEgg(nest)).not.toBeNull();
    expect(nest.egg).toBeNull();

    const rng = new Rng('respawn');
    tickNests(nests, 'glade', rng, EGG.respawnSeconds - 1, tick);
    expect(nest.egg, 'refilled too early').toBeNull();

    tickNests(nests, 'glade', rng, 2, tick);
    expect(nest.egg, 'never refilled').not.toBeNull();
    expect(tick.respawned).toContain(0);
  });

  it('returns null when taking from an empty nest', () => {
    const nest = makeNests(1)[0]!;
    takeEgg(nest);
    expect(takeEgg(nest)).toBeNull();
  });

  it('finds the nearest egg inside the grab radius, and none outside it', () => {
    const nests = makeNests(3);
    const from: Vec2 = { x: 0.5, z: 0 };
    expect(nearestEgg(nests, from, EGG.grabRadius)?.index).toBe(0);
    expect(nearestEgg(nests, { x: 6, z: 0 }, EGG.grabRadius)).toBeNull();
  });

  it('skips empty nests when looking for the nearest egg', () => {
    const nests = makeNests(2);
    takeEgg(nests[0]!);
    expect(nearestEgg(nests, { x: 0, z: 0 }, 100)?.index).toBe(1);
  });

  it('puts rare finds on a slow cycle so a lucky nest cannot be farmed', () => {
    const nests = makeNests(1);
    const nest = nests[0]!;
    nest.egg = null;
    nest.cycleRemaining = EGG.rarePlusCycleSeconds;

    const rng = new Rng('cycle');
    // Run many respawns while the cycle is still hot and count the rare ones.
    let rareCount = 0;
    for (let i = 0; i < 200; i++) {
      nest.egg = null;
      nest.respawnIn = 0;
      nest.cycleRemaining = EGG.rarePlusCycleSeconds;
      tickNests(nests, 'glade', rng, 0.1, tick);
      // Read through a helper: assigning `nest.egg = null` above narrows the
      // property to null for the rest of the block, and the compiler has no
      // way to know tickNests refills it.
      const rarity = rarityOf(nest);
      if (rarity !== null && rarity !== 'common' && rarity !== 'uncommon') rareCount += 1;
    }
    // The downgrade is one re-roll, not a hard lockout, so some get through --
    // but far fewer than the raw weights would produce.
    expect(rareCount).toBeLessThan(60);
  });

  it('a rival claiming a nest costs the player nothing but the wait', () => {
    const nests = makeNests(1);
    const nest = nests[0]!;
    claimByRival(nest);
    expect(nest.egg).toBeNull();
    expect(nest.respawnIn).toBe(EGG.respawnSeconds);
    expect(nest.contested).toBe(false);
  });
});

describe('rivals', () => {
  const world = (nests: readonly Nest[]): { nests: Vec2[]; occupied: boolean[] } => ({
    nests: nests.map((n) => n.position),
    occupied: nests.map((n) => n.egg !== null),
  });

  it('telegraphs a target before it moves, every time', () => {
    const nests = makeNests(4);
    const rivals = createRivals(['Acorn Club'], 100, new Rng('r'));
    const rng = new Rng('rival-run');
    const events: RivalEvent[] = [];

    let telegraphed = false;
    let travelled = false;
    for (let t = 0; t < 200; t += 0.1) {
      stepRivals(rivals, world(nests), rng, 0.1, events);
      for (const event of events) {
        if (event.type === 'targeted') telegraphed = true;
        // A rival must never claim a nest it has not first telegraphed.
        if (event.type === 'claimed') {
          expect(telegraphed, 'claimed a nest without telegraphing it').toBe(true);
          travelled = true;
        }
      }
      if (travelled) break;
    }
    expect(telegraphed).toBe(true);
    expect(travelled).toBe(true);
  });

  it('gives the player at least the full telegraph window to react', () => {
    const nests = makeNests(4);
    const rivals = createRivals(['Acorn Club'], 100, new Rng('r'));
    const rng = new Rng('window');
    const events: RivalEvent[] = [];

    let targetedAt: number | null = null;
    for (let t = 0; t < 400; t += 0.1) {
      stepRivals(rivals, world(nests), rng, 0.1, events);
      for (const event of events) {
        if (event.type === 'targeted') targetedAt = t;
        if (event.type === 'claimed' && targetedAt !== null) {
          // Telegraph plus travel: the whole point is that a child can see it
          // coming and decide whether to race.
          expect(t - targetedAt).toBeGreaterThanOrEqual(
            RIVALS.telegraphSeconds + RIVALS.travelSeconds - 0.3,
          );
          return;
        }
      }
    }
    throw new Error('a rival never claimed a nest');
  });

  it('turns around without complaint when the player gets there first', () => {
    const nests = makeNests(2);
    const rivals = createRivals(['Acorn Club'], 100, new Rng('r'));
    const rng = new Rng('contest');
    const events: RivalEvent[] = [];

    for (let t = 0; t < 400; t += 0.1) {
      stepRivals(rivals, world(nests), rng, 0.1, events);
      const rival = rivals[0]!;
      if (rival.phase === 'travelling' && rival.targetNest !== null) {
        // Snatch it out from under them.
        takeEgg(nests[rival.targetNest]!);
        stepRivals(rivals, world(nests), rng, 0.1, events);
        expect(rivals[0]!.phase).toBe('returning');
        expect(events.some((e) => e.type === 'gaveUp')).toBe(true);
        return;
      }
    }
    throw new Error('a rival never set off');
  });

  it('never targets the same nest as another rival', () => {
    const nests = makeNests(2);
    const rivals = createRivals(['A', 'B', 'C'], 100, new Rng('r'));
    const rng = new Rng('overlap');
    const events: RivalEvent[] = [];

    for (let t = 0; t < 600; t += 0.1) {
      stepRivals(rivals, world(nests), rng, 0.1, events);
      const targets = rivals.map((r) => r.targetNest).filter((n): n is number => n !== null);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });

  it('never produces a position that is not a number', () => {
    const nests = makeNests(5);
    const rivals = createRivals(['A', 'B', 'C'], 160, new Rng('r'));
    const rng = new Rng('nan');
    const events: RivalEvent[] = [];
    for (let t = 0; t < 2000; t += 0.05) {
      stepRivals(rivals, world(nests), rng, 0.05, events);
      for (const rival of rivals) {
        expect(Number.isFinite(rival.position.x)).toBe(true);
        expect(Number.isFinite(rival.position.z)).toBe(true);
        expect(rival.progress).toBeGreaterThanOrEqual(0);
        expect(rival.progress).toBeLessThanOrEqual(1.001);
      }
    }
  });
});

describe('the rules that must never change', () => {
  it('being caught costs three seconds and nothing else', () => {
    expect(GUARDIAN.tumbleSeconds).toBe(3);
  });

  it('losing a race costs twenty seconds and nothing else', () => {
    expect(RIVALS.lossPenaltySeconds).toBe(20);
  });

  it('every tool is non-violent -- they lure and they soothe, nothing more', () => {
    for (const tool of Object.values(TOOL_DEFS)) {
      expect(tool.lureRadius).toBeGreaterThan(0);
      expect(tool.lureSeconds).toBeGreaterThan(0);
      // Nothing in a tool definition can do damage, because there is nowhere
      // for damage to be expressed.
      expect(Object.keys(tool)).not.toContain('damage');
    }
  });
});
