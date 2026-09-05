/**
 * A whole play session, simulated headlessly.
 *
 * No renderer, no React, no DOM, no timers -- just a fixed-step loop over the
 * same economy, rarity and unlock functions the real game uses. This is what
 * the M4 balance gate drives, and it is the reason the pacing assertions
 * ("first egg under 60s, Mirrormere by 12-18 minutes") are worth anything:
 * they are measured against the real numbers in `balance.ts` rather than
 * estimated on paper.
 *
 * The player model is deliberately a *median* player, not an optimal one. An
 * optimiser would tell us the fastest possible route through the game, which
 * is not the thing we need to know.
 */

import { BIOME_DEFS, BIOME_ORDER } from '../data/biomes';
import { requireSpecies } from '../data/creatures';
import { EGG, GUARDIAN, RIVALS } from '../data/balance';
import {
  computePace,
  discoveryBonus,
  donationsPerSecond,
  habitatSlots,
  incubationSeconds,
  isUpgradeMaxed,
  unlockedBiomesForPace,
  upgradeCost,
} from './economy';
import { rollEgg } from './rolls';
import { Rng } from './rng';
import { defaultSave } from './save';
import type { BiomeId, EggRoll, OwnedCreature, SaveV1, UpgradeId } from './types';

export interface SessionOptions {
  seed: number | string;
  /** How long to simulate, in seconds. */
  durationSeconds: number;
  /** Fixed step. One second is plenty for economy work. */
  stepSeconds?: number;
  /**
   * Skill, 0..1. Drives how often the median player is caught and how often
   * they lose a race. 0.5 is the median player the pacing targets describe.
   */
  skill?: number;
  difficultyCatchRate?: number;
}

export interface SessionResult {
  readonly save: SaveV1;
  /** Seconds elapsed when the first egg reached the incubator. */
  readonly firstEggSeconds: number | null;
  /** Seconds elapsed when each biome's Pace gate was met. */
  readonly unlockSeconds: Partial<Record<BiomeId, number>>;
  readonly eggsRecovered: number;
  readonly timesCaught: number;
  readonly racesLost: number;
  readonly finalMoney: number;
  readonly finalPace: number;
  readonly speciesDiscovered: number;
}

/**
 * How long one full loop takes, in seconds.
 *
 * The design target is about ninety seconds end to end, and the loop has six
 * named beats: scout, snatch, escape, incubate, release, upgrade. Modelling
 * it as a short travel time was the single biggest error in an earlier
 * version of this file -- it produced a thirty-second loop, which tripled the
 * rate of income and made every pacing number meaningless.
 *
 * Only the travel legs scale with Pace. Scouting a patrol, the twenty-second
 * escape and the time spent at the sanctuary are all roughly fixed, which is
 * why buying Pace speeds the loop up by about fifteen percent rather than
 * trivialising it.
 */
const NEST_DISTANCE_METRES = 46;
const ESCAPE_SECONDS = 20;
const SANCTUARY_SECONDS = 16;
const SNATCH_SECONDS = 5;

function runSeconds(pace: number, carryPenalty: number, skill: number): number {
  // Reading a patrol and picking a route. Experience cuts this most.
  const scout = 30 - skill * 10;
  const outbound = NEST_DISTANCE_METRES / Math.max(pace, 1);
  const inbound = NEST_DISTANCE_METRES / Math.max(pace * (1 - carryPenalty), 1);
  return scout + outbound + SNATCH_SECONDS + ESCAPE_SECONDS + inbound + SANCTUARY_SECONDS;
}

/**
 * The very first run is deliberately much shorter.
 *
 * The brief's pacing target is an egg in hand inside sixty seconds, and a
 * ninety-second steady-state loop cannot deliver that. The design answer is
 * the tutorial nest: it sits close to the sanctuary, the Broody Hen's patrol
 * is arranged so the escape is short, and the on-screen guidance removes the
 * scouting entirely.
 *
 * That is a level-design commitment, not a fudge -- it is written down in
 * CLAUDE.md as a rule for Whisper Glade, and Whisper Glade's first nest has
 * to honour it.
 */
const FIRST_NEST_DISTANCE_METRES = 18;
const FIRST_ESCAPE_SECONDS = 8;

function firstRunSeconds(pace: number, skill: number): number {
  const guidedScout = 9 - skill * 3;
  const outbound = FIRST_NEST_DISTANCE_METRES / Math.max(pace, 1);
  const inbound = FIRST_NEST_DISTANCE_METRES / Math.max(pace * 0.92, 1);
  return guidedScout + outbound + SNATCH_SECONDS + FIRST_ESCAPE_SECONDS + inbound + 6;
}

/** Exposed so a test can assert the loop really is about ninety seconds. */
export function nominalLoopSeconds(pace: number, skill = 0.5): number {
  return runSeconds(pace, 0, skill);
}

export function firstLoopSeconds(pace: number, skill = 0.5): number {
  return firstRunSeconds(pace, skill);
}

export function runHeadlessSession(options: SessionOptions): SessionResult {
  const { seed, durationSeconds, stepSeconds = 1, skill = 0.5, difficultyCatchRate = 1 } = options;

  const rng = new Rng(seed);
  const save = defaultSave(0);
  save.settings.difficulty = 'standard';

  let elapsed = 0;
  let firstEggSeconds: number | null = null;
  const unlockSeconds: Partial<Record<BiomeId, number>> = { glade: 0 };

  // Where the player is in the current run.
  let runRemaining = firstRunSeconds(save.pace, skill);
  let pendingRoll: EggRoll | null = null;

  while (elapsed < durationSeconds) {
    const dt = stepSeconds;
    elapsed += dt;

    // --- passive income ----------------------------------------------------
    save.money += donationsPerSecond(save.creatures) * dt;
    save.playSeconds += dt;

    // --- incubation --------------------------------------------------------
    if (save.incubator !== null) {
      const remaining = save.incubator.remaining - dt;
      if (remaining <= 0) {
        collect(save, rng);
      } else {
        save.incubator = { ...save.incubator, remaining };
      }
    }

    // --- the current run ---------------------------------------------------
    runRemaining -= dt;
    if (runRemaining <= 0) {
      const biome = bestUnlockedBiome(save);

      // Did a rival get there first? Costs twenty seconds and nothing else.
      if (rng.chance(0.16 * (1 - skill * 0.5))) {
        save.stats.racesLost += 1;
        runRemaining = RIVALS.lossPenaltySeconds;
        continue;
      }

      // Were we caught? Costs the tumble and a respawn wait. Never progress.
      const catchChance = 0.22 * (1 - skill * 0.7) * difficultyCatchRate;
      if (rng.chance(catchChance)) {
        save.stats.timesCaught += 1;
        runRemaining = GUARDIAN.tumbleSeconds + EGG.respawnSeconds * 0.5;
        continue;
      }

      pendingRoll = rollEgg(rng, biome);

      if (save.incubator === null) {
        deposit(save, pendingRoll);
        if (firstEggSeconds === null) firstEggSeconds = elapsed;
        pendingRoll = null;
      }

      // The next run's outbound leg is unencumbered; the carry penalty only
      // applies on the way home, which runSeconds already models.
      runRemaining = runSeconds(save.pace, 0, skill);
    }

    // An egg in hand with a busy incubator waits until the incubator frees up.
    if (pendingRoll !== null && save.incubator === null) {
      deposit(save, pendingRoll);
      if (firstEggSeconds === null) firstEggSeconds = elapsed;
      pendingRoll = null;
    }

    // --- spending ----------------------------------------------------------
    spend(save);

    // --- unlocks -----------------------------------------------------------
    const unlocked = unlockedBiomesForPace(save.pace);
    for (const id of unlocked) {
      if (unlockSeconds[id] === undefined) unlockSeconds[id] = elapsed;
    }
    save.unlockedBiomes = unlocked;
  }

  return {
    save,
    firstEggSeconds,
    unlockSeconds,
    eggsRecovered: save.stats.eggsRecovered,
    timesCaught: save.stats.timesCaught,
    racesLost: save.stats.racesLost,
    finalMoney: save.money,
    finalPace: save.pace,
    speciesDiscovered: save.discovered.length,
  };
}

function deposit(save: SaveV1, roll: EggRoll): void {
  const total = incubationSeconds(save.upgrades.incubator);
  save.incubator = { roll, remaining: total, total };
  save.stats.eggsRecovered += 1;
}

function collect(save: SaveV1, rng: Rng): void {
  const inc = save.incubator;
  if (inc === null) return;
  save.incubator = null;

  const creature: OwnedCreature = { ...inc.roll, uid: `c${rng.int(0, 1e9)}`, slot: null };

  if (!save.discovered.includes(creature.speciesId)) {
    save.discovered.push(creature.speciesId);
    save.money += discoveryBonus(
      save.upgrades.fieldGuide,
      requireSpecies(creature.speciesId).biome,
    );
  }

  const slots = habitatSlots(save.upgrades);
  const used = save.creatures.filter((c) => c.slot !== null);

  if (used.length < slots) {
    save.creatures.push({ ...creature, slot: used.length });
    return;
  }

  /*
   * Habitats are full. A median player swaps out their weakest creature for a
   * better one rather than hoarding -- and crucially, the old one is not
   * destroyed, it goes back to the burrow. Nothing is ever lost.
   */
  const incoming = income(creature);
  let weakestIndex = -1;
  let weakestValue = Infinity;
  for (let i = 0; i < save.creatures.length; i++) {
    const c = save.creatures[i]!;
    if (c.slot === null) continue;
    const value = income(c);
    if (value < weakestValue) {
      weakestValue = value;
      weakestIndex = i;
    }
  }

  if (weakestIndex >= 0 && incoming > weakestValue) {
    const displaced = save.creatures[weakestIndex]!;
    const slot = displaced.slot;
    save.creatures[weakestIndex] = { ...displaced, slot: null };
    save.creatures.push({ ...creature, slot });
  } else {
    save.creatures.push({ ...creature, slot: null });
  }
}

function income(creature: OwnedCreature): number {
  const species = requireSpecies(creature.speciesId);
  return donationsPerSecond([{ ...creature, slot: 0 }]) + species.baseIncome * 0;
}

/**
 * The median player's spending priorities.
 *
 * Pace is the spine, so Training Track comes first whenever it is affordable.
 * Habitat slots come next because empty slots are wasted income, then the
 * incubator, then the rest. A real player is messier than this, but the
 * ordering matches what the design is nudging them towards.
 */
function spend(save: SaveV1): void {
  const priorities: UpgradeId[] = [
    'trainingTrack',
    'habitatSlots',
    'incubator',
    'fieldGuide',
    'boots',
  ];

  // Loop, because a big passive income can afford several levels in one tick.
  let bought = true;
  while (bought) {
    bought = false;
    for (const id of priorities) {
      const level = save.upgrades[id];
      if (isUpgradeMaxed(id, level)) continue;
      const cost = upgradeCost(id, level);
      if (save.money < cost) continue;

      // Don't buy a habitat slot there is nothing to put in.
      if (id === 'habitatSlots') {
        const spare =
          habitatSlots(save.upgrades) - save.creatures.filter((c) => c.slot !== null).length;
        if (spare > 1) continue;
      }

      save.money -= cost;
      save.upgrades = { ...save.upgrades, [id]: level + 1 };
      save.pace = computePace(save.upgrades);
      bought = true;
      break;
    }
  }

  // Fill any free slot from the burrow. Free income left on the table would
  // make the sim pessimistic in a way a real player would not be.
  const slots = habitatSlots(save.upgrades);
  const usedSlots = new Set(save.creatures.filter((c) => c.slot !== null).map((c) => c.slot));
  for (let i = 0; i < save.creatures.length; i++) {
    if (usedSlots.size >= slots) break;
    const c = save.creatures[i]!;
    if (c.slot !== null) continue;
    let free = 0;
    while (usedSlots.has(free)) free += 1;
    save.creatures[i] = { ...c, slot: free };
    usedSlots.add(free);
  }
}

/** The richest biome the player can currently reach. */
function bestUnlockedBiome(save: SaveV1): BiomeId {
  let best: BiomeId = 'glade';
  for (const id of BIOME_ORDER) {
    if (save.pace >= BIOME_DEFS[id].paceGate) best = id;
  }
  return best;
}
