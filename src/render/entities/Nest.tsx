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
import type { BufferGeometry } from 'three';
import { BoxGeometry, Matrix4, Euler, Vector3 } from 'three';
import { mergeColouredParts } from './mergeParts';
import { hash2D } from '../materials/noise';
import type { Nest } from '../../sim/nests';
import { EggEntity } from './EggEntity';

/** Weathered wood, carried on the merged geometry's vertex colours. */
const TWIG = '#8a7048';

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

  // One colour throughout: the twigs are all the same weathered wood.
  return mergeColouredParts(parts.map((geometry) => ({ geometry, colour: TWIG })));
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
        <meshStandardMaterial vertexColors roughness={0.92} />
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
