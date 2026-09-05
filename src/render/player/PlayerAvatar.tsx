/**
 * The ranger.
 *
 * Parametric geometry, procedurally animated -- no rig, no clips, no imported
 * mesh. The locomotion "blend tree" is a set of phase-driven sine curves
 * whose amplitude and frequency are blended by speed, which for a character
 * this stylised reads better than a badly retargeted animation would.
 *
 * The torso counter-rotates against the hips, which is the single cheapest
 * thing you can do to stop a procedural walk looking like a wind-up toy.
 */

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh } from 'three';
import { MathUtils } from 'three';
import { MOVEMENT } from '../../data/balance';
import { playerRef } from './playerRuntime';

const SKIN = '#c9a183';
const COAT = '#4f6b52';
// Dark enough to stay a separate shape from the skin under a low sun. At
// #5a5346 the legs washed out to the same value as the hands in dawn light and
// the whole lower body read as one pale column.
const TROUSER = '#3f3a30';
const PACK = '#8a6a44';

export function PlayerAvatar(): React.ReactElement {
  const root = useRef<Group>(null);
  const hips = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const carried = useRef<Mesh>(null);

  const phase = useRef(0);
  const lean = useRef(0);
  const bob = useRef(0);

  useFrame((_state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20);
    const g = root.current;
    if (g === null) return;

    g.position.copy(playerRef.position);
    g.rotation.y = MathUtils.damp(g.rotation.y, playerRef.facing, 18, dt);

    const speed = playerRef.speed;
    const norm = Math.min(1, speed / MOVEMENT.basePace);
    const crouched = playerRef.stance === 'crouched' || playerRef.stance === 'sliding';
    const tumbling = playerRef.stance === 'tumbling';

    // Stride frequency rises with speed, but sub-linearly -- a sprint is
    // longer strides more than it is faster ones.
    const stride = 3.2 + norm * 5.4;
    phase.current += dt * stride * (speed > 0.25 ? 1 : 0);

    const swing = Math.sin(phase.current);
    const swing2 = Math.sin(phase.current * 2);
    const amp = 0.22 + norm * 0.62;

    if (legL.current && legR.current) {
      legL.current.rotation.x = swing * amp;
      legR.current.rotation.x = -swing * amp;
    }
    if (armL.current && armR.current) {
      // Arms counter the legs, and tuck in when sprinting.
      const tuck = norm * 0.5;
      armL.current.rotation.x = -swing * amp * 0.8 - tuck;
      armR.current.rotation.x = swing * amp * 0.8 - tuck;
      armL.current.rotation.z = 0.12 + tuck * 0.4;
      armR.current.rotation.z = -0.12 - tuck * 0.4;
    }

    // Vertical bob, twice per stride, scaled so a sprint really pounds.
    bob.current = MathUtils.damp(bob.current, Math.abs(swing2) * 0.045 * norm, 14, dt);

    // Lean into acceleration. Reads as effort without any extra art.
    const wantLean = tumbling ? 0 : norm * 0.16;
    lean.current = MathUtils.damp(lean.current, wantLean, 8, dt);

    if (hips.current) {
      // 0.72 puts the soles within a centimetre of the root, which is where
      // the movement solver reports the feet to be. Any higher and the ranger
      // hovers; any lower and the shins sink into the terrain.
      hips.current.position.y = 0.72 + (crouched ? -0.26 : 0) + bob.current;
      hips.current.rotation.y = swing * 0.12 * norm;
      hips.current.rotation.x = lean.current + (crouched ? 0.28 : 0);
    }
    if (torso.current) {
      // The counter-rotation. Opposes the hips, lags slightly behind.
      torso.current.rotation.y = -swing * 0.2 * norm;
      torso.current.rotation.x = crouched ? 0.18 : 0;
    }
    if (head.current) {
      // The head stays level while everything under it moves.
      head.current.rotation.x = -lean.current * 0.8 - (crouched ? 0.3 : 0);
      head.current.rotation.y = -swing * 0.08 * norm;
    }

    if (tumbling) {
      g.rotation.x = MathUtils.damp(g.rotation.x, 1.35, 10, dt);
      g.position.y += 0.25;
    } else {
      g.rotation.x = MathUtils.damp(g.rotation.x, 0, 12, dt);
    }

    // The carried egg is rendered by BiomeRuntime at world scale, not parented
    // to the hand -- so the hand's placeholder stays hidden.
    if (carried.current) carried.current.visible = false;
  });

  return (
    <group ref={root}>
      <group ref={hips} position={[0, 0.72, 0]}>
        {/* Legs */}
        <group ref={legL} position={[-0.135, 0, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.44, 4, 10]} />
            <meshStandardMaterial color={TROUSER} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.63, 0.04]} castShadow>
            <boxGeometry args={[0.15, 0.1, 0.26]} />
            <meshStandardMaterial color="#3a3128" roughness={0.7} />
          </mesh>
        </group>
        <group ref={legR} position={[0.135, 0, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.44, 4, 10]} />
            <meshStandardMaterial color={TROUSER} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.63, 0.04]} castShadow>
            <boxGeometry args={[0.15, 0.1, 0.26]} />
            <meshStandardMaterial color="#3a3128" roughness={0.7} />
          </mesh>
        </group>

        <group ref={torso}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <capsuleGeometry args={[0.155, 0.3, 4, 12]} />
            <meshStandardMaterial color={COAT} roughness={0.78} />
          </mesh>
          {/* Ranger's satchel, so the silhouette reads from behind. */}
          <mesh position={[0, 0.16, -0.19]} castShadow>
            <boxGeometry args={[0.26, 0.26, 0.13]} />
            <meshStandardMaterial color={PACK} roughness={0.8} />
          </mesh>

          <group ref={armL} position={[-0.21, 0.34, 0]}>
            <mesh position={[0, -0.18, 0]} castShadow>
              <capsuleGeometry args={[0.055, 0.28, 4, 8]} />
              <meshStandardMaterial color={COAT} roughness={0.78} />
            </mesh>
            <mesh position={[0, -0.36, 0]} castShadow>
              <sphereGeometry args={[0.058, 10, 8]} />
              <meshStandardMaterial color={SKIN} roughness={0.62} />
            </mesh>
          </group>
          <group ref={armR} position={[0.21, 0.34, 0]}>
            <mesh position={[0, -0.18, 0]} castShadow>
              <capsuleGeometry args={[0.055, 0.28, 4, 8]} />
              <meshStandardMaterial color={COAT} roughness={0.78} />
            </mesh>
            <mesh position={[0, -0.36, 0]} castShadow>
              <sphereGeometry args={[0.058, 10, 8]} />
              <meshStandardMaterial color={SKIN} roughness={0.62} />
            </mesh>
            <mesh ref={carried} position={[0, -0.44, 0.1]}>
              <sphereGeometry args={[0.12, 12, 10]} />
              <meshStandardMaterial color="#f0e0c0" roughness={0.5} />
            </mesh>
          </group>

          <group ref={head} position={[0, 0.52, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.135, 16, 14]} />
              <meshStandardMaterial color={SKIN} roughness={0.6} />
            </mesh>
            {/* Ranger hat: the strongest single silhouette cue we have. */}
            <mesh position={[0, 0.09, 0]} castShadow>
              <cylinderGeometry args={[0.115, 0.135, 0.12, 14]} />
              <meshStandardMaterial color="#7a6a4a" roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.04, 0]} castShadow>
              <cylinderGeometry args={[0.25, 0.25, 0.022, 18]} />
              <meshStandardMaterial color="#7a6a4a" roughness={0.85} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
