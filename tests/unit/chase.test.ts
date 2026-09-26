import { describe, expect, it } from 'vitest';
import { BIOME_DEFS } from '../../src/data/biomes';
import { CARRY_PENALTY, CHASE, GUARDIAN, MOVEMENT, STAMINA } from '../../src/data/balance';
import { createGuardianRuntime, standDown, stepGuardian } from '../../src/sim/guardian';
import type { BiomeId } from '../../src/sim/types';

/**
 * Can the guardian actually catch anybody?
 *
 * This file exists because the previous answer was no, in every biome, at
 * every difficulty, and nothing noticed for months. A child reported it:
 * "once I'd grabbed an egg I could literally walk back." They were right --
 * Whisper Glade pursued at 4.2 m/s against a 6.0 m/s sprint and a 2.6 m/s
 * walk.
 *
 * The test that should have caught it was called "every biome guardian can
 * outrun a starting player" and compared the guardian's chase speed to its own
 * patrol speed. It would have passed at any value whatsoever.
 *
 * So this one simulates the thing the name claims: a real pursuit, driven by
 * the real FSM, integrating the real gap, and asserts where the danger starts
 * and stops. Speeds come out of `stepGuardian` rather than being recomputed
 * here, or this would be measuring its own arithmetic again.
 */

const DT = 0.02;
const CARRYING = MOVEMENT.basePace * (1 - CARRY_PENALTY.common);
const JOG = MOVEMENT.basePace * MOVEMENT.jogFraction;
/** A full bar buys this much sprint while something is chasing you. */
const SPRINT_SECONDS = STAMINA.maxSeconds / STAMINA.adrenalineDrainMultiplier;

interface Run {
  biome: BiomeId;
  /** Gap in metres at the moment the alarm goes off. */
  startGap: number;
  /** Seconds into the pursuit that the player loses a second to a mistake. */
  stumbleAt?: number;
}

/** Play out one pursuit and report whether it ended in a catch. */
function pursue({ biome, startGap, stumbleAt }: Run): boolean {
  const config = BIOME_DEFS[biome].guardian;
  const rt = createGuardianRuntime();
  let gap = startGap;

  for (let t = 0; t < CHASE.pursuitSeconds; t += DT) {
    const result = stepGuardian(rt, {
      config,
      // It can see the player the whole way: this measures the footrace, not
      // the perception system.
      perception: { sees: true, hears: true, strength: 1 },
      difficulty: 'standard',
      playerPosition: { x: 0, z: 0 },
      lure: null,
      sleepTriggered: false,
      snatchAlarm: t === 0,
      playerPace: CARRYING,
      dt: DT,
    });

    const stumbling = stumbleAt !== undefined && t >= stumbleAt && t < stumbleAt + 1;
    const player = stumbling ? 0 : t < SPRINT_SECONDS ? CARRYING : JOG;
    gap += (player - result.speed) * DT;
    if (gap <= GUARDIAN.catchRadius) return true;
  }
  return false;
}

const BIOMES = Object.keys(BIOME_DEFS) as BiomeId[];

describe('the chase', () => {
  it('catches a player who robs a nest under a guardian’s nose', () => {
    // Two metres away when the alarm goes off. Nothing saves you.
    for (const biome of BIOMES) {
      expect(pursue({ biome, startGap: 2 }), `${biome} let a point-blank theft go`).toBe(true);
    }
  });

  it('lets a clean sprint away from a sensible distance get home', () => {
    // Twelve metres and no mistakes. Skill has to be rewarded or the chase is
    // a coin toss and children stop trying.
    for (const biome of BIOMES) {
      expect(pursue({ biome, startGap: 12 }), `${biome} is inescapable`).toBe(false);
    }
  });

  it('punishes a single fumble, which is what makes it tense', () => {
    // One second lost to a tree, from a gap that would otherwise be safe.
    for (const biome of BIOMES) {
      expect(
        pursue({ biome, startGap: 8, stumbleAt: 2.5 }),
        `${biome} forgives a stumble, so there is nothing at stake`,
      ).toBe(true);
    }
  });

  it('gains ground during the lunge, whatever the player does', () => {
    // The sensation the whole game is built on: for the first couple of
    // seconds it is coming, and running does not change that.
    for (const biome of BIOMES) {
      const config = BIOME_DEFS[biome].guardian;
      const lungeSpeed = CARRYING * config.chaseAggression * CHASE.lungeFraction;
      expect(lungeSpeed, `${biome} never closes`).toBeGreaterThan(CARRYING);
    }
  });

  it('gives a full stamina bar enough sprint for exactly one escape', () => {
    // Enough to cover a pursuit, and not much more -- so setting off on a
    // half-empty bar is a real decision rather than a detail.
    expect(SPRINT_SECONDS).toBeGreaterThan(CHASE.pursuitSeconds);
    expect(SPRINT_SECONDS).toBeLessThan(CHASE.pursuitSeconds * 1.5);
  });

  it('wakes the neighbours when an egg is lifted, without needing to see it', () => {
    const rt = createGuardianRuntime();
    const result = stepGuardian(rt, {
      config: BIOME_DEFS.glade.guardian,
      // Blind and deaf. The alarm is the sound of its own nest being robbed.
      perception: { sees: false, hears: false, strength: 0 },
      difficulty: 'standard',
      playerPosition: { x: 10, z: 0 },
      lure: null,
      sleepTriggered: false,
      snatchAlarm: true,
      playerPace: CARRYING,
      dt: DT,
    });
    expect(result.state).toBe('chase');
  });

  it('backs off after a catch, so a tumble is a setback and not a pin', () => {
    /*
     * The tumble lasts about a second and the catch radius is 1.35 metres, so
     * a guardian that stays in `chase` after catching you simply knocks you
     * over again the moment you stand up. A cold-start run walked to within
     * four metres of the first nest and then stood in one spot for the rest
     * of the test being repeatedly flattened by the same hen.
     */
    const rt = createGuardianRuntime();
    rt.state = 'chase';
    standDown(rt);
    expect(rt.state).toBe('cooldown');

    // And it ignores the player for the whole reset window.
    let t = 0;
    while (t < GUARDIAN.resetWindowSeconds * 0.9) {
      stepGuardian(rt, {
        config: BIOME_DEFS.glade.guardian,
        perception: { sees: true, hears: true, strength: 1 },
        difficulty: 'standard',
        playerPosition: { x: 0, z: 0 },
        lure: null,
        sleepTriggered: false,
        snatchAlarm: false,
        playerPace: CARRYING,
        dt: DT,
      });
      t += DT;
    }
    expect(rt.state).toBe('cooldown');
  });

  it('still sleeps through the alarm, so the berry is worth carrying', () => {
    const rt = createGuardianRuntime();
    rt.state = 'drowsy';
    rt.drowsyFor = 5;
    const result = stepGuardian(rt, {
      config: BIOME_DEFS.glade.guardian,
      perception: { sees: true, hears: true, strength: 1 },
      difficulty: 'standard',
      playerPosition: { x: 1, z: 0 },
      lure: null,
      sleepTriggered: false,
      snatchAlarm: true,
      playerPace: CARRYING,
      dt: DT,
    });
    expect(result.state).toBe('drowsy');
  });
});
