import { describe, expect, it } from 'vitest';
import { BIOME_DEFS } from '../../src/data/biomes';
import { CHASE, GUARDIAN, MOVEMENT, PACE } from '../../src/data/balance';
import {
  createGuardianRuntime,
  isHostileState,
  noiseRadiusFor,
  perceive,
  stepGuardian,
  type PerceptionResult,
} from '../../src/sim/guardian';
import type { Difficulty, GuardianConfig, GuardianState, Vec2 } from '../../src/sim/types';

const CONFIG: GuardianConfig = BIOME_DEFS.glade.guardian;
const ORIGIN: Vec2 = { x: 0, z: 0 };
const DT = 1 / 60;

function seen(strength = 0.8): PerceptionResult {
  return { sees: true, hears: false, strength };
}
function heard(strength = 0.3): PerceptionResult {
  return { sees: false, hears: true, strength };
}
function blind(): PerceptionResult {
  return { sees: false, hears: false, strength: 0 };
}

function step(
  rt: ReturnType<typeof createGuardianRuntime>,
  perception: PerceptionResult,
  seconds: number,
  difficulty: Difficulty = 'standard',
  lure: Vec2 | null = null,
  sleep = false,
): void {
  const frames = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < frames; i++) {
    stepGuardian(rt, {
      config: CONFIG,
      perception,
      difficulty,
      playerPosition: ORIGIN,
      lure: i === 0 ? lure : null,
      sleepTriggered: sleep && i === 0,
      snatchAlarm: false,
      playerPace: MOVEMENT.basePace,
      dt: DT,
    });
  }
}

describe('guardian perception', () => {
  it('sees the player inside the cone, in range, with line of sight', () => {
    const result = perceive(
      CONFIG,
      {
        distance: 8,
        angleToPlayer: 10,
        hasLineOfSight: true,
        noiseRadius: 0,
        playerIsCarrying: false,
      },
      'standard',
      false,
    );
    expect(result.sees).toBe(true);
    expect(result.strength).toBeGreaterThan(0);
  });

  it('is blind outside the cone even at point-blank range', () => {
    const result = perceive(
      CONFIG,
      {
        distance: 1,
        angleToPlayer: 90,
        hasLineOfSight: true,
        noiseRadius: 0,
        playerIsCarrying: false,
      },
      'standard',
      false,
    );
    expect(result.sees).toBe(false);
  });

  it('is blind when the line of sight is broken -- reeds and rocks work', () => {
    const result = perceive(
      CONFIG,
      {
        distance: 5,
        angleToPlayer: 0,
        hasLineOfSight: false,
        noiseRadius: 0,
        playerIsCarrying: false,
      },
      'standard',
      false,
    );
    expect(result.sees).toBe(false);
  });

  it('hears through cover and behind its own back', () => {
    const result = perceive(
      CONFIG,
      {
        distance: 6,
        angleToPlayer: 175,
        hasLineOfSight: false,
        noiseRadius: 12,
        playerIsCarrying: false,
      },
      'standard',
      false,
    );
    expect(result.sees).toBe(false);
    expect(result.hears).toBe(true);
  });

  it('cannot hear a crouching player at all', () => {
    const result = perceive(
      CONFIG,
      {
        distance: 0.5,
        angleToPlayer: 180,
        hasLineOfSight: false,
        noiseRadius: noiseRadiusFor('crouch', false),
        playerIsCarrying: false,
      },
      'standard',
      false,
    );
    expect(result.hears).toBe(false);
  });

  it('hears a crouching player who is wading, because splashing gives you away', () => {
    expect(noiseRadiusFor('crouch', true)).toBeGreaterThan(0);
    expect(noiseRadiusFor('sprint', true)).toBeGreaterThan(noiseRadiusFor('sprint', false));
  });

  it('notices a carried egg from further away', () => {
    const base = perceive(
      CONFIG,
      {
        distance: 14.5,
        angleToPlayer: 0,
        hasLineOfSight: true,
        noiseRadius: 0,
        playerIsCarrying: false,
      },
      'standard',
      false,
    );
    const carrying = perceive(
      CONFIG,
      {
        distance: 14.5,
        angleToPlayer: 0,
        hasLineOfSight: true,
        noiseRadius: 0,
        playerIsCarrying: true,
      },
      'standard',
      false,
    );
    expect(base.sees).toBe(false);
    expect(carrying.sees).toBe(true);
  });

  it('is duller when drowsy', () => {
    const awake = perceive(
      CONFIG,
      {
        distance: 12,
        angleToPlayer: 5,
        hasLineOfSight: true,
        noiseRadius: 0,
        playerIsCarrying: false,
      },
      'standard',
      false,
    );
    const drowsy = perceive(
      CONFIG,
      {
        distance: 12,
        angleToPlayer: 5,
        hasLineOfSight: true,
        noiseRadius: 0,
        playerIsCarrying: false,
      },
      'standard',
      true,
    );
    expect(awake.sees).toBe(true);
    expect(drowsy.sees).toBe(false);
  });

  it('scales perception by difficulty, and Relaxed really is easier', () => {
    const at = (difficulty: Difficulty): boolean =>
      perceive(
        CONFIG,
        {
          distance: 12,
          angleToPlayer: 5,
          hasLineOfSight: true,
          noiseRadius: 0,
          playerIsCarrying: false,
        },
        difficulty,
        false,
      ).sees;
    expect(at('relaxed')).toBe(false);
    expect(at('standard')).toBe(true);
    expect(at('ranger')).toBe(true);
  });
});

describe('guardian transition table', () => {
  it('patrols until something happens', () => {
    const rt = createGuardianRuntime();
    step(rt, blind(), 30);
    expect(rt.state).toBe('patrol');
  });

  it('patrol -> alert on sight', () => {
    const rt = createGuardianRuntime();
    step(rt, seen(), DT);
    expect(rt.state).toBe('alert');
  });

  it('patrol -> investigate on sound alone', () => {
    const rt = createGuardianRuntime();
    step(rt, heard(), DT);
    expect(rt.state).toBe('investigate');
    expect(rt.investigateTarget).not.toBeNull();
  });

  it('alert -> chase after the alert window', () => {
    const rt = createGuardianRuntime();
    step(rt, seen(), CONFIG.alertSeconds + 0.2);
    expect(rt.state).toBe('chase');
  });

  it('alert -> investigate when contact is lost before the window closes', () => {
    const rt = createGuardianRuntime();
    step(rt, seen(), DT);
    step(rt, blind(), DT);
    expect(rt.state).toBe('investigate');
  });

  it('investigate -> alert when it spots you', () => {
    const rt = createGuardianRuntime();
    step(rt, heard(), DT);
    step(rt, seen(), DT);
    expect(rt.state).toBe('alert');
  });

  it('investigate -> cooldown when it runs out of patience', () => {
    const rt = createGuardianRuntime();
    step(rt, heard(), DT);
    step(rt, blind(), CONFIG.investigateSeconds + 0.2);
    expect(rt.state).toBe('cooldown');
  });

  it('chase -> giveUp after the no-contact window', () => {
    const rt = createGuardianRuntime();
    step(rt, seen(), CONFIG.alertSeconds + 0.2);
    expect(rt.state).toBe('chase');
    step(rt, blind(), CONFIG.giveUpSeconds + 0.2);
    expect(rt.state).toBe('giveUp');
  });

  it('chase persists while it can still see you', () => {
    const rt = createGuardianRuntime();
    step(rt, seen(), CONFIG.alertSeconds + 0.2);
    step(rt, seen(), 30);
    expect(rt.state).toBe('chase');
  });

  it('giveUp -> chase if you reappear during the hmph', () => {
    const rt = createGuardianRuntime();
    step(rt, seen(), CONFIG.alertSeconds + 0.2);
    step(rt, blind(), CONFIG.giveUpSeconds + 0.2);
    expect(rt.state).toBe('giveUp');
    step(rt, seen(), DT);
    expect(rt.state).toBe('chase');
  });

  it('giveUp -> cooldown -> patrol', () => {
    const rt = createGuardianRuntime();
    step(rt, seen(), CONFIG.alertSeconds + 0.2);
    step(rt, blind(), CONFIG.giveUpSeconds + 0.2);
    step(rt, blind(), 1.1);
    expect(rt.state).toBe('cooldown');
    step(rt, blind(), CONFIG.cooldownSeconds + 0.2);
    expect(rt.state).toBe('patrol');
  });

  it('guarantees a reset window: early cooldown ignores being seen', () => {
    // The player is owed a clean getaway after escaping. Being re-detected
    // one frame later would make the escape meaningless.
    const rt = createGuardianRuntime();
    step(rt, seen(), CONFIG.alertSeconds + 0.2);
    step(rt, blind(), CONFIG.giveUpSeconds + 0.2);
    step(rt, blind(), 1.1);
    expect(rt.state).toBe('cooldown');
    // Named, not derived. This used to be half the cooldown, so shortening
    // the cooldown to re-arm the world faster silently halved the breather.
    step(rt, seen(), GUARDIAN.resetWindowSeconds * 0.5);
    expect(rt.state).toBe('cooldown');
  });

  it('wakes from a late cooldown if you walk straight back into view', () => {
    const rt = createGuardianRuntime();
    step(rt, heard(), DT);
    step(rt, blind(), CONFIG.investigateSeconds + 0.2);
    expect(rt.state).toBe('cooldown');
    step(rt, blind(), CONFIG.cooldownSeconds * 0.6);
    step(rt, seen(), DT);
    expect(rt.state).toBe('alert');
  });

  it('a thrown lure pulls it to investigate that spot, not the player', () => {
    const rt = createGuardianRuntime();
    const lure: Vec2 = { x: 12, z: -4 };
    step(rt, blind(), DT, 'standard', lure);
    expect(rt.state).toBe('investigate');
    expect(rt.investigateTarget).toEqual(lure);
  });

  it('a lure cannot rescue you mid-chase', () => {
    // Otherwise a seed pouch is an escape button and the chase has no teeth.
    const rt = createGuardianRuntime();
    step(rt, seen(), CONFIG.alertSeconds + 0.2);
    expect(rt.state).toBe('chase');
    step(rt, seen(), DT, 'standard', { x: 20, z: 20 });
    expect(rt.state).toBe('chase');
  });

  it('sleepy berries drop it into drowsy from any state, including a chase', () => {
    const rt = createGuardianRuntime();
    step(rt, seen(), CONFIG.alertSeconds + 0.2);
    expect(rt.state).toBe('chase');
    step(rt, seen(), DT, 'standard', null, true);
    expect(rt.state).toBe('drowsy');
  });

  it('drowsy resolves back to patrol after its timer', () => {
    const rt = createGuardianRuntime();
    step(rt, blind(), DT, 'standard', null, true);
    expect(rt.state).toBe('drowsy');
    step(rt, blind(), CONFIG.drowsySeconds + 0.3);
    expect(rt.state).toBe('patrol');
  });

  it('ignores the player entirely while drowsy, however visible they are', () => {
    // The berry has to be worth using. A guardian that wakes the instant you
    // step in front of it is a wasted item.
    const rt = createGuardianRuntime();
    step(rt, blind(), DT, 'standard', null, true);
    step(rt, seen(), CONFIG.drowsySeconds - 0.5);
    expect(rt.state).toBe('drowsy');
  });

  it('alerts immediately on waking if the player is still standing there', () => {
    const rt = createGuardianRuntime();
    step(rt, blind(), DT, 'standard', null, true);
    step(rt, seen(), CONFIG.drowsySeconds + 0.3);
    expect(rt.state).toBe('alert');
  });

  it('moves at a sensible speed in every state', () => {
    const states: GuardianState[] = [
      'patrol',
      'alert',
      'investigate',
      'chase',
      'giveUp',
      'cooldown',
      'drowsy',
    ];
    for (const state of states) {
      const rt = createGuardianRuntime();
      rt.state = state;
      const result = stepGuardian(rt, {
        config: CONFIG,
        perception: blind(),
        difficulty: 'standard',
        playerPosition: ORIGIN,
        lure: null,
        sleepTriggered: false,
        snatchAlarm: false,
        playerPace: MOVEMENT.basePace,
        dt: DT,
      });
      expect(Number.isFinite(result.speed)).toBe(true);
      expect(result.speed).toBeGreaterThanOrEqual(0);
      expect(result.speed).toBeLessThanOrEqual(MOVEMENT.basePace * CHASE.lungeFraction * 1.2);
    }
  });

  it('only alert and chase count as hostile, so the music only plays then', () => {
    expect(isHostileState('alert')).toBe(true);
    expect(isHostileState('chase')).toBe(true);
    for (const calm of ['patrol', 'investigate', 'giveUp', 'cooldown', 'drowsy'] as const) {
      expect(isHostileState(calm)).toBe(false);
    }
  });

  it('reaches chase faster on Ranger than on Relaxed', () => {
    const timeToChase = (difficulty: Difficulty): number => {
      const rt = createGuardianRuntime();
      let t = 0;
      while (rt.state !== 'chase' && t < 10) {
        stepGuardian(rt, {
          config: CONFIG,
          perception: seen(),
          difficulty,
          playerPosition: ORIGIN,
          lure: null,
          sleepTriggered: false,
          snatchAlarm: false,
          playerPace: MOVEMENT.basePace,
          dt: DT,
        });
        t += DT;
      }
      return t;
    };
    expect(timeToChase('ranger')).toBeLessThan(timeToChase('standard'));
    expect(timeToChase('standard')).toBeLessThan(timeToChase('relaxed'));
  });

  it('never leaves a legal state, whatever it is fed', () => {
    const legal = new Set<GuardianState>([
      'patrol',
      'alert',
      'investigate',
      'chase',
      'giveUp',
      'cooldown',
      'drowsy',
    ]);
    const rt = createGuardianRuntime();
    let seed = 991;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200_000; i++) {
      const result = stepGuardian(rt, {
        config: CONFIG,
        perception: {
          sees: rand() > 0.7,
          hears: rand() > 0.6,
          strength: rand(),
        },
        difficulty: (['relaxed', 'standard', 'ranger'] as const)[Math.floor(rand() * 3)]!,
        playerPosition: { x: rand() * 100 - 50, z: rand() * 100 - 50 },
        lure: rand() > 0.98 ? { x: rand() * 40, z: rand() * 40 } : null,
        sleepTriggered: rand() > 0.995,
        snatchAlarm: rand() > 0.99,
        playerPace: 1 + rand() * 25,
        dt: rand() * 0.06,
      });
      expect(legal.has(result.state)).toBe(true);
      expect(Number.isFinite(result.speed)).toBe(true);
    }
  });
});

describe('guardian tuning sanity', () => {
  /*
   * The assertion this replaces was called "every biome guardian can outrun a
   * starting player" and checked `chaseSpeed > patrolSpeed` -- it compared the
   * guardian to itself and would have passed at any speed whatsoever. It did
   * pass, for months, while Whisper Glade's guardian chased at 4.2 m/s against
   * a 6.0 m/s sprint, and a child reported that they could walk home carrying
   * a stolen egg.
   *
   * So these measure pursuit against the player, which is the only comparison
   * that means anything.
   */
  const lunge = (def: { guardian: { chaseAggression: number } }, pace: number): number =>
    pace * def.guardian.chaseAggression * CHASE.lungeFraction;

  it('every biome guardian outruns a starting player during its lunge', () => {
    for (const def of Object.values(BIOME_DEFS)) {
      expect(lunge(def, MOVEMENT.basePace), `${def.id} cannot catch anyone`).toBeGreaterThan(
        MOVEMENT.basePace,
      );
    }
  });

  it('still outruns a fully upgraded player, because pursuit scales with Pace', () => {
    for (const def of Object.values(BIOME_DEFS)) {
      expect(lunge(def, PACE.cap), `${def.id} is obsolete at max Pace`).toBeGreaterThan(PACE.cap);
    }
  });

  it('settles just below the player once the lunge is spent', () => {
    // A clean line wins; a fumbled corner does not. Above 1.0 the chase is
    // unwinnable by running and becomes a countdown; below about 0.9 it stops
    // being a chase at all. Flat across biomes, on purpose.
    expect(CHASE.sustainedFraction).toBeLessThan(1);
    expect(CHASE.sustainedFraction).toBeGreaterThan(0.9);
  });

  it('never stops dead while it still believes it is hunting', () => {
    // The old giveUp state returned a literal zero. Nothing signals "you are
    // safe" like a pursuer standing still.
    expect(CHASE.huntFraction).toBeGreaterThan(0.5);
  });

  it('the Swan is fast but corners badly, which is its whole gimmick', () => {
    const swan = BIOME_DEFS.mirrormere.guardian;
    const hen = BIOME_DEFS.glade.guardian;
    expect(swan.chaseAggression).toBeGreaterThan(hen.chaseAggression);
    expect(swan.turnRate).toBeLessThan(hen.turnRate);
  });

  it('the Hen is the gentlest guardian, because she is the tutorial', () => {
    const hen = BIOME_DEFS.glade.guardian;
    for (const def of Object.values(BIOME_DEFS)) {
      if (def.id === 'glade') continue;
      expect(hen.visionRange).toBeLessThanOrEqual(def.guardian.visionRange);
      expect(hen.chaseAggression).toBeLessThanOrEqual(def.guardian.chaseAggression);
    }
  });

  it('every biome shares one chase rhythm', () => {
    // Each biome used to spell out its own alert and give-up timings, and they
    // had drifted away from balance.ts -- the file everyone reads described a
    // guardian that did not exist. Biomes vary by perception and aggression
    // only.
    for (const def of Object.values(BIOME_DEFS)) {
      expect(def.guardian.alertSeconds).toBe(GUARDIAN.alertSeconds);
      expect(def.guardian.giveUpSeconds).toBe(GUARDIAN.giveUpSeconds);
      expect(def.guardian.cooldownSeconds).toBe(GUARDIAN.cooldownSeconds);
    }
  });

  it('reacts almost instantly, because a wind-up is a free head start', () => {
    expect(GUARDIAN.alertSeconds).toBeLessThan(0.5);
  });

  it('being caught costs about a second and nothing else', () => {
    // Failure costs time, never progress -- and three seconds face-down is an
    // eternity at eight years old.
    expect(GUARDIAN.tumbleSeconds).toBeLessThan(1.5);
    expect(GUARDIAN.tumbleSeconds).toBeGreaterThan(0.5);
  });
});
