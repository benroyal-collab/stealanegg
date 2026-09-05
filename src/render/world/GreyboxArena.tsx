/**
 * The M1 movement gym.
 *
 * Deliberately ugly. Every obstacle here exists to exercise one feel target:
 * ramps at each side of the slope limit, ledges at the bottom, middle and top
 * of the vault band, a low tunnel that forces a crouch, a wading pool, a
 * pillar forest for camera-arm collision, and a long flat run for testing
 * pure acceleration. It stays in the build as a debug room reachable from the
 * Parent Panel, because a movement gym is worth keeping.
 */

import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { MOVEMENT } from '../../data/balance';

interface BlockProps {
  position: [number, number, number];
  size: [number, number, number];
  colour: string;
  rotation?: [number, number, number];
}

function Block({ position, size, colour, rotation }: BlockProps): React.ReactElement {
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={rotation ?? [0, 0, 0]}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={colour} roughness={0.85} metalness={0} />
      </mesh>
    </RigidBody>
  );
}

export const GREYBOX_SPAWN: readonly [number, number, number] = [0, 0.2, 0];
export const GREYBOX_WATER_LEVEL = 0.0;
export const GREYBOX_HALF_EXTENT = 40;

export function GreyboxArena(): React.ReactElement {
  const ledgeHeights = [
    MOVEMENT.vaultMinHeight + 0.05,
    (MOVEMENT.vaultMinHeight + MOVEMENT.vaultMaxHeight) / 2,
    MOVEMENT.vaultMaxHeight - 0.05,
    MOVEMENT.vaultMaxHeight + 1.2, // deliberately unclimbable
  ];

  return (
    <group>
      {/* Floor */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[GREYBOX_HALF_EXTENT, 0.5, GREYBOX_HALF_EXTENT]}
          position={[0, -0.5, 0]}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[GREYBOX_HALF_EXTENT * 2, GREYBOX_HALF_EXTENT * 2]} />
          <meshStandardMaterial color="#4a5340" roughness={0.95} />
        </mesh>
      </RigidBody>

      {/* Outer walls, so a runaway sprint can never leave the world. */}
      {[
        [0, 3, -GREYBOX_HALF_EXTENT, GREYBOX_HALF_EXTENT * 2, 6, 1],
        [0, 3, GREYBOX_HALF_EXTENT, GREYBOX_HALF_EXTENT * 2, 6, 1],
        [-GREYBOX_HALF_EXTENT, 3, 0, 1, 6, GREYBOX_HALF_EXTENT * 2],
        [GREYBOX_HALF_EXTENT, 3, 0, 1, 6, GREYBOX_HALF_EXTENT * 2],
      ].map((w, i) => (
        <Block
          key={`wall-${i}`}
          position={[w[0]!, w[1]!, w[2]!]}
          size={[w[3]!, w[4]!, w[5]!]}
          colour="#3c4436"
        />
      ))}

      {/* Vault ledges, ascending. The fourth is over the limit on purpose. */}
      {ledgeHeights.map((h, i) => (
        <Block
          key={`ledge-${i}`}
          position={[-14 + i * 5, h / 2, -10]}
          size={[3.4, h, 1.2]}
          colour={i === ledgeHeights.length - 1 ? '#6a4a4a' : '#6a6a58'}
        />
      ))}

      {/* Ramps at 20 (climbable), 40 (climbable) and 60 (over the limit). */}
      {[20, 40, 60].map((deg, i) => (
        <Block
          key={`ramp-${deg}`}
          position={[10 + i * 9, 1.2, -8]}
          size={[6, 0.4, 9]}
          colour={deg > MOVEMENT.maxSlopeDegrees ? '#6a4a4a' : '#5a6a58'}
          rotation={[(-deg * Math.PI) / 180, 0, 0]}
        />
      ))}

      {/* Low tunnel: the only way through is crouched or sliding. */}
      <Block position={[0, 1.3, 12]} size={[10, 0.5, 4]} colour="#585c6a" />
      <Block position={[-5.4, 0.55, 12]} size={[0.8, 1.1, 4]} colour="#585c6a" />
      <Block position={[5.4, 0.55, 12]} size={[0.8, 1.1, 4]} colour="#585c6a" />

      {/* Pillar forest, for camera arm collision. */}
      {Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const r = 9 + (i % 3) * 2.5;
        return (
          <Block
            key={`pillar-${i}`}
            position={[Math.cos(angle) * r - 20, 2, Math.sin(angle) * r + 18]}
            size={[1, 4, 1]}
            colour="#6a6a72"
          />
        );
      })}

      {/* Wading pool. The floor dips; the water plane is at y = 0. */}
      <RigidBody type="fixed" colliders={false} position={[20, -0.9, 16]}>
        <CuboidCollider args={[7, 0.5, 7]} />
        <mesh receiveShadow>
          <boxGeometry args={[14, 1, 14]} />
          <meshStandardMaterial color="#3a4a48" roughness={0.9} />
        </mesh>
      </RigidBody>
      <mesh position={[20, GREYBOX_WATER_LEVEL, 16]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#4a7f88" transparent opacity={0.55} roughness={0.15} />
      </mesh>

      {/* Slide lane: a long clear run into the tunnel. */}
      <Block position={[0, 0.02, 2]} size={[6, 0.04, 14]} colour="#556047" />
    </group>
  );
}
