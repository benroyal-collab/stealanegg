/**
 * A nest, and whatever is sitting in it.
 *
 * The nest itself is a woven ring of tapered boxes -- cheap, and it reads as
 * "somebody built this" from a distance, which matters because a nest is the
 * thing a child is looking for.
 */

import { useMemo } from 'react';
import { hash2D } from '../materials/noise';
import type { Nest } from '../../sim/nests';
import { EggEntity } from './EggEntity';

export interface NestEntityProps {
  nest: Nest;
  /** True when the player is close enough to press Grab. */
  highlighted: boolean;
  /** True while a rival has this nest marked. */
  contested: boolean;
}

export function NestEntity({ nest, highlighted, contested }: NestEntityProps): React.ReactElement {
  const twigs = useMemo(() => {
    const out: {
      position: [number, number, number];
      rotation: [number, number, number];
      length: number;
    }[] = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 0.33 + hash2D(i, nest.index, 3) * 0.05;
      out.push({
        position: [Math.cos(angle) * radius, 0.045 + (i % 2) * 0.035, Math.sin(angle) * radius],
        rotation: [
          0,
          -angle + (hash2D(i, nest.index, 7) - 0.5) * 0.5,
          (hash2D(i, nest.index, 11) - 0.5) * 0.4,
        ],
        length: 0.28 + hash2D(i, nest.index, 13) * 0.12,
      });
    }
    return out;
  }, [nest.index]);

  return (
    <group position={[nest.position.x, nest.groundY, nest.position.z]}>
      {twigs.map((twig, i) => (
        <mesh key={i} position={twig.position} rotation={twig.rotation} castShadow receiveShadow>
          <boxGeometry args={[0.055, 0.05, twig.length]} />
          <meshStandardMaterial color="#8a7048" roughness={0.92} />
        </mesh>
      ))}

      {/* A shallow bed of down so an empty nest still reads as a nest. */}
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
