/**
 * Deciding where things stand.
 *
 * Nests, guardians, rivals and props all need positions on walkable ground,
 * spread out, and away from the sanctuary. Doing that once at biome load with
 * a seeded RNG means the world is identical every time a player returns to a
 * biome -- which matters more than it sounds: a child who learns a patrol
 * route should find it where they left it.
 */

import { Rng } from '../sim/rng';
import type { Vec2 } from '../sim/types';
import { isWalkable, sampleHeight, sampleSlope, type TerrainField } from '../render/world/terrain';

export interface Placement {
  readonly position: Vec2;
  readonly groundY: number;
}

export interface ScatterOptions {
  readonly count: number;
  /** No two placements closer than this. */
  readonly minSpacing: number;
  /** Keep clear of the origin by at least this much. */
  readonly minFromCentre: number;
  readonly maxFromCentre: number;
  readonly maxSlope: number;
}

/**
 * Poisson-ish scatter by rejection.
 *
 * Not a true Poisson disc -- the counts here are small enough (a dozen nests)
 * that dart-throwing with a spacing check converges in a handful of attempts
 * and produces a distribution nobody could tell apart from the real thing.
 */
export function scatterPlacements(
  field: TerrainField,
  rng: Rng,
  options: ScatterOptions,
): Placement[] {
  const placed: Placement[] = [];
  const maxAttempts = options.count * 200;

  for (let attempt = 0; attempt < maxAttempts && placed.length < options.count; attempt++) {
    const angle = rng.next() * Math.PI * 2;
    // sqrt keeps the distribution even by area rather than clustering at the
    // centre, which is what a naive uniform radius does.
    const radius =
      options.minFromCentre +
      Math.sqrt(rng.next()) * (options.maxFromCentre - options.minFromCentre);

    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    if (!isWalkable(field, x, z, options.maxSlope)) continue;
    if (sampleSlope(field, x, z) > options.maxSlope) continue;

    let tooClose = false;
    for (const other of placed) {
      if (Math.hypot(other.position.x - x, other.position.z - z) < options.minSpacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    placed.push({ position: { x, z }, groundY: sampleHeight(field, x, z) });
  }

  return placed;
}

/**
 * A patrol route: a closed loop of waypoints around a nest.
 *
 * Guardians walk these. A loop rather than a there-and-back means the player
 * can learn the timing from any point in the cycle, which is what makes the
 * stealth readable rather than a memory test.
 */
export function patrolRoute(
  field: TerrainField,
  centre: Vec2,
  radius: number,
  points: number,
  rng: Rng,
): Vec2[] {
  const route: Vec2[] = [];
  const offset = rng.next() * Math.PI * 2;

  for (let i = 0; i < points; i++) {
    const angle = offset + (i / points) * Math.PI * 2;
    // Wobble the radius so patrols are not perfect circles.
    const r = radius * (0.7 + rng.next() * 0.6);
    let x = centre.x + Math.cos(angle) * r;
    let z = centre.z + Math.sin(angle) * r;

    // Pull unwalkable waypoints back towards the nest rather than dropping
    // them: a route with a missing corner reads as a broken patrol.
    for (let pull = 0; pull < 6 && !isWalkable(field, x, z); pull++) {
      x = centre.x + (x - centre.x) * 0.7;
      z = centre.z + (z - centre.z) * 0.7;
    }
    route.push({ x, z });
  }
  return route;
}

/** Deterministic per-biome RNG, so a world is identical on every visit. */
export function biomeRng(biome: string, purpose: string): Rng {
  return new Rng(`${biome}:${purpose}`);
}
