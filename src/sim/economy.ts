/**
 * Money in, money out. Pure functions over save state -- no timers, no
 * store, no side effects, so the economy test can run a whole session
 * through these in a few milliseconds.
 */

import {
  CARRY_PENALTY,
  ECONOMY,
  INCUBATION,
  PACE,
  UPGRADE_DEFS,
  MOVEMENT,
} from '../data/balance';
import { BIOME_DEFS, BIOME_ORDER } from '../data/biomes';
import { requireSpecies } from '../data/creatures';
import { creatureIncome } from './rolls';
import type { BiomeId, OwnedCreature, Rarity, SaveV1, UpgradeId } from './types';

/** Cost of taking `upgrade` from its current level to the next one. */
export function upgradeCost(upgrade: UpgradeId, currentLevel: number): number {
  const def = UPGRADE_DEFS[upgrade];
  return Math.round(def.baseCost * Math.pow(def.curve, currentLevel));
}

export function isUpgradeMaxed(upgrade: UpgradeId, currentLevel: number): boolean {
  return currentLevel >= UPGRADE_DEFS[upgrade].maxLevel;
}

/**
 * Pace is the spine. Training Track adds, Boots multiply, and the result is
 * clamped so no combination of upgrades can outrun the animation system.
 */
export function computePace(upgrades: Record<UpgradeId, number>): number {
  const base = MOVEMENT.basePace + upgrades.trainingTrack * PACE.trackPerLevel;
  const boosted = base * (1 + upgrades.boots * PACE.bootsPerLevel);
  return Math.min(PACE.cap, Math.round(boosted * 1000) / 1000);
}

/** Effective speed while holding an egg of the given rarity. */
export function carriedPace(pace: number, rarity: Rarity | null): number {
  if (rarity === null) return pace;
  return pace * (1 - CARRY_PENALTY[rarity]);
}

export function habitatSlots(upgrades: Record<UpgradeId, number>): number {
  return Math.min(ECONOMY.habitatSlotsCap, ECONOMY.habitatSlotsStart + upgrades.habitatSlots);
}

export function incubationSeconds(incubatorLevel: number): number {
  const scaled = INCUBATION.baseSeconds * Math.pow(1 - INCUBATION.reductionPerLevel, incubatorLevel);
  return Math.max(INCUBATION.floorSeconds, Math.round(scaled * 100) / 100);
}

/** Total donations per second from every creature currently in a habitat. */
export function donationsPerSecond(creatures: readonly OwnedCreature[]): number {
  let total = 0;
  for (const c of creatures) {
    if (c.slot === null) continue;
    total += creatureIncome(c, requireSpecies(c.speciesId).baseIncome);
  }
  return total;
}

/** One-off payout for adding a species to the Field Guide for the first time. */
export function discoveryBonus(fieldGuideLevel: number, biome: BiomeId): number {
  const biomeScale = BIOME_DEFS[biome].incomeRange[0];
  const base = ECONOMY.discoveryBonusBase + biomeScale * 4;
  return Math.round(base * (1 + fieldGuideLevel * ECONOMY.discoveryBonusPerLevel));
}

/**
 * Offline earnings, capped hard at two hours and paid at half rate.
 *
 * This is deliberately a poor deal. Leaving the tab open must never be the
 * optimal strategy -- that is a child-safety requirement, not a balance one.
 */
export function offlineEarnings(dps: number, awayMs: number): number {
  const cappedSeconds = Math.min(awayMs / 1000, ECONOMY.offlineCapHours * 3600);
  return Math.max(0, Math.floor(dps * cappedSeconds * ECONOMY.offlineRate));
}

/** Biomes whose pace gate the player has met. Biome one is always open. */
export function unlockedBiomesForPace(pace: number): BiomeId[] {
  return BIOME_ORDER.filter((id) => pace >= BIOME_DEFS[id].paceGate);
}

export function nextLockedBiome(pace: number): BiomeId | null {
  for (const id of BIOME_ORDER) {
    if (pace < BIOME_DEFS[id].paceGate) return id;
  }
  return null;
}

/** Everything the HUD needs about money, derived rather than stored. */
export interface EconomySnapshot {
  readonly dps: number;
  readonly pace: number;
  readonly slotsUsed: number;
  readonly slotsTotal: number;
  readonly nextBiome: BiomeId | null;
  readonly nextBiomePaceGate: number | null;
}

export function snapshot(save: SaveV1): EconomySnapshot {
  const pace = computePace(save.upgrades);
  const next = nextLockedBiome(pace);
  return {
    dps: donationsPerSecond(save.creatures),
    pace,
    slotsUsed: save.creatures.filter((c) => c.slot !== null).length,
    slotsTotal: habitatSlots(save.upgrades),
    nextBiome: next,
    nextBiomePaceGate: next === null ? null : BIOME_DEFS[next].paceGate,
  };
}
