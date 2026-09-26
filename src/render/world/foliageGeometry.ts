/**
 * Parametric foliage geometry.
 *
 * Every plant here is built from a handful of quads or tapered cylinders and
 * a seeded random. That keeps the triangle count honest -- a grass blade is
 * two triangles, not a scanned asset -- and it means each biome's foliage can
 * be tuned by changing a number rather than re-exporting a model.
 *
 * Each geometry carries an `aHeight` attribute (0 at the root, 1 at the tip)
 * which the wind shader uses to bend from the base instead of translating the
 * whole plant, and `aPhase` so neighbouring plants never sway in lockstep.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  SphereGeometry,
} from 'three';
import { hash2D } from '../materials/noise';

export type FoliageKind =
  'birch' | 'pine' | 'fern' | 'grass' | 'reed' | 'rock' | 'palm' | 'cactus' | 'ruin';

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
function roughen(geometry: BufferGeometry, seed: number, amount: number): BufferGeometry {
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

/** A cross of quads: the cheapest thing that reads as a leafy clump. */
function crossBillboard(
  width: number,
  height: number,
  planes: number,
  bendTip: number,
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const heights: number[] = [];
  const indices: number[] = [];

  for (let p = 0; p < planes; p++) {
    const angle = (p / planes) * Math.PI;
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    const base = positions.length / 3;
    const half = width / 2;

    // Bottom two, then top two pushed forward so the blade leans.
    positions.push(-cx * half, 0, -cz * half);
    positions.push(cx * half, 0, cz * half);
    positions.push(cx * half * 0.55 + cz * bendTip, height, cz * half * 0.55 - cx * bendTip);
    positions.push(-cx * half * 0.55 + cz * bendTip, height, -cz * half * 0.55 - cx * bendTip);

    for (let i = 0; i < 4; i++) {
      normals.push(cz, 0.35, -cx);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    heights.push(0, 0, 1, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aHeight', new Float32BufferAttribute(heights, 1));
  // Blades are all "leaf", so the shader's wood/leaf mix resolves to the tint.
  geo.setAttribute('aPart', new Float32BufferAttribute(new Array(heights.length).fill(1), 1));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * A conifer: a trunk with skirts of needles, widest at the bottom.
 *
 * Pine used to go through `treeGeometry` like everything else, so a pine was
 * a birch with smaller spheres. Its own comment said a cone "reads as a
 * Christmas tree even when it is meant to be a birch" -- true, and exactly
 * why a pine should have one. Silhouette is how a child tells two woods
 * apart at fifty metres; colour is not enough, and three biomes built from
 * the same blob are three biomes that look like one.
 */
function coniferGeometry(
  trunkHeight: number,
  trunkRadius: number,
  skirts: { y: number; radius: number; height: number }[],
  seed: number,
): BufferGeometry {
  const parts: { geometry: BufferGeometry; part: number }[] = [];
  const lean = (hash2D(seed, 3, 11) - 0.5) * 0.1;

  const trunk = new CylinderGeometry(trunkRadius * 0.5, trunkRadius, trunkHeight, 6, 2);
  trunk.translate(0, trunkHeight / 2, 0);
  trunk.rotateZ(lean);
  parts.push({ geometry: trunk, part: 0 });

  skirts.forEach((skirt, i) => {
    // Open cones, stacked. Six sides is enough at instanced scale and the
    // hard edges are the point -- a conifer is all silhouette.
    const cone = new ConeGeometry(skirt.radius, skirt.height, 6, 1);
    roughen(cone, seed * 17 + i, 0.16);
    cone.rotateY(hash2D(seed, i, 37) * Math.PI * 2);
    cone.translate(0, skirt.y + skirt.height * 0.5, 0);
    cone.rotateZ(lean);
    parts.push({ geometry: cone, part: 1 });
  });

  return mergeWithHeights(parts, trunkHeight + (skirts.at(-1)?.y ?? trunkHeight));
}

/**
 * A palm: a bare trunk with a crown of drooping fronds.
 *
 * Was a single squashed sphere on a stick, which from any distance is a
 * lollipop. Fronds cost a handful of triangles and are the whole reason a
 * desert reads as a desert.
 */
function palmGeometry(trunkHeight: number, trunkRadius: number, seed: number): BufferGeometry {
  const parts: { geometry: BufferGeometry; part: number }[] = [];
  const lean = (hash2D(seed, 5, 13) - 0.5) * 0.3;

  const trunk = new CylinderGeometry(trunkRadius * 0.7, trunkRadius, trunkHeight, 6, 3);
  trunk.translate(0, trunkHeight / 2, 0);
  trunk.rotateZ(lean);
  parts.push({ geometry: trunk, part: 0 });

  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const angle = (i / fronds) * Math.PI * 2 + hash2D(seed, i, 19) * 0.5;
    const length = 1.5 + hash2D(seed, i, 23) * 0.7;
    const frond = new BoxGeometry(0.16, 0.05, length);
    // Pivot out from the crown, then droop. The droop is what stops it
    // looking like a parasol.
    frond.translate(0, 0, length * 0.5);
    frond.rotateX(0.38 + hash2D(seed, i, 29) * 0.3);
    frond.rotateY(angle);
    frond.translate(0, trunkHeight, 0);
    frond.rotateZ(lean);
    parts.push({ geometry: frond, part: 1 });
  }

  return mergeWithHeights(parts, trunkHeight + 0.4);
}

/**
 * A trunk plus a rounded canopy. Broadleaf trees -- birch, and the cactus,
 * which is the same construction with one small green blob on top.
 *
 * Trunk and canopy are merged into one geometry -- one draw call for a whole
 * forest -- but tagged with `aPart` (0 = wood, 1 = leaf) so the shader can
 * give them completely different colours. Without that tag the per-instance
 * tint paints the trunk the same green as the leaves, and every tree in the
 * scene reads as a lollipop.
 */
function treeGeometry(
  trunkHeight: number,
  trunkRadius: number,
  canopyLayers: { y: number; radius: number; height: number }[],
  seed: number,
): BufferGeometry {
  const parts: { geometry: BufferGeometry; part: number }[] = [];

  const trunk = new CylinderGeometry(trunkRadius * 0.62, trunkRadius, trunkHeight, 7, 3);
  trunk.translate(0, trunkHeight / 2, 0);
  // A slight lean per tree, so a stand of them never looks like fence posts.
  const lean = (hash2D(seed, 3, 11) - 0.5) * 0.14;
  trunk.rotateZ(lean);
  parts.push({ geometry: trunk, part: 0 });

  canopyLayers.forEach((layer, i) => {
    // Rounded rather than conical: a cone reads as a Christmas tree even when
    // it is meant to be a birch. Segments kept low; these are instanced.
    const blob = new SphereGeometry(layer.radius, 9, 6);
    blob.scale(1, Math.max(0.42, layer.height / (layer.radius * 2)), 1);
    // Break the ellipsoid before it is placed, or every canopy in the wood is
    // the same shape rotated.
    roughen(blob, seed * 31 + i, 0.34);
    // Squash and offset each layer differently so a canopy is a clump of
    // masses rather than one smooth ball.
    blob.translate(
      (hash2D(seed, i, 51) - 0.5) * layer.radius * 0.45,
      layer.y + layer.height * 0.4,
      (hash2D(seed, i, 73) - 0.5) * layer.radius * 0.45,
    );
    blob.rotateY(hash2D(seed, i, 29) * Math.PI * 2);
    blob.rotateZ(lean);
    parts.push({ geometry: blob, part: 1 });
  });

  return mergeWithHeights(parts, trunkHeight + (canopyLayers.at(-1)?.y ?? trunkHeight));
}

/**
 * Merge parts and stamp `aHeight` by world Y.
 *
 * three's BufferGeometryUtils would do the merge, but it needs every input to
 * carry an identical attribute set; building the buffers directly is shorter
 * than normalising them first.
 */
function mergeWithHeights(
  input: BufferGeometry[] | { geometry: BufferGeometry; part: number }[],
  totalHeight: number,
): BufferGeometry {
  const parts = input.map((entry) =>
    entry instanceof BufferGeometry ? { geometry: entry, part: 0 } : entry,
  );

  let vertexCount = 0;
  let indexCount = 0;
  for (const { geometry } of parts) {
    vertexCount += geometry.attributes.position!.count;
    indexCount += geometry.index?.count ?? geometry.attributes.position!.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const heights = new Float32Array(vertexCount);
  const partTags = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);

  let vOffset = 0;
  let iOffset = 0;
  for (const { geometry: part, part: tag } of parts) {
    const pos = part.attributes.position as BufferAttribute;
    const nrm = part.attributes.normal as BufferAttribute | undefined;
    const uv = part.attributes.uv as BufferAttribute | undefined;
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      partTags[vOffset + i] = tag;
      positions[(vOffset + i) * 3] = pos.getX(i);
      positions[(vOffset + i) * 3 + 1] = pos.getY(i);
      positions[(vOffset + i) * 3 + 2] = pos.getZ(i);
      normals[(vOffset + i) * 3] = nrm?.getX(i) ?? 0;
      normals[(vOffset + i) * 3 + 1] = nrm?.getY(i) ?? 1;
      normals[(vOffset + i) * 3 + 2] = nrm?.getZ(i) ?? 0;
      uvs[(vOffset + i) * 2] = uv?.getX(i) ?? 0;
      uvs[(vOffset + i) * 2 + 1] = uv?.getY(i) ?? 0;
      heights[vOffset + i] = Math.max(0, Math.min(1, pos.getY(i) / totalHeight));
    }

    const index = part.index;
    if (index === null) {
      for (let i = 0; i < count; i++) indices[iOffset + i] = vOffset + i;
      iOffset += count;
    } else {
      for (let i = 0; i < index.count; i++) indices[iOffset + i] = vOffset + index.getX(i);
      iOffset += index.count;
    }
    vOffset += count;
    part.dispose();
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.setAttribute('aHeight', new BufferAttribute(heights, 1));
  geo.setAttribute('aPart', new BufferAttribute(partTags, 1));
  geo.setIndex(new BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Noise-displaced icosahedron. Rocks and ruin rubble. */
function rockGeometry(seed: number, detail = 1): BufferGeometry {
  const geo = new BufferGeometry();
  const source = new IcosahedronGeometry(1, detail);
  const positions = source.attributes.position as BufferAttribute;
  const count = positions.count;
  const out = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    // Two octaves of displacement: big lumps, then chipped edges.
    const big = 0.72 + hash2D(Math.round(x * 4), Math.round(z * 4), seed) * 0.5;
    const small = 0.92 + hash2D(Math.round(x * 14), Math.round(y * 14), seed + 7) * 0.16;
    out[i * 3] = x * big * small;
    out[i * 3 + 1] = y * big * small * 0.78;
    out[i * 3 + 2] = z * big * small;
  }

  geo.setAttribute('position', new BufferAttribute(out, 3));
  geo.setIndex(source.index);
  geo.setAttribute('uv', source.attributes.uv!);
  geo.computeVertexNormals();
  const heights = new Float32Array(count);
  geo.setAttribute('aHeight', new BufferAttribute(heights, 1));
  // Rock is "wood" as far as the shader is concerned: it takes the solid
  // colour rather than the leaf tint.
  geo.setAttribute('aPart', new BufferAttribute(new Float32Array(count), 1));
  geo.computeBoundingSphere();
  source.dispose();
  return geo;
}

const cache = new Map<string, BufferGeometry>();

export function foliageGeometry(kind: FoliageKind, variant = 0): BufferGeometry {
  const key = `${kind}:${variant}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let geo: BufferGeometry;
  switch (kind) {
    case 'grass':
      geo = crossBillboard(0.22, 0.55 + variant * 0.08, 2, 0.06);
      break;
    case 'fern':
      geo = crossBillboard(0.72, 0.62, 3, 0.14);
      break;
    case 'reed':
      geo = crossBillboard(0.16, 1.55 + variant * 0.2, 2, 0.03);
      break;
    case 'birch':
      geo = treeGeometry(
        5.2 + variant * 0.5,
        0.14,
        [
          { y: 3.4, radius: 1.5, height: 2.0 },
          { y: 4.4, radius: 1.15, height: 1.7 },
          { y: 5.2, radius: 0.72, height: 1.2 },
        ],
        variant + 1,
      );
      break;
    case 'pine':
      geo = coniferGeometry(
        4.4 + variant * 0.4,
        0.17,
        [
          { y: 1.3, radius: 1.7, height: 2.1 },
          { y: 2.6, radius: 1.3, height: 1.9 },
          { y: 3.7, radius: 0.92, height: 1.7 },
          { y: 4.7, radius: 0.5, height: 1.3 },
        ],
        variant + 21,
      );
      break;
    case 'palm':
      geo = palmGeometry(4.6 + variant * 0.5, 0.13, variant + 41);
      break;
    case 'cactus':
      geo = treeGeometry(
        1.5 + variant * 0.3,
        0.19,
        [{ y: 1.3, radius: 0.26, height: 0.7 }],
        variant + 61,
      );
      break;
    case 'rock':
      geo = rockGeometry(variant + 101, 1);
      break;
    case 'ruin':
      geo = ruinGeometry(variant + 131);
      break;
    default:
      geo = crossBillboard(0.2, 0.5, 2, 0.05);
  }

  cache.set(key, geo);
  return geo;
}

/** A broken column or arch fragment. Boxes, stacked and tilted. */
function ruinGeometry(seed: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const height = 2.4 + hash2D(seed, 1, 3) * 2.6;
  const base = new BoxGeometry(1.4, 0.35, 1.4);
  base.translate(0, 0.175, 0);
  parts.push(base);

  const blocks = 2 + Math.floor(hash2D(seed, 2, 5) * 4);
  let y = 0.35;
  for (let i = 0; i < blocks; i++) {
    const h = height / blocks;
    const w = 0.95 - i * 0.06;
    const block = new BoxGeometry(w, h * 0.94, w);
    block.translate(0, y + h / 2, 0);
    block.rotateY(hash2D(seed, i, 13) * 0.22);
    parts.push(block);
    y += h;
  }

  // Half of them get a fallen lintel leaning against the stack.
  if (hash2D(seed, 9, 17) > 0.5) {
    const lintel = new BoxGeometry(2.1, 0.42, 0.62);
    lintel.rotateZ(0.42);
    lintel.translate(1.0, y * 0.55, 0);
    parts.push(lintel);
  }

  return mergeWithHeights(parts, y);
}

export function disposeFoliageCache(): void {
  for (const geo of cache.values()) geo.dispose();
  cache.clear();
}
