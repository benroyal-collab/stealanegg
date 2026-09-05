/**
 * Guardian finite state machine.
 *
 * Patrol -> Alert (1.2s) -> Investigate (6s) -> Chase -> GiveUp (4s without
 * line of sight) -> Cooldown (8s) -> Patrol. Drowsy is an orthogonal state
 * entered by feeding a Sleepy Berry; it resolves back to Patrol.
 *
 * Every transition is a pure function of (state, perception, dt). No timers,
 * no three.js, no store -- which is exactly why the transition table is
 * exhaustively unit-tested.
 */

import { DIFFICULTY_MODS, GUARDIAN } from '../data/balance';
import type {
  Difficulty,
  GuardianConfig,
  GuardianPerceptionInput,
  GuardianRuntime,
  GuardianState,
  Vec2,
} from './types';

export function createGuardianRuntime(): GuardianRuntime {
  return {
    state: 'patrol',
    timeInState: 0,
    timeSinceContact: Infinity,
    investigateTarget: null,
    drowsyFor: 0,
  };
}

export interface PerceptionResult {
  /** True when the guardian can currently see the player. */
  readonly sees: boolean;
  /** True when the player is inside the audible radius. */
  readonly hears: boolean;
  /** 0..1, used to drive the alert meter in the HUD. */
  readonly strength: number;
}

/**
 * Can this guardian perceive the player right now?
 *
 * Sight needs range, cone and an unbroken line. Hearing ignores the cone
 * entirely -- that is what makes the Dune Scorpion's "plan around your own
 * noise" mechanic work, and what makes crouching in the reeds meaningful.
 */
export function perceive(
  config: GuardianConfig,
  input: GuardianPerceptionInput,
  difficulty: Difficulty,
  drowsy: boolean,
): PerceptionResult {
  const mods = DIFFICULTY_MODS[difficulty];
  const carryBonus = input.playerIsCarrying ? GUARDIAN.carryPerceptionBonus : 1;
  const drowsyFactor = drowsy ? 0.4 : 1;
  const range = config.visionRange * mods.perception * carryBonus * drowsyFactor;
  const halfCone = (config.visionConeDegrees * (drowsy ? 0.6 : 1)) / 2;

  const inCone = Math.abs(input.angleToPlayer) <= halfCone;
  const inRange = input.distance <= range;
  const sees = inCone && inRange && input.hasLineOfSight;

  const audible = input.noiseRadius * mods.perception * carryBonus * drowsyFactor;
  const hears = audible > 0 && input.distance <= audible;

  let strength = 0;
  if (sees) {
    // Closer and more central reads as more urgent.
    const distanceTerm = 1 - input.distance / Math.max(range, 0.001);
    const angleTerm = 1 - Math.abs(input.angleToPlayer) / Math.max(halfCone, 0.001);
    strength = Math.max(strength, 0.45 + 0.55 * distanceTerm * (0.4 + 0.6 * angleTerm));
  }
  if (hears) {
    strength = Math.max(strength, 0.3 * (1 - input.distance / Math.max(audible, 0.001)));
  }

  return { sees, hears, strength: clamp01(strength) };
}

export interface GuardianStepInput {
  readonly config: GuardianConfig;
  readonly perception: PerceptionResult;
  readonly difficulty: Difficulty;
  /** Where the player is, so Investigate has somewhere to walk to. */
  readonly playerPosition: Vec2;
  /** Set when a thrown tool has just landed and should pull attention. */
  readonly lure: Vec2 | null;
  /** Set for the frame in which a Sleepy Berry is eaten. */
  readonly sleepTriggered: boolean;
  readonly dt: number;
}

export interface GuardianStepResult {
  readonly state: GuardianState;
  readonly changed: boolean;
  /** Movement speed the guardian should use this frame. */
  readonly speed: number;
  /** Where it should be heading, or null to continue its patrol route. */
  readonly target: Vec2 | null;
}

/**
 * Advance the FSM by `dt` seconds. Mutates `rt` in place -- guardians are
 * pooled and this runs every frame for every guardian in the biome, so
 * allocating a new runtime object here would be a per-frame allocation in a
 * hot path.
 */
export function stepGuardian(rt: GuardianRuntime, input: GuardianStepInput): GuardianStepResult {
  const { config, perception, difficulty, dt } = input;
  const mods = DIFFICULTY_MODS[difficulty];
  const before = rt.state;

  rt.timeInState += dt;
  rt.timeSinceContact = perception.sees || perception.hears ? 0 : rt.timeSinceContact + dt;

  // Drowsy pre-empts everything except the passage of time.
  if (input.sleepTriggered && rt.state !== 'drowsy') {
    setState(rt, 'drowsy');
    rt.drowsyFor = config.drowsySeconds;
  }

  // A thrown lure is the loudest thing in the world for a moment.
  if (input.lure !== null && rt.state !== 'drowsy' && rt.state !== 'chase') {
    rt.investigateTarget = { ...input.lure };
    if (rt.state !== 'investigate') setState(rt, 'investigate');
    else rt.timeInState = 0;
  }

  switch (rt.state) {
    case 'patrol': {
      if (perception.sees) setState(rt, 'alert');
      else if (perception.hears) {
        rt.investigateTarget = { ...input.playerPosition };
        setState(rt, 'investigate');
      }
      break;
    }

    case 'alert': {
      if (!perception.sees && !perception.hears) {
        // Lost it before the meter filled. Go and have a look anyway.
        rt.investigateTarget = { ...input.playerPosition };
        setState(rt, 'investigate');
      } else if (rt.timeInState >= config.alertSeconds * mods.alertTime) {
        setState(rt, 'chase');
      }
      break;
    }

    case 'investigate': {
      if (perception.sees) setState(rt, 'alert');
      else if (rt.timeInState >= config.investigateSeconds) {
        setState(rt, 'cooldown');
      }
      break;
    }

    case 'chase': {
      if (rt.timeSinceContact >= config.giveUpSeconds * mods.giveUpTime) {
        setState(rt, 'giveUp');
      }
      break;
    }

    case 'giveUp': {
      // A short, readable "hmph" beat before it turns around.
      if (perception.sees) setState(rt, 'chase');
      else if (rt.timeInState >= GUARDIAN.giveUpBeatSeconds) setState(rt, 'cooldown');
      break;
    }

    case 'cooldown': {
      // Deliberately dulled: the player gets a guaranteed window to reset.
      if (rt.timeInState >= config.cooldownSeconds) setState(rt, 'patrol');
      else if (perception.sees && rt.timeInState > config.cooldownSeconds * 0.5) {
        setState(rt, 'alert');
      }
      break;
    }

    case 'drowsy': {
      rt.drowsyFor -= dt;
      if (rt.drowsyFor <= 0) setState(rt, 'patrol');
      break;
    }

    default:
      return assertNever(rt.state);
  }

  return {
    state: rt.state,
    changed: rt.state !== before,
    speed: speedFor(rt.state, config, mods.guardianSpeed),
    target: targetFor(rt, input),
  };
}

function speedFor(state: GuardianState, config: GuardianConfig, mod: number): number {
  switch (state) {
    case 'patrol':
      return config.patrolSpeed * mod;
    case 'alert':
      return config.patrolSpeed * 0.35 * mod;
    case 'investigate':
      return config.patrolSpeed * 1.5 * mod;
    case 'chase':
      return config.chaseSpeed * mod;
    case 'giveUp':
      return 0;
    case 'cooldown':
      return config.patrolSpeed * 0.8 * mod;
    case 'drowsy':
      return config.patrolSpeed * GUARDIAN.drowsySpeedMultiplier * mod;
    default:
      return assertNever(state);
  }
}

function targetFor(rt: GuardianRuntime, input: GuardianStepInput): Vec2 | null {
  switch (rt.state) {
    case 'chase':
    case 'alert':
      return input.playerPosition;
    case 'investigate':
      return rt.investigateTarget;
    case 'patrol':
    case 'giveUp':
    case 'cooldown':
    case 'drowsy':
      return null;
    default:
      return assertNever(rt.state);
  }
}

function setState(rt: GuardianRuntime, next: GuardianState): void {
  rt.state = next;
  rt.timeInState = 0;
}

/** True when this state should make the chase music play. */
export function isHostileState(state: GuardianState): boolean {
  return state === 'alert' || state === 'chase';
}

/** Noise radius the player is currently generating, in metres. */
export function noiseRadiusFor(
  gait: 'idle' | 'crouch' | 'walk' | 'sprint',
  inWater: boolean,
): number {
  const base = GUARDIAN.hearing[gait];
  // Splashing gives you away even when you are creeping.
  return inWater ? Math.max(base, base * 1.6, 3.5) : base;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled guardian state: ${String(value)}`);
}
