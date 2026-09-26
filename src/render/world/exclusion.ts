/**
 * Where foliage may not grow.
 *
 * Shared by the scatter in `Foliage.tsx` and its twin in
 * `FoliageColliders.tsx`, which must reject exactly the same points or the
 * colliders stop landing on their trees.
 */

import type { FoliageLayer } from '../../data/biomes';

export interface ExclusionZone {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /**
   * Only keep out things you cannot walk through or see past: trees, rocks,
   * ruins. Grass and ferns may still grow inside.
   */
  readonly largeOnly?: boolean;
}

const LARGE: ReadonlySet<FoliageLayer['kind']> = new Set([
  'birch',
  'pine',
  'palm',
  'cactus',
  'ruin',
  'rock',
]);

export function isExcluded(
  kind: FoliageLayer['kind'],
  x: number,
  z: number,
  zones: readonly ExclusionZone[],
): boolean {
  for (const zone of zones) {
    if (zone.largeOnly === true && !LARGE.has(kind)) continue;
    if (Math.hypot(x - zone.x, z - zone.z) < zone.radius) return true;
  }
  return false;
}
