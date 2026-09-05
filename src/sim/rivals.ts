/**
 * Rival collector clubs.
 *
 * They exist to create urgency, and nothing else. The constraints from the
 * brief are absolute: they never touch, chase or attack the player, and
 * losing a race costs exactly twenty seconds and no progress.
 *
 * Deliberately a scripted timing device rather than a pathfinding agent. They
 * pick a nest, telegraph it with a visible route marker for four seconds,
 * travel for a fixed duration, and claim the egg if they arrive first. That
 * gives the pressure the design wants with total predictability -- a child
 * can always see who is going where and decide whether to contest it -- and
 * it costs essentially no CPU.
 */

import { RIVALS } from '../data/balance';
import type { Rng } from './rng';
import type { Vec2 } from './types';

export type RivalPhase = 'idle' | 'telegraph' | 'travelling' | 'returning';

export interface Rival {
  readonly id: string;
  readonly club: string;
  phase: RivalPhase;
  /** Seconds left in the current phase. */
  timer: number;
  /** Nest index this rival is heading for, or null when idle. */
  targetNest: number | null;
  /** Where it starts from and returns to, on the edge of the map. */
  readonly home: Vec2;
  position: Vec2;
  /** 0..1 along its current route, for rendering. */
  progress: number;
}

export interface RivalWorld {
  /** Nest positions, indexed as the rest of the game indexes them. */
  readonly nests: readonly Vec2[];
  /** Nests that currently hold an egg. */
  readonly occupied: readonly boolean[];
}

export interface RivalEvent {
  readonly type: 'targeted' | 'claimed' | 'gaveUp';
  readonly rivalId: string;
  readonly nest: number;
}

export function createRivals(clubs: readonly string[], worldSize: number, rng: Rng): Rival[] {
  return clubs.map((club, i) => {
    const angle = (i / clubs.length) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const radius = worldSize * 0.42;
    const home: Vec2 = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    return {
      id: `rival-${i}`,
      club,
      phase: 'idle',
      // Stagger the first outing so all three don't set off together.
      timer: rng.range(RIVALS.minIntervalSeconds * 0.3, RIVALS.maxIntervalSeconds * 0.6),
      targetNest: null,
      home,
      position: { ...home },
      progress: 0,
    };
  });
}

/**
 * Advance every rival by `dt`. Returns the events that happened this tick so
 * the caller can play a sound, drop a marker, or clear a nest.
 *
 * Mutates the rivals in place; this runs every frame.
 */
export function stepRivals(
  rivals: Rival[],
  world: RivalWorld,
  rng: Rng,
  dt: number,
  out: RivalEvent[],
): void {
  out.length = 0;

  for (const rival of rivals) {
    rival.timer -= dt;

    switch (rival.phase) {
      case 'idle': {
        if (rival.timer > 0) break;
        const nest = pickNest(world, rivals, rng);
        if (nest === null) {
          // Nothing worth going for. Check again shortly.
          rival.timer = RIVALS.minIntervalSeconds * 0.5;
          break;
        }
        rival.targetNest = nest;
        rival.phase = 'telegraph';
        rival.timer = RIVALS.telegraphSeconds;
        rival.progress = 0;
        out.push({ type: 'targeted', rivalId: rival.id, nest });
        break;
      }

      case 'telegraph': {
        // Four full seconds of visible warning before they move. This is the
        // window in which the player decides to contest the nest.
        if (rival.timer > 0) break;
        rival.phase = 'travelling';
        rival.timer = RIVALS.travelSeconds;
        break;
      }

      case 'travelling': {
        const nest = rival.targetNest;
        if (nest === null || world.occupied[nest] !== true) {
          // The player got there first. Turn around without complaint.
          rival.phase = 'returning';
          rival.timer = RIVALS.travelSeconds * 0.6;
          if (nest !== null) out.push({ type: 'gaveUp', rivalId: rival.id, nest });
          rival.targetNest = null;
          break;
        }

        rival.progress = 1 - Math.max(0, rival.timer) / RIVALS.travelSeconds;
        const target = world.nests[nest];
        if (target !== undefined) {
          rival.position.x = rival.home.x + (target.x - rival.home.x) * rival.progress;
          rival.position.z = rival.home.z + (target.z - rival.home.z) * rival.progress;
        }

        if (rival.timer <= 0) {
          out.push({ type: 'claimed', rivalId: rival.id, nest });
          rival.phase = 'returning';
          rival.timer = RIVALS.travelSeconds * 0.6;
          rival.targetNest = null;
        }
        break;
      }

      case 'returning': {
        const t = 1 - Math.max(0, rival.timer) / (RIVALS.travelSeconds * 0.6);
        rival.position.x += (rival.home.x - rival.position.x) * Math.min(1, t);
        rival.position.z += (rival.home.z - rival.position.z) * Math.min(1, t);
        if (rival.timer <= 0) {
          rival.phase = 'idle';
          rival.position = { ...rival.home };
          rival.progress = 0;
          rival.timer = rng.range(RIVALS.minIntervalSeconds, RIVALS.maxIntervalSeconds);
        }
        break;
      }

      default:
        return assertNever(rival.phase);
    }
  }
}

/** An occupied nest nobody else has already called dibs on. */
function pickNest(world: RivalWorld, rivals: readonly Rival[], rng: Rng): number | null {
  const taken = new Set(rivals.map((r) => r.targetNest).filter((n): n is number => n !== null));
  const candidates: number[] = [];
  for (let i = 0; i < world.nests.length; i++) {
    if (world.occupied[i] === true && !taken.has(i)) candidates.push(i);
  }
  if (candidates.length === 0) return null;
  return rng.pick(candidates);
}

/** Where a rival's route marker should be drawn, or null when it has no target. */
export function routeMarker(rival: Rival, world: RivalWorld): Vec2 | null {
  if (rival.targetNest === null) return null;
  return world.nests[rival.targetNest] ?? null;
}

/**
 * Seconds of the player's time a lost race costs.
 *
 * Constant and small on purpose. Losing a nest is meant to feel like "ah,
 * next one" -- not like a punishment.
 */
export const RACE_LOSS_SECONDS = RIVALS.lossPenaltySeconds;

function assertNever(value: never): never {
  throw new Error(`Unhandled rival phase: ${String(value)}`);
}
