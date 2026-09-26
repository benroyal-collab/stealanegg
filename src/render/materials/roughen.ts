import type { BufferAttribute, BufferGeometry } from 'three';
import { hash2D } from './noise';

/**
 * Push every vertex along its own normal by a hashed amount.
 *
 * The single biggest thing separating "stylised low-poly" from "programmer
 * art". A canopy built from `SphereGeometry` is a mathematically perfect
 * ellipsoid, and a forest of perfect ellipsoids reads as placeholder no matter
 * how well it is lit -- the eye finds the repetition instantly, because
 * nothing in a wood is ever that smooth.
 *
 * Roughening costs no vertices and no draw calls; it just moves the ones that
 * are already there. Normals are recomputed afterwards so the faceting picks
 * up the light, which is where the crispness comes from.
 */
export function roughen(geometry: BufferGeometry, seed: number, amount: number): BufferGeometry {
  const position = geometry.attributes.position as BufferAttribute | undefined;
  const normal = geometry.attributes.normal as BufferAttribute | undefined;
  if (position === undefined || normal === undefined) return geometry;

  for (let i = 0; i < position.count; i++) {
    // Hash on the vertex's own position, so shared vertices move together and
    // the surface stays closed rather than splitting into confetti.
    const px = position.getX(i);
    const py = position.getY(i);
    const pz = position.getZ(i);
    const n = hash2D(Math.round((px + pz) * 97), Math.round(py * 89), seed) - 0.5;
    const push = 1 + n * amount;
    position.setXYZ(i, px * push, py * push, pz * push);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
