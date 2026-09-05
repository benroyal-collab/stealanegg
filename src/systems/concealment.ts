/**
 * Soft cover.
 *
 * Long grass and reed beds cannot have a collider each -- there are thousands
 * of them -- but crouching in a reed bed is Mirrormere's whole signature
 * mechanic, so they have to break line of sight somehow.
 *
 * The answer is a coarse density grid, built once when the biome loads from
 * the same scatter the renderer uses. A guardian's ray samples it along its
 * length; enough accumulated density and the ray is considered broken. It
 * costs a handful of array reads per guardian per frame and it means the
 * reeds a child can see are the reeds that actually hide them.
 */

import type { FoliageLayer } from '../data/biomes';
import { hash2D } from '../render/materials/noise';
import { isWalkable, sampleHeight, sampleSlope, type TerrainField } from '../render/world/terrain';
import type { Vec2 } from '../sim/types';

/** Only the layers tall enough to hide a crouching child contribute. */
const CONCEALING: Record<string, number> = {
  reed: 1.0,
  fern: 0.55,
  grass: 0.28,
};

export interface ConcealmentGrid {
  readonly size: number;
  readonly cells: number;
  /** 0..1 per cell. */
  readonly density: Float32Array;
  /** Tallest concealing plant in each cell, in metres. */
  readonly height: Float32Array;
}

export function buildConcealment(
  layers: readonly FoliageLayer[],
  field: TerrainField,
  seed: number,
  density: number,
  cells = 96,
): ConcealmentGrid {
  const grid = new Float32Array(cells * cells);
  const heights = new Float32Array(cells * cells);
  const half = field.size / 2;
  const cellSize = field.size / cells;

  layers.forEach((layer, layerIndex) => {
    const weight = CONCEALING[layer.kind];
    if (weight === undefined) return;

    const layerSeed = seed + layerIndex * 977;
    const target = Math.max(0, Math.round(layer.count * density));
    const scatterHalf = half - 2;
    let placed = 0;

    for (let attempt = 0; attempt < target * 8 && placed < target; attempt++) {
      const px = (hash2D(attempt, layerSeed, 1) * 2 - 1) * scatterHalf;
      const pz = (hash2D(attempt, layerSeed, 2) * 2 - 1) * scatterHalf;

      const h = sampleHeight(field, px, pz);
      if (h < layer.minHeight || h > layer.maxHeight) continue;
      if (sampleSlope(field, px, pz) > layer.maxSlope) continue;
      if (layer.kind !== 'reed' && !isWalkable(field, px, pz, layer.maxSlope)) continue;

      const scale =
        layer.minScale + hash2D(attempt, layerSeed, 6) * (layer.maxScale - layer.minScale);

      const cx = Math.floor(((px + half) / field.size) * cells);
      const cz = Math.floor(((pz + half) / field.size) * cells);
      if (cx < 0 || cz < 0 || cx >= cells || cz >= cells) continue;

      const index = cz * cells + cx;
      grid[index] = Math.min(1, (grid[index] ?? 0) + weight * 0.06);
      // Reeds are ~1.5m at scale 1, ferns ~0.6, grass ~0.55.
      const plantHeight =
        (layer.kind === 'reed' ? 1.55 : layer.kind === 'fern' ? 0.62 : 0.55) * scale;
      heights[index] = Math.max(heights[index] ?? 0, plantHeight);
      placed += 1;
    }
  });

  void cellSize;
  return { size: field.size, cells, density: grid, height: heights };
}

/** Density and tallest plant at a world position. */
export function concealmentAt(
  grid: ConcealmentGrid,
  x: number,
  z: number,
): { density: number; height: number } {
  const half = grid.size / 2;
  const cx = Math.floor(((x + half) / grid.size) * grid.cells);
  const cz = Math.floor(((z + half) / grid.size) * grid.cells);
  if (cx < 0 || cz < 0 || cx >= grid.cells || cz >= grid.cells) return { density: 0, height: 0 };
  const index = cz * grid.cells + cx;
  return { density: grid.density[index] ?? 0, height: grid.height[index] ?? 0 };
}

/**
 * Does soft cover break this sight line?
 *
 * Walks the ray in roughly cell-sized steps and accumulates density, but only
 * from cells whose plants are tall enough to hide the player at their current
 * eye height. That is the whole mechanic in one condition: standing up in
 * reeds does not hide you, and crouching does.
 */
export function softCoverBlocks(
  grid: ConcealmentGrid,
  from: Vec2,
  to: Vec2,
  playerGroundY: number,
  playerEyeHeight: number,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.5) return false;

  const step = grid.size / grid.cells;
  const steps = Math.min(64, Math.ceil(distance / step));
  let accumulated = 0;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    const { density, height } = concealmentAt(grid, x, z);
    if (density <= 0) continue;

    // Only the part of the ray near the player's own body counts: a reed bed
    // between the guardian and the player hides them, a reed bed behind them
    // does not.
    const nearPlayer = t > 0.55;
    if (!nearPlayer) continue;

    const groundHere = playerGroundY;
    const topOfCover = groundHere + height;
    if (topOfCover < playerGroundY + playerEyeHeight) continue;

    accumulated += density;
    if (accumulated >= 0.55) return true;
  }

  return false;
}
