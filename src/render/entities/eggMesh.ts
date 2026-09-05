/**
 * Parametric egg geometry.
 *
 * A real egg is not an ellipsoid: it is asymmetric, blunt at one end and
 * tapered at the other. A superellipsoid with a height-dependent taper gets
 * that shape in about twenty lines and costs nothing to tweak, which is worth
 * more here than a modelled asset would be -- rarity, size and species all
 * shift the silhouette.
 */

import { BufferAttribute, BufferGeometry } from 'three';
import type { Rarity, SizeId } from '../../sim/types';
import { SIZE_MESH_SCALE } from '../../data/balance';

export interface EggShape {
  /** Long axis, in metres, before the size multiplier. */
  height: number;
  /** Widest radius. */
  radius: number;
  /**
   * How much blunter the base is than the tip. 0 is a symmetric ellipsoid;
   * 0.35 is about right for a hen's egg.
   */
  taper: number;
  /** Superellipsoid exponent. Below 2 is boxy, above 2 is pointy. */
  exponent: number;
  segments: number;
  rings: number;
}

/** Rarer eggs are visibly bigger and rounder, before any size roll. */
const RARITY_SHAPE: Record<Rarity, Partial<EggShape>> = {
  common: { height: 0.3, radius: 0.115, taper: 0.36, exponent: 2.0 },
  uncommon: { height: 0.32, radius: 0.125, taper: 0.34, exponent: 2.05 },
  rare: { height: 0.35, radius: 0.14, taper: 0.32, exponent: 2.1 },
  epic: { height: 0.38, radius: 0.155, taper: 0.3, exponent: 2.15 },
  legendary: { height: 0.42, radius: 0.175, taper: 0.28, exponent: 2.2 },
  mythic: { height: 0.46, radius: 0.195, taper: 0.26, exponent: 2.3 },
  secret: { height: 0.52, radius: 0.22, taper: 0.22, exponent: 2.45 },
};

const cache = new Map<string, BufferGeometry>();

export function eggGeometry(rarity: Rarity, size: SizeId): BufferGeometry {
  const key = `${rarity}:${size}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const base = RARITY_SHAPE[rarity];
  const scale = SIZE_MESH_SCALE[size];
  const shape: EggShape = {
    height: (base.height ?? 0.3) * scale,
    radius: (base.radius ?? 0.115) * scale,
    taper: base.taper ?? 0.34,
    exponent: base.exponent ?? 2,
    segments: 28,
    rings: 22,
  };

  const geo = buildEgg(shape);
  cache.set(key, geo);
  return geo;
}

function buildEgg(shape: EggShape): BufferGeometry {
  const { segments, rings } = shape;
  const vertexCount = (segments + 1) * (rings + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    // v runs 0 at the blunt base to 1 at the tapered tip.
    const v = r / rings;
    const phi = v * Math.PI;

    // Superellipsoid profile, then the asymmetric taper on top of it. The
    // taper term is what stops it reading as a rugby ball.
    const profile = Math.pow(Math.sin(phi), 2 / shape.exponent);
    const asymmetry = 1 - shape.taper * (v - 0.5) - shape.taper * 0.4 * Math.pow(v - 0.5, 2) * 4;
    const radius = shape.radius * profile * Math.max(0.05, asymmetry);
    const y = -Math.cos(phi) * (shape.height / 2);

    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const theta = u * Math.PI * 2;
      const i = r * (segments + 1) + s;

      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Physical dimensions, for placing an egg in a nest or in the player's hands. */
export function eggDimensions(rarity: Rarity, size: SizeId): { height: number; radius: number } {
  const base = RARITY_SHAPE[rarity];
  const scale = SIZE_MESH_SCALE[size];
  return { height: (base.height ?? 0.3) * scale, radius: (base.radius ?? 0.115) * scale };
}

export function disposeEggCache(): void {
  for (const geo of cache.values()) geo.dispose();
  cache.clear();
}
