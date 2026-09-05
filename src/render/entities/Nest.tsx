/**
 * A nest, and whatever is sitting in it.
 *
 * The woven ring is fourteen twigs, and an earlier version drew each one as
 * its own mesh: nine nests came to 126 draw calls before a single egg,
 * guardian or building was on screen. They are now baked into one shared
 * geometry -- the twigs are identical from nest to nest, so one geometry
 * serves all of them and each nest costs a single draw.
 */

import { useMemo } from 'react';
import { BoxGeometry, BufferAttribute, BufferGeometry, Matrix4, Euler, Vector3 } from 'three';
import { hash2D } from '../materials/noise';
import type { Nest } from '../../sim/nests';
import { EggEntity } from './EggEntity';

/**
 * The woven ring, baked once.
 *
 * Twigs are laid out from a fixed hash rather than per nest, so every nest
 * shares this geometry. Nests are things a child recognises by shape; making
 * each one subtly unique would cost nine geometries and buy nothing.
 */
function buildNestRing(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const matrix = new Matrix4();
  const euler = new Euler();
  const position = new Vector3();
  const count = 14;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radius = 0.33 + hash2D(i, 7, 3) * 0.05;
    const length = 0.28 + hash2D(i, 7, 13) * 0.12;

    const twig = new BoxGeometry(0.055, 0.05, length);
    position.set(Math.cos(angle) * radius, 0.045 + (i % 2) * 0.035, Math.sin(angle) * radius);
    euler.set(0, -angle + (hash2D(i, 7, 7) - 0.5) * 0.5, (hash2D(i, 7, 11) - 0.5) * 0.4);
    matrix.makeRotationFromEuler(euler).setPosition(position);
    twig.applyMatrix4(matrix);
    parts.push(twig);
  }

  return mergeGeometries(parts);
}

/** Concatenate position/normal/uv geometries into one indexed buffer. */
function mergeGeometries(parts: BufferGeometry[]): BufferGeometry {
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

let sharedRing: BufferGeometry | null = null;
function nestRing(): BufferGeometry {
  sharedRing ??= buildNestRing();
  return sharedRing;
}

export interface NestEntityProps {
  nest: Nest;
  /** True when the player is close enough to press Grab. */
  highlighted: boolean;
  /** True while a rival has this nest marked. */
  contested: boolean;
}

export function NestEntity({ nest, highlighted, contested }: NestEntityProps): React.ReactElement {
  const ring = useMemo(() => nestRing(), []);

  return (
    <group position={[nest.position.x, nest.groundY, nest.position.z]}>
      <mesh geometry={ring} castShadow receiveShadow>
        <meshStandardMaterial color="#8a7048" roughness={0.92} />
      </mesh>

      {/* A shallow bed of down, so an empty nest still reads as a nest. */}
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.3, 0.26, 0.05, 14]} />
        <meshStandardMaterial color="#d8c8a8" roughness={0.95} />
      </mesh>

      {nest.egg !== null ? (
        <EggEntity roll={nest.egg} position={[0, 0.22, 0]} idle highlighted={highlighted} />
      ) : null}

      {/*
        Contested marker: a rival is on their way. A distinct shape rather
        than a colour, and it appears four seconds before they set off so
        there is always time to decide whether to race for it.
      */}
      {contested ? (
        <mesh position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]}>
          <octahedronGeometry args={[0.14, 0]} />
          <meshBasicMaterial color="#ff9a5a" toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}
