/**
 * The habitat fence, baked into one geometry.
 *
 * Six posts and a rail per pen, drawn as eight separate meshes, came to
 * thirty-two draw calls for the starting four habitats -- and every one of
 * those is paid again for each shadow cascade and again for the god-ray
 * occlusion pass. Four draw calls a pen is four times too many when the
 * fences are identical.
 *
 * Same technique as the nest ring: one shared geometry, built once, used by
 * every pen.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  TorusGeometry,
  Vector3,
} from 'three';

const POSTS = 6;
const RADIUS = 1.15;

function buildFence(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const matrix = new Matrix4();
  const position = new Vector3();

  for (let i = 0; i < POSTS; i++) {
    const angle = (i / POSTS) * Math.PI * 2;
    const post = new BoxGeometry(0.08, 0.48, 0.08);
    position.set(Math.cos(angle) * RADIUS, 0.24, Math.sin(angle) * RADIUS);
    matrix.identity().setPosition(position);
    post.applyMatrix4(matrix);
    parts.push(post);
  }

  // The rail. Without it six posts read as debris rather than as a pen.
  const rail = new TorusGeometry(RADIUS, 0.035, 5, 20);
  rail.rotateX(-Math.PI / 2);
  rail.translate(0, 0.4, 0);
  parts.push(rail);

  return merge(parts);
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.attributes.position!.count;
    indexCount += part.index?.count ?? part.attributes.position!.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);

  let vOffset = 0;
  let iOffset = 0;
  for (const part of parts) {
    const pos = part.attributes.position as BufferAttribute;
    const nrm = part.attributes.normal as BufferAttribute | undefined;
    const uv = part.attributes.uv as BufferAttribute | undefined;

    for (let i = 0; i < pos.count; i++) {
      positions[(vOffset + i) * 3] = pos.getX(i);
      positions[(vOffset + i) * 3 + 1] = pos.getY(i);
      positions[(vOffset + i) * 3 + 2] = pos.getZ(i);
      normals[(vOffset + i) * 3] = nrm?.getX(i) ?? 0;
      normals[(vOffset + i) * 3 + 1] = nrm?.getY(i) ?? 1;
      normals[(vOffset + i) * 3 + 2] = nrm?.getZ(i) ?? 0;
      uvs[(vOffset + i) * 2] = uv?.getX(i) ?? 0;
      uvs[(vOffset + i) * 2 + 1] = uv?.getY(i) ?? 0;
    }

    const index = part.index;
    if (index === null) {
      for (let i = 0; i < pos.count; i++) indices[iOffset + i] = vOffset + i;
      iOffset += pos.count;
    } else {
      for (let i = 0; i < index.count; i++) indices[iOffset + i] = vOffset + index.getX(i);
      iOffset += index.count;
    }
    vOffset += pos.count;
    part.dispose();
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.setIndex(new BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

let shared: BufferGeometry | null = null;

export function fenceGeometry(): BufferGeometry {
  shared ??= buildFence();
  return shared;
}
