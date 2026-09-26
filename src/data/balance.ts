/**
 * Every tuning number in the game lives here.
 *
 * If you find a gameplay constant anywhere else in the codebase, that is a
 * bug. The economy test in tests/unit/economy.test.ts reads these values and
 * asserts the pacing windows they produce, so this file is under test.
 */

import type { Difficulty, MutationId, Rarity, SizeId, UpgradeId } from '../sim/types';

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export const MOVEMENT = {
  basePace: 6.0,
  walkSpeed: 2.6,
  crouchSpeed: 1.4,
  /**
   * Jogging (stick held, sprint not held) as a fraction of Pace.
   *
   * Expressed as a fraction rather than a fixed speed on purpose: it keeps
   * the sprint-to-jog gear change at a constant 1.67x no matter how many
   * Training Track levels the player has bought. A fixed jog speed would make
   * sprint feel more and more dramatic as Pace rose, and an additive blend
   * would do the same thing more slowly. Neither is what we want -- the gear
   * change should feel identical in every biome.
   */
  jogFraction: 0.6,
  /** Ground acceleration, m/s^2. High enough to feel responsive, not twitchy. */
  acceleration: 42,
  deceleration: 30,
  airAcceleration: 9,
  /** How fast the character model turns to face travel, degrees/sec. */
  turnRate: 900,
  gravity: -26,
  jumpVelocity: 7.6,
  /** Feel targets from the brief. Do not "round these off". */
  coyoteTimeMs: 120,
  inputBufferMs: 150,
  hitstopMs: 80,
  maxSlopeDegrees: 48,
  stepHeight: 0.45,
  /** Vault is offered when an obstacle top lands inside this band. */
  vaultMinHeight: 0.5,
  vaultMaxHeight: 1.45,
  vaultDurationMs: 380,
  slideDurationMs: 620,
  slideBoost: 1.35,
  slideFriction: 3.1,
  slideMinEntrySpeed: 5.0,
  capsuleRadius: 0.34,
  /**
   * Cylinder section only -- total capsule height is this plus two radii, so
   * 0.95 + 0.68 gives a 1.63m character. The ranger is a child, and a capsule
   * sized for an adult left them visibly hovering above their own feet.
   */
  capsuleHeight: 0.95,
  crouchCapsuleHeight: 0.5,
} as const;

export const STAMINA = {
  maxSeconds: 6,
  refillSeconds: 4,
  regenDelaySeconds: 1,
  /** Sprinting below this is refused so the player never stutters. */
  minToStart: 0.6,
  /**
   * After the bar empties, sprint stays locked out until it has recovered to
   * this fraction. Without it, holding sprint on an empty bar produces a
   * sprint/walk stutter every few frames -- the classic bad stamina feel.
   */
  exhaustRecoverFraction: 0.55,

  /**
   * Adrenaline: how much slower the bar drains while something is chasing you.
   *
   * Without this the arithmetic is simply unfair. A guardian pursues for seven
   * seconds and the bar buys six, so every chase ended with the player walking
   * and the guardian jogging up behind them -- the escape was lost to a
   * spreadsheet rather than to a mistake.
   *
   * It also puts the game's best sensation where the danger is: you can run
   * furthest exactly when it matters, which is the opposite of a resource that
   * punishes you for being in trouble. Scaled by how close the pursuer
   * actually is, so it is a reward for nerve rather than a free refill.
   *
   * 0.75 gives eight seconds of sprint against a seven second pursuit: a full
   * bar covers exactly one clean escape and nothing more. At 0.45 it gave
   * thirteen, which deleted the decision -- stamina stopped being a resource
   * and starting a heist on a half-empty bar stopped being a mistake.
   */
  adrenalineDrainMultiplier: 0.75,
} as const;

export const CAMERA = {
  distance: 5.4,
  height: 1.85,
  shoulderOffset: 0.55,
  pitchMin: -38,
  pitchMax: 62,
  /** Spring-arm smoothing half-life in seconds; lower is snappier. */
  positionHalfLife: 0.075,
  rotationHalfLife: 0.05,
  collisionRadius: 0.28,
  fovBase: 55,
  /**
   * Widened from 68. Perceived speed is mostly peripheral flow, not metres
   * per second -- six metres a second at a 55 degree FOV reads as a jog, and
   * the same speed at 78 reads as a sprint.
   */
  fovSprint: 78,
  /**
   * Extra degrees at full pursuit pressure, on top of the sprint FOV.
   *
   * The world stretches as something closes on you. Small, because this
   * stacks with the sprint punch and a camera that lurches is a camera a
   * child cannot aim.
   */
  fovChase: 7,
  /**
   * How far the arm pulls back at full pursuit pressure.
   *
   * Two things at once: more of the world streams past the edges of the
   * frame, and -- the point -- the thing chasing you comes into shot. A
   * pursuer you cannot see is not frightening, it is just a number.
   */
  chasePullback: 1.5,
  /**
   * Continuous shake while something is on your heels, 0..1 of full shake.
   *
   * Deliberately gentle and, like every other shake, suppressed entirely
   * under reduced motion.
   */
  chaseShake: 0.22,
  fovLerpMs: 220,
  handheldAmplitude: 0.0032,
  handheldFrequency: 0.55,
  shakeDecay: 5.5,
} as const;

// ---------------------------------------------------------------------------
// Eggs
// ---------------------------------------------------------------------------

/** Carry penalty as a fraction of Pace removed while holding the egg. */
export const CARRY_PENALTY: Record<Rarity, number> = {
  common: 0.08,
  uncommon: 0.12,
  rare: 0.17,
  epic: 0.22,
  legendary: 0.27,
  mythic: 0.31,
  secret: 0.35,
};

/** Relative weights for a rarity roll. Normalised at roll time. */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 1.0,
  uncommon: 0.55,
  rare: 0.28,
  epic: 0.12,
  legendary: 0.045,
  mythic: 0.012,
  secret: 0.001,
};

export const MUTATION_ODDS: Record<MutationId, number> = {
  none: 0.8,
  golden: 0.1,
  frosted: 0.05,
  storm: 0.035,
  prism: 0.015,
};

export const MUTATION_MULTIPLIER: Record<MutationId, number> = {
  none: 1,
  golden: 2,
  frosted: 2.5,
  storm: 4,
  prism: 8,
};

export const SIZE_ODDS: Record<SizeId, number> = {
  tiny: 0.2,
  normal: 0.55,
  big: 0.2,
  huge: 0.05,
};

export const SIZE_MULTIPLIER: Record<SizeId, number> = {
  tiny: 0.8,
  normal: 1.0,
  big: 1.4,
  huge: 2.0,
};

export const SIZE_MESH_SCALE: Record<SizeId, number> = {
  tiny: 0.72,
  normal: 1.0,
  big: 1.28,
  huge: 1.62,
};

export const EGG = {
  respawnSeconds: 20,
  /** Rare and above only re-roll on this slower cycle. */
  rarePlusCycleSeconds: 300,
  /**
   * Generous on purpose.
   *
   * A child lining up a pickup should not have to be precise about it, and
   * every centimetre of tolerance here comes straight off the frustration
   * budget. The escape is where the skill lives; the grab is not.
   */
  grabRadius: 2.6,
  depositRadius: 3.2,
} as const;

// ---------------------------------------------------------------------------
// Guardians
// ---------------------------------------------------------------------------

/**
 * World layout that the pacing model depends on.
 *
 * `sim/session.ts` measures "first egg inside sixty seconds" over a walk of
 * exactly `tutorialNestDistance` metres. If the world does not put a nest
 * there, or does not leave a lane wide enough to walk it, that assertion is
 * measuring a route the player cannot take. Both numbers live here so the
 * simulation, the level and the tests read the same one.
 */
export const WORLD = {
  /** Nest zero sits this far straight ahead of the spawn, in every biome. */
  tutorialNestDistance: 18,
  /** Radius around the sanctuary kept free of foliage. */
  sanctuaryClearRadius: 5.5,
  /**
   * The sanctuary clearing, centred on the spawn. It is home, and home is
   * safe: no guardian sees you, follows you or knocks you over inside it.
   *
   * Without this a guardian patrolling nest zero -- eighteen metres out, on
   * a loop up to ten metres wide -- could wander into the clearing and
   * flatten a child who was standing at the spawn and had not yet touched
   * anything. The shot gate caught one doing exactly that.
   */
  sanctuaryRadius: 11,
  /** Guardians stop this far outside the clearing's edge: about one body. */
  guardianKeepOut: 1.2,
  /**
   * Half-width of the cleared lane from the sanctuary out to nest zero.
   *
   * Every station collider is at most 1.1m in half-width and the player
   * capsule is 0.34, so two metres is a corridor a child cannot get wedged in.
   */
  spawnCorridorHalfWidth: 2,
} as const;

/**
 * The chase, which is the game.
 *
 * Playtest, verbatim: "once I'd grabbed an egg I could literally walk back."
 * That was accurate, and it was not one bad number -- the escape was
 * structurally absent:
 *
 * - Whisper Glade's guardian chased at 4.2 m/s against a 6.0 m/s sprint. It
 *   could not close the distance even at full commitment, in the one biome
 *   every child actually played.
 * - It spent 1.2 seconds in `alert` at a third of walking speed before the
 *   chase began. By the time it moved, the player was seven metres gone.
 * - It gave up four seconds after losing sight and then stopped dead --
 *   `speedFor` returned a literal zero -- before pottering at 1.2 m/s.
 * - Taking an egg out of a nest alerted nobody at all. The loudest act in the
 *   game was silent.
 *
 * So the chase is rebuilt around two ideas. First, **the snatch is an alarm**:
 * lifting an egg puts every guardian in earshot straight into pursuit, with no
 * perception check and no ramp. Second, **pursuit speed is a fraction of the
 * player's own Pace**, not a fixed number. A guardian that is always just
 * behind you is thrilling at every Pace level; an absolute speed is either
 * impossible at level one or irrelevant at level twenty, and this one managed
 * to be irrelevant immediately.
 */
export const CHASE = {
  /**
   * Speed as a fraction of the player's *carried* Pace.
   *
   * The lunge is above 1.0 on purpose: for the first couple of seconds the
   * guardian gains, whatever the player does, and the gap closing is the whole
   * sensation. Sustained sits just under 1.0, so a clean line slowly wins and
   * a fumbled corner does not.
   */
  lungeFraction: 1.12,
  /**
   * Flat across every biome, and deliberately not scaled by aggression.
   *
   * Aggression multiplies the lunge, which is where a biome's character
   * lives. If it multiplied this too, Mirrormere's sustained pursuit came out
   * at 1.006x Pace -- permanently faster than the player, so the only escape
   * would be a guardian's own give-up timer. That is not a chase, it is a
   * countdown.
   *
   * 0.97 rather than something safer because the arithmetic was checked
   * rather than guessed: at 0.94 a player who simply held sprint in a
   * straight line escaped every pursuit in every biome with metres to spare,
   * which is a formality, not a thrill. At 0.97 the guardian stays glued to
   * your shoulder and the gap only opens by about eighty centimetres across a
   * whole pursuit, so whether you get away is decided by the lunge, by how
   * close it was when the alarm went off, and by whether you clip a tree.
   */
  sustainedFraction: 0.97,
  lungeSeconds: 2.2,

  /**
   * Lifting an egg wakes every guardian within this radius, instantly.
   *
   * Generous, because the alarm is the fun. A nest that can be robbed without
   * consequence is a pickup, not a heist.
   */
  snatchAlarmRadius: 34,

  /**
   * How many guardians answer one alarm.
   *
   * The nearest two, not everything in earshot. Unlimited responders turned a
   * heist into a dogpile: nine guardians converging on one nest is not
   * frightening, it is a wall, and a child cannot read it, escape it or learn
   * anything from it. Two is enough to feel hunted and leaves the escape
   * solvable, which is the difference between tense and unfair.
   */
  snatchAlarmMaxResponders: 2,

  /**
   * How long a guardian keeps hunting after losing contact.
   *
   * Was four seconds, which meant breaking line of sight ended the run. Seven
   * keeps the pressure on across a corner, so the escape is a route rather
   * than a single turn.
   */
  pursuitSeconds: 7,

  /**
   * Speed while hunting a last-known position, as a fraction of Pace.
   *
   * The old `giveUp` state returned zero -- the guardian stopped, mid-stride,
   * the instant it lost you. Nothing reads as "you are safe now" more clearly
   * than a pursuer standing still, and nothing kills a chase faster.
   */
  huntFraction: 0.82,

  /**
   * Distance over which a pursuer's menace fades, beyond the catch radius.
   *
   * One number feeds the camera shake, the danger vignette and the audio mix,
   * so the fright always matches the real distance. A fixed sting that fires
   * on "chase started" is the same whether the guardian is two metres behind
   * you or twenty, and children read that as noise within one run.
   */
  pressureFalloffMetres: 12,
} as const;

export const GUARDIAN = {
  visionConeDegrees: 60,
  visionRange: 18,
  hearing: { sprint: 12, walk: 5, crouch: 0, idle: 0 },
  /**
   * Barely a beat. This is the double-take before the sprint, not a wind-up:
   * long enough to read as a reaction, short enough that the player never
   * gets a free head start for standing in plain sight.
   */
  alertSeconds: 0.3,
  investigateSeconds: 2.5,
  giveUpSeconds: CHASE.pursuitSeconds,
  /** The short, readable "hmph" beat before it turns around. */
  giveUpBeatSeconds: 0.6,
  /**
   * Short, so the world re-arms fast. A long cooldown is a lull, and a child
   * who has just escaped wants the next run, not a rest.
   */
  cooldownSeconds: 3,
  drowsySeconds: 8,
  drowsySpeedMultiplier: 0.35,
  /** A carried egg is conspicuous: perception radius scales up. */
  carryPerceptionBonus: 1.15,
  /**
   * After a catch, how long a guardian in cooldown ignores the player.
   *
   * The guaranteed breather: get up, get your bearings, go again. It used to
   * be derived as half the cooldown, so shortening the cooldown to re-arm the
   * world faster silently halved the breather too. Naming it keeps the two
   * decisions separate.
   */
  resetWindowSeconds: 1.4,
  catchRadius: 1.35,
  /**
   * A stumble, not a sit-down.
   *
   * Three seconds face-down is an eternity at eight years old, and the egg is
   * dropped where you fell -- so the comeback is a scramble worth having
   * rather than a punishment. Failure still costs time and never progress.
   */
  tumbleSeconds: 1.1,
} as const;

/** Difficulty is a set of multipliers, never a content gate. */
export const DIFFICULTY_MODS: Record<
  Difficulty,
  { guardianSpeed: number; perception: number; alertTime: number; giveUpTime: number }
> = {
  relaxed: { guardianSpeed: 0.78, perception: 0.75, alertTime: 1.6, giveUpTime: 0.65 },
  standard: { guardianSpeed: 1.0, perception: 1.0, alertTime: 1.0, giveUpTime: 1.0 },
  ranger: { guardianSpeed: 1.15, perception: 1.2, alertTime: 0.75, giveUpTime: 1.35 },
};

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

export const ECONOMY = {
  startingMoney: 0,
  habitatSlotsStart: 4,
  habitatSlotsCap: 20,
  upgradeCurve: 1.65,
  /** Field Guide pays this once per newly discovered species. */
  discoveryBonusBase: 40,
  discoveryBonusPerLevel: 0.6,
  /** Offline earnings are capped hard. Idling must never beat playing. */
  offlineCapHours: 2,
  offlineRate: 0.5,
  breakReminderMinutes: 45,
} as const;

export const UPGRADE_DEFS: Record<
  UpgradeId,
  { baseCost: number; curve: number; maxLevel: number; label: string; icon: string }
> = {
  /**
   * Training Track is the spine, so it is the steepest curve in the game and
   * the one the 200-session simulation was tuned against.
   *
   * The brief's opening pass was 250 x 1.75^n. Run against the real economy
   * that unlocked Mirrormere at about twelve minutes and Amber Dunes at
   * thirty -- Mirrormere just inside its window, Amber Dunes far ahead of the
   * 45-70 minute one. The fix is a cheaper first rung and a much steeper
   * climb: the opening levels stay reachable inside the first minute, which
   * is where a child needs to feel progress, and the late ones absorb the
   * compounding income that mutations produce. See tests/unit/pacing.test.ts.
   */
  trainingTrack: {
    baseCost: 150,
    curve: 2.2,
    maxLevel: 24,
    label: 'Training Track',
    icon: 'boot-run',
  },
  boots: { baseCost: 600, curve: 1.65, maxLevel: 8, label: 'Springy Boots', icon: 'boot' },
  incubator: { baseCost: 320, curve: 1.65, maxLevel: 10, label: 'Incubator', icon: 'egg-warm' },
  habitatSlots: { baseCost: 400, curve: 1.65, maxLevel: 16, label: 'Habitat Slot', icon: 'fence' },
  fieldGuide: { baseCost: 500, curve: 1.65, maxLevel: 6, label: 'Field Guide', icon: 'book' },
};

export const PACE = {
  /** Training Track adds a flat amount of Pace per level. */
  trackPerLevel: 0.5,
  /**
   * Boots multiply the result. Kept deliberately small.
   *
   * At 0.045 they were a cheap parallel route to the Pace gates -- eight
   * levels bought a 36% speed increase for a fraction of what the equivalent
   * Track levels cost, and the simulation showed players reaching Mirrormere
   * through Boots rather than through the Track. That breaks design law #2:
   * one stat is the spine, and it should have one main sink.
   */
  bootsPerLevel: 0.028,
  /** Hard ceiling so animation and physics never fall apart. */
  cap: 22,
} as const;

export const INCUBATION = {
  baseSeconds: 30,
  reductionPerLevel: 0.15,
  floorSeconds: 8,
} as const;

// ---------------------------------------------------------------------------
// Rivals
// ---------------------------------------------------------------------------

export const RIVALS = {
  /** Seconds of pure time cost when a rival beats you to a nest. */
  lossPenaltySeconds: 20,
  telegraphSeconds: 4,
  minIntervalSeconds: 26,
  maxIntervalSeconds: 48,
  travelSeconds: 14,
} as const;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const TOOL_DEFS = {
  seedPouch: {
    label: 'Seed Pouch',
    icon: 'seeds',
    cooldownSeconds: 8,
    throwSpeed: 15,
    lureRadius: 9,
    lureSeconds: 5,
    startingCount: 3,
  },
  sleepyBerries: {
    label: 'Sleepy Berries',
    icon: 'berry',
    cooldownSeconds: 14,
    throwSpeed: 13,
    lureRadius: 6,
    lureSeconds: 8,
    startingCount: 1,
  },
  whistle: {
    label: 'Ranger Whistle',
    icon: 'whistle',
    cooldownSeconds: 20,
    throwSpeed: 0,
    lureRadius: 20,
    lureSeconds: 4,
    startingCount: 0,
  },
} as const;

// ---------------------------------------------------------------------------
// Pacing targets. The economy test asserts against these exact windows.
// ---------------------------------------------------------------------------

export const PACING_TARGETS = {
  firstEggSeconds: 60,
  mirrormereMinutes: [12, 18] as const,
  dunesMinutes: [45, 70] as const,
} as const;

export const PERFORMANCE_BUDGET = {
  cpuFrameMs: 6,
  gpuFrameMs: 12,
  drawCalls: 450,
  triangles: 1_200_000,
} as const;
