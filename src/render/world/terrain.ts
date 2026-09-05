/**
 * Terrain generation.
 *
 * One heightfield, shared three ways: the render mesh, the Rapier collider,
 * and the CPU sampler that decides where nests, foliage and guardians stand.
 * They all read the same `TerrainField`, so what you can see, what you can
 * walk on and what the AI thinks the ground is are the same surface.
 */

import { fbm2D, ridged2D } from '../materials/noise';
import type { BiomeTerrain } from '../../data/biomes';

export interface TerrainField {
  readonly size: number;
  readonly resolution: number;
  /** Row-major (resolution+1)^2 heights, in metres. */
  readonly heights: Float32Array;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly waterLevel: number | null;
}

export function generateTerrain(config: BiomeTerrain, seed: number): TerrainField {
  const n = config.resolution + 1;
  const heights = new Float32Array(n * n);
  let min = Infinity;
  let max = -Infinity;

  const half = config.size / 2;
  const step = config.size / config.resolution;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      const h = sampleRaw(x, z, config, seed);
      heights[j * n + i] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }

  return {
    size: config.size,
    resolution: config.resolution,
    heights,
    minHeight: min,
    maxHeight: max,
    waterLevel: config.waterLevel,
  };
}

/**
 * Raw height at a world position.
 *
 * Three shaping terms on top of the noise:
 *
 * - A flat apron at the origin for the sanctuary, so the player never spawns
 *   on a slope. It blends towards a raised plateau rather than towards zero:
 *   flattening to zero put the sanctuary at the bottom of a bowl, and the
 *   player spent the whole opening shot looking at the inside of a hill.
 * - A raised rim, so the world closes itself off with landscape instead of an
 *   invisible wall.
 * - A gentle outward fall between them, so the plateau reads as a lookout.
 */
const PLATEAU_FRACTION = 0.42;

function sampleRaw(x: number, z: number, config: BiomeTerrain, seed: number): number {
  const f = config.noiseFrequency;
  const base = config.ridged
    ? ridged2D(x * f, z * f, seed, config.octaves)
    : fbm2D(x * f, z * f, seed, config.octaves);

  const h = base * config.heightScale;

  const half = config.size / 2;
  const distance = Math.hypot(x, z) / half;

  // Blend from the plateau out into open terrain.
  const plateau = config.heightScale * PLATEAU_FRACTION;
  const apron = smoothstep(0.05, 0.26, distance);
  let shaped = plateau + (h - plateau) * apron;

  // Raised rim, so the world closes itself off.
  const rim = smoothstep(0.7, 1.0, distance);
  shaped += rim * config.heightScale * 1.5;

  return shaped;
}

/** Bilinear height lookup. This is what gameplay code should call. */
export function sampleHeight(field: TerrainField, x: number, z: number): number {
  const n = field.resolution + 1;
  const half = field.size / 2;
  const step = field.size / field.resolution;

  const fx = clamp((x + half) / step, 0, field.resolution - 1e-4);
  const fz = clamp((z + half) / step, 0, field.resolution - 1e-4);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;

  const h00 = field.heights[j * n + i] ?? 0;
  const h10 = field.heights[j * n + i + 1] ?? 0;
  const h01 = field.heights[(j + 1) * n + i] ?? 0;
  const h11 = field.heights[(j + 1) * n + i + 1] ?? 0;

  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

/** Surface slope in degrees. Used for foliage masks and walkability. */
export function sampleSlope(field: TerrainField, x: number, z: number): number {
  const d = field.size / field.resolution;
  const hL = sampleHeight(field, x - d, z);
  const hR = sampleHeight(field, x + d, z);
  const hD = sampleHeight(field, x, z - d);
  const hU = sampleHeight(field, x, z + d);
  const dx = (hR - hL) / (2 * d);
  const dz = (hU - hD) / (2 * d);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

export function sampleNormal(
  field: TerrainField,
  x: number,
  z: number,
  out: { x: number; y: number; z: number },
): void {
  const d = field.size / field.resolution;
  const hL = sampleHeight(field, x - d, z);
  const hR = sampleHeight(field, x + d, z);
  const hD = sampleHeight(field, x, z - d);
  const hU = sampleHeight(field, x, z + d);
  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * d;
  const len = Math.hypot(nx, ny, nz) || 1;
  out.x = nx / len;
  out.y = ny / len;
  out.z = nz / len;
}

/** True when this spot is above water and flat enough to stand on. */
export function isWalkable(field: TerrainField, x: number, z: number, maxSlope = 32): boolean {
  const h = sampleHeight(field, x, z);
  if (field.waterLevel !== null && h < field.waterLevel + 0.15) return false;
  return sampleSlope(field, x, z) <= maxSlope;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
