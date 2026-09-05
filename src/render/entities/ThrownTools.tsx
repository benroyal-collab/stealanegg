/**
 * Seed pouches and sleepy berries, in flight and on the ground.
 *
 * Both are non-violent by construction: a seed pouch makes a rustle a
 * guardian wants to inspect, and a sleepy berry makes one yawn. Neither can
 * hurt anything, and the landed marker stays visible for the whole lure so
 * the player can see the trap they set.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { TOOL_DEFS } from '../../data/balance';
import type { ThrownTool } from '../../systems/loop';

export function ThrownTools({ thrown }: { thrown: readonly ThrownTool[] }): React.ReactElement {
  return (
    <group>
      {thrown.map((tool, i) => (
        <ThrownToolMesh key={`${tool.tool}-${i}`} tool={tool} />
      ))}
    </group>
  );
}

function ThrownToolMesh({ tool }: { tool: ThrownTool }): React.ReactElement {
  const group = useRef<Group>(null);
  const spin = useRef(0);

  useFrame((_state, delta) => {
    const g = group.current;
    if (g === null) return;
    g.position.set(tool.position.x, tool.height, tool.position.z);
    if (!tool.landed) {
      spin.current += delta * 8;
      g.rotation.set(spin.current, spin.current * 0.6, 0);
    }
  });

  const berry = tool.tool === 'sleepyBerries';
  const lureFraction = Math.max(0, tool.lureRemaining) / TOOL_DEFS[tool.tool].lureSeconds;

  return (
    <group ref={group}>
      <mesh castShadow>
        {berry ? <sphereGeometry args={[0.09, 10, 8]} /> : <boxGeometry args={[0.14, 0.11, 0.1]} />}
        <meshStandardMaterial
          color={berry ? '#8a4a7a' : '#c9a86b'}
          roughness={berry ? 0.35 : 0.85}
        />
      </mesh>

      {/*
        The lure radius on the ground, shrinking as it wears off. A ring, not
        a glow: the player needs to see exactly how far it reaches.
      */}
      {tool.landed && lureFraction > 0 ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={1}>
          <ringGeometry
            args={[
              TOOL_DEFS[tool.tool].lureRadius * lureFraction * 0.92,
              TOOL_DEFS[tool.tool].lureRadius * lureFraction,
              32,
            ]}
          />
          <meshBasicMaterial
            color={berry ? '#c88ad8' : '#e8d08a'}
            transparent
            opacity={0.45 * lureFraction}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}
