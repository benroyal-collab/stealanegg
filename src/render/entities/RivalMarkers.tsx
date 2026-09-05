/**
 * Rival collectors, and the route markers that telegraph them.
 *
 * The constraint from the brief is absolute: rivals never touch, chase or
 * attack the player. They have no collider and no interaction of any kind.
 * They exist to create a decision -- "do I race for that one?" -- and the
 * only way they can cost you anything is twenty seconds of walking.
 *
 * Which is why the telegraph matters more than the rival: a dashed line from
 * their camp to the nest they have called dibs on, drawn four full seconds
 * before they set off.
 */

import { useMemo } from 'react';
import type { Nest } from '../../sim/nests';
import type { Rival } from '../../sim/rivals';

export interface RivalMarkersProps {
  rivals: readonly Rival[];
  nests: readonly Nest[];
  groundAt: (x: number, z: number) => number;
}

const CLUB_COLOURS = ['#e08a5a', '#7ab0d8', '#a88ad8'];

export function RivalMarkers({ rivals, nests, groundAt }: RivalMarkersProps): React.ReactElement {
  return (
    <group>
      {rivals.map((rival, i) => (
        <RivalMarker
          key={rival.id}
          rival={rival}
          nests={nests}
          groundAt={groundAt}
          colour={CLUB_COLOURS[i % CLUB_COLOURS.length] ?? '#e08a5a'}
        />
      ))}
    </group>
  );
}

function RivalMarker({
  rival,
  nests,
  groundAt,
  colour,
}: {
  rival: Rival;
  nests: readonly Nest[];
  groundAt: (x: number, z: number) => number;
  colour: string;
}): React.ReactElement | null {
  const target = rival.targetNest === null ? null : (nests[rival.targetNest] ?? null);

  // Dashes along the route. Recomputed only when the target changes, not per
  // frame -- the rival moves along the line, the line itself is static.
  const dashes = useMemo(() => {
    if (target === null) return [];
    const out: { position: [number, number, number]; rotation: number }[] = [];
    const steps = 16;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = rival.home.x + (target.position.x - rival.home.x) * t;
      const z = rival.home.z + (target.position.z - rival.home.z) * t;
      out.push({
        position: [x, groundAt(x, z) + 0.06, z],
        rotation: Math.atan2(target.position.x - rival.home.x, target.position.z - rival.home.z),
      });
    }
    return out;
  }, [target, rival.home, groundAt]);

  if (rival.phase === 'idle') return null;

  const y = groundAt(rival.position.x, rival.position.z);
  const travelling = rival.phase === 'travelling';

  return (
    <group>
      {/* The telegraph. Only shown while they are deciding or on their way. */}
      {target !== null
        ? dashes.map((dash, i) => (
            <mesh
              key={i}
              position={dash.position}
              rotation={[-Math.PI / 2, 0, -dash.rotation]}
              renderOrder={1}
            >
              <planeGeometry args={[0.18, 0.9]} />
              <meshBasicMaterial
                color={colour}
                transparent
                opacity={travelling ? 0.55 : 0.3}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          ))
        : null}

      {/*
        The collector. A friendly little figure with a satchel, no collider,
        and no way to affect the player except by getting somewhere first.
      */}
      <group position={[rival.position.x, y, rival.position.z]}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.5, 4, 10]} />
          <meshStandardMaterial color={colour} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.02, 0]} castShadow>
          <sphereGeometry args={[0.17, 12, 10]} />
          <meshStandardMaterial color="#d8b898" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.16, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.22, 0.1, 10]} />
          <meshStandardMaterial color={colour} roughness={0.85} />
        </mesh>
      </group>
    </group>
  );
}
