import { describe, expect, it } from 'vitest';
import { ECONOMY, MOVEMENT, PACING_TARGETS, UPGRADE_DEFS } from '../../src/data/balance';
import { BIOME_DEFS } from '../../src/data/biomes';
import { SPECIES } from '../../src/data/creatures';
import {
  carriedPace,
  computePace,
  donationsPerSecond,
  habitatSlots,
  incubationSeconds,
  offlineEarnings,
  unlockedBiomesForPace,
  upgradeCost,
} from '../../src/sim/economy';
import { creatureIncome } from '../../src/sim/rolls';
import type { OwnedCreature, UpgradeId } from '../../src/sim/types';

const NO_UPGRADES: Record<UpgradeId, number> = {
  trainingTrack: 0,
  boots: 0,
  incubator: 0,
  habitatSlots: 0,
  fieldGuide: 0,
};

describe('pace', () => {
  it('starts at the documented base speed', () => {
    expect(computePace(NO_UPGRADES)).toBe(MOVEMENT.basePace);
  });

  it('adds a flat half a metre per Training Track level', () => {
    expect(computePace({ ...NO_UPGRADES, trainingTrack: 6 })).toBeCloseTo(9, 5);
  });

  it('multiplies by Boots on top of the Track', () => {
    const track = computePace({ ...NO_UPGRADES, trainingTrack: 6 });
    const withBoots = computePace({ ...NO_UPGRADES, trainingTrack: 6, boots: 4 });
    expect(withBoots).toBeGreaterThan(track);
  });

  it('is capped so no upgrade combination can outrun the animation system', () => {
    expect(
      computePace({ trainingTrack: 99, boots: 99, incubator: 0, habitatSlots: 0, fieldGuide: 0 }),
    ).toBeLessThanOrEqual(22);
  });

  it('applies the documented carry penalty per rarity', () => {
    expect(carriedPace(10, null)).toBe(10);
    expect(carriedPace(10, 'common')).toBeCloseTo(9.2, 5);
    expect(carriedPace(10, 'secret')).toBeCloseTo(6.5, 5);
  });

  it('makes every rarer egg strictly slower to carry -- the risk dial works', () => {
    const rarities = [
      'common',
      'uncommon',
      'rare',
      'epic',
      'legendary',
      'mythic',
      'secret',
    ] as const;
    for (let i = 1; i < rarities.length; i++) {
      expect(carriedPace(10, rarities[i]!)).toBeLessThan(carriedPace(10, rarities[i - 1]!));
    }
  });
});

describe('unlocks', () => {
  it('opens biome one for free and nothing else', () => {
    expect(unlockedBiomesForPace(MOVEMENT.basePace)).toEqual(['glade']);
  });

  it('opens Mirrormere at exactly its gate', () => {
    expect(unlockedBiomesForPace(8.99)).toEqual(['glade']);
    expect(unlockedBiomesForPace(9.0)).toEqual(['glade', 'mirrormere']);
  });

  it('opens Amber Dunes at exactly its gate', () => {
    expect(unlockedBiomesForPace(13.0)).toEqual(['glade', 'mirrormere', 'dunes']);
  });

  it('gates rise monotonically, so progression never goes backwards', () => {
    const gates = Object.values(BIOME_DEFS)
      .sort((a, b) => a.order - b.order)
      .map((b) => b.paceGate);
    for (let i = 1; i < gates.length; i++) {
      expect(gates[i]!).toBeGreaterThan(gates[i - 1]!);
    }
  });
});

describe('upgrade costs', () => {
  it('follows base x curve^n', () => {
    // Read the curve from the data rather than hard-coding it: these numbers
    // are tuned by the pacing simulation and are expected to move.
    const { baseCost, curve } = UPGRADE_DEFS.trainingTrack;
    expect(upgradeCost('trainingTrack', 0)).toBe(baseCost);
    expect(upgradeCost('trainingTrack', 1)).toBe(Math.round(baseCost * curve));
    expect(upgradeCost('trainingTrack', 3)).toBe(Math.round(baseCost * Math.pow(curve, 3)));
  });

  it('keeps the first Training Track level reachable inside the first minute', () => {
    // A child needs to buy something almost immediately or the shop reads as
    // locked. Glade income starts around 3-6 per second.
    expect(upgradeCost('trainingTrack', 0)).toBeLessThan(4 * 60);
  });

  it('always increases, so there is never a cheaper next level', () => {
    for (const id of Object.keys(UPGRADE_DEFS) as UpgradeId[]) {
      for (let level = 0; level < 10; level++) {
        expect(upgradeCost(id, level + 1)).toBeGreaterThan(upgradeCost(id, level));
      }
    }
  });
});

describe('habitats and incubation', () => {
  it('starts with four slots and adds one per upgrade, to a cap', () => {
    expect(habitatSlots(NO_UPGRADES)).toBe(ECONOMY.habitatSlotsStart);
    expect(habitatSlots({ ...NO_UPGRADES, habitatSlots: 3 })).toBe(7);
    expect(habitatSlots({ ...NO_UPGRADES, habitatSlots: 999 })).toBe(ECONOMY.habitatSlotsCap);
  });

  it('shortens incubation by 15% a level, down to an eight second floor', () => {
    expect(incubationSeconds(0)).toBe(30);
    expect(incubationSeconds(1)).toBeCloseTo(25.5, 1);
    expect(incubationSeconds(50)).toBe(8);
  });

  it('never lets incubation reach zero, so the hatch always has anticipation', () => {
    for (let level = 0; level < 40; level++) {
      expect(incubationSeconds(level)).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('income', () => {
  it('multiplies mutation and size together', () => {
    const base = 10;
    expect(
      creatureIncome({ speciesId: 'x', rarity: 'common', mutation: 'prism', size: 'huge' }, base),
    ).toBeCloseTo(10 * 8 * 2, 5);
  });

  it('sums only creatures actually placed in a habitat', () => {
    const creatures: OwnedCreature[] = [
      {
        uid: 'a',
        speciesId: 'mossling',
        rarity: 'common',
        mutation: 'none',
        size: 'normal',
        slot: 0,
      },
      {
        uid: 'b',
        speciesId: 'mossling',
        rarity: 'common',
        mutation: 'none',
        size: 'normal',
        slot: null,
      },
    ];
    expect(donationsPerSecond(creatures)).toBeCloseTo(3, 5);
  });

  it('keeps each biome strictly richer than the last', () => {
    // Otherwise there is no reason to push forward, and farming biome one
    // forever becomes the optimal strategy.
    const order = ['glade', 'mirrormere', 'dunes'] as const;
    for (let i = 1; i < order.length; i++) {
      const previous = BIOME_DEFS[order[i - 1]!].incomeRange;
      const current = BIOME_DEFS[order[i]!].incomeRange;
      expect(current[0]).toBeGreaterThan(previous[1]);
    }
  });

  it('every species sits inside its biome income range', () => {
    for (const species of SPECIES) {
      const [low, high] = BIOME_DEFS[species.biome].incomeRange;
      expect(species.baseIncome, `${species.id} is outside its biome range`).toBeGreaterThanOrEqual(
        low,
      );
      expect(species.baseIncome, `${species.id} is outside its biome range`).toBeLessThanOrEqual(
        high,
      );
    }
  });
});

describe('offline earnings -- a child-safety constraint, not a balance one', () => {
  it('is capped at two hours however long the tab was closed', () => {
    const dps = 100;
    const twoHours = ECONOMY.offlineCapHours * 3600;
    const capped = offlineEarnings(dps, twoHours * 1000);
    expect(offlineEarnings(dps, twoHours * 10 * 1000)).toBe(capped);
    expect(offlineEarnings(dps, 30 * 24 * 3600 * 1000)).toBe(capped);
  });

  it('pays less than half of what actually playing pays', () => {
    // Leaving the tab open must never be the optimal strategy.
    const dps = 50;
    const oneHourMs = 3600 * 1000;
    const idle = offlineEarnings(dps, oneHourMs);
    const played = dps * 3600;
    expect(idle).toBeLessThan(played * 0.51);
  });

  it('never pays for negative time', () => {
    expect(offlineEarnings(100, -50_000)).toBe(0);
  });

  it('pays nothing when there are no creatures earning', () => {
    expect(offlineEarnings(0, 3600 * 1000)).toBe(0);
  });
});

describe('the tuning targets themselves', () => {
  it('states the pacing windows the brief asks for', () => {
    expect(PACING_TARGETS.firstEggSeconds).toBe(60);
    expect(PACING_TARGETS.mirrormereMinutes).toEqual([12, 18]);
    expect(PACING_TARGETS.dunesMinutes).toEqual([45, 70]);
  });
});
