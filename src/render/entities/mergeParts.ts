/**
 * Concatenate small primitives into one geometry, keeping their colours.
 *
 * The nests and the habitat fences already do this: a shape built from a dozen
 * boxes costs a dozen draw calls, and every one of them is paid again for each
 * shadow cascade. Baking them into a single buffer turns twelve into one.
 *
 * The addition here is a per-vertex colour, which is what lets a *whole
 * character* -- skin, cloth, leather, hair, all different -- come out of one
 * draw instead of one draw per material. Without it, merging only helps when
 * everything is the same colour, which is almost never true of anything worth
 * looking at.
 *
 * Colours go in as ordinary sRGB hex strings and come out linear, because that
 * is the space the shader works in. `Color.setStyle` does that conversion, so
 * this file does not have to know the maths.
 */

import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { roughen } from '../materials/roughen';

export interface ColouredPart {
  geometry: BufferGeometry;
  /** sRGB hex, the same way it would be written on a material. */
  colour: string;
  /** Optional placement. Applied to the geometry, then discarded. */
  matrix?: Matrix4;
}

/**
 * Merge parts into one indexed geometry with a `color` attribute.
 *
 * Every input geometry is disposed: they exist only to be copied out of, and
 * leaving them alive is how a character that is rebuilt on a settings change
 * leaks a megabyte at a time.
 */
export function mergeColouredParts(parts: readonly ColouredPart[]): BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    const position = part.geometry.attributes.position;
    if (position === undefined) continue;
    vertexCount += position.count;
    indexCount += part.geometry.index?.count ?? position.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colours = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  const colour = new Color();

  let vOffset = 0;
  let iOffset = 0;
  for (const part of parts) {
    const geometry = part.geometry;
    if (part.matrix !== undefined) geometry.applyMatrix4(part.matrix);

    const pos = geometry.attributes.position as BufferAttribute | undefined;
    if (pos === undefined) continue;
    const nrm = geometry.attributes.normal as BufferAttribute | undefined;
    const uv = geometry.attributes.uv as BufferAttribute | undefined;
    colour.setStyle(part.colour);

    for (let i = 0; i < pos.count; i++) {
      const v = vOffset + i;
      positions[v * 3] = pos.getX(i);
      positions[v * 3 + 1] = pos.getY(i);
      positions[v * 3 + 2] = pos.getZ(i);
      normals[v * 3] = nrm?.getX(i) ?? 0;
      normals[v * 3 + 1] = nrm?.getY(i) ?? 1;
      normals[v * 3 + 2] = nrm?.getZ(i) ?? 0;
      uvs[v * 2] = uv?.getX(i) ?? 0;
      uvs[v * 2 + 1] = uv?.getY(i) ?? 0;
      colours[v * 3] = colour.r;
      colours[v * 3 + 1] = colour.g;
      colours[v * 3 + 2] = colour.b;
    }

    const index = geometry.index;
    if (index === null) {
      for (let i = 0; i < pos.count; i++) indices[iOffset + i] = vOffset + i;
      iOffset += pos.count;
    } else {
      for (let i = 0; i < index.count; i++) indices[iOffset + i] = vOffset + index.getX(i);
      iOffset += index.count;
    }
    vOffset += pos.count;
    geometry.dispose();
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(positions, 3));
  merged.setAttribute('normal', new BufferAttribute(normals, 3));
  merged.setAttribute('uv', new BufferAttribute(uvs, 2));
  merged.setAttribute('color', new BufferAttribute(colours, 3));
  merged.setIndex(new BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  return merged;
}

/* ------------------------------------------------------------------------ */
/* Placement helpers, shared by everything baked this way                    */
/* ------------------------------------------------------------------------ */

export type V3 = readonly [number, number, number];

const scratchEuler = new Euler();
const scratchQuat = new Quaternion();
const scratchPos = new Vector3();
const scratchScale = new Vector3();

/**
 * Position, rotate and scale one primitive within its joint.
 *
 * Rotation is applied yaw-last ('YXZ'), so `[PI/2, yaw, 0]` means "lay it
 * along +Z, then turn it" -- which is what nearly every toe, plank and
 * feather wants.
 */
export function part(
  geometry: BufferGeometry,
  colour: string,
  position: V3,
  rotation: V3 = [0, 0, 0],
  scale: V3 = [1, 1, 1],
): ColouredPart {
  scratchEuler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
  scratchQuat.setFromEuler(scratchEuler);
  const matrix = new Matrix4().compose(
    scratchPos.set(position[0], position[1], position[2]),
    scratchQuat,
    scratchScale.set(scale[0], scale[1], scale[2]),
  );
  return { geometry, colour, matrix };
}

const UP = new Vector3(0, 1, 0);

/** A capsule from one point to another: a leg segment, a rail, a lamp arm. */
export function limb(from: V3, to: V3, radius: number, colour: string): ColouredPart {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const dir = b.clone().sub(a);
  const length = dir.length();
  const quat = new Quaternion().setFromUnitVectors(UP, dir.normalize());
  const matrix = new Matrix4().compose(a.add(b).multiplyScalar(0.5), quat, new Vector3(1, 1, 1));
  return {
    geometry: new CapsuleGeometry(radius, Math.max(0.001, length - radius), 3, 8),
    colour,
    matrix,
  };
}

/** A sphere with its surface broken up, so it reads as feathers, shell or stone. */
export function lumpy(
  radius: number,
  seed: number,
  amount: number,
  w = 16,
  h = 12,
): SphereGeometry {
  const geometry = new SphereGeometry(radius, w, h);
  roughen(geometry, seed, amount);
  return geometry;
}
