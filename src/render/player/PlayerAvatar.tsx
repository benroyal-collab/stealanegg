/**
 * The ranger.
 *
 * Parametric geometry, procedurally animated -- no rig, no clips, no imported
 * mesh. The locomotion "blend tree" is a set of phase-driven sine curves whose
 * amplitude and frequency are blended by speed, which for a character built
 * this way reads better than a badly retargeted animation would.
 *
 * What makes a figure read as a person rather than as a stack of primitives is
 * mostly joints and proportion, not polygon count:
 *
 * - **Two segments per limb.** A thigh and a shin with a knee between them is
 *   the difference between walking and swinging a pendulum. The same for the
 *   elbow.
 * - **A neck.** A head sitting straight on a torso is a snowman.
 * - **A tapered chest.** Shoulders wider than the waist, waist narrower than
 *   the hips.
 * - **Real proportions.** Seven heads, from `rangerProportions.ts`, which is
 *   also where they get asserted against the physics capsule -- the previous
 *   ranger stood twenty centimetres shorter than his own collider.
 *
 * The torso counter-rotates against the hips, which is the cheapest single
 * thing you can do to stop a procedural walk looking like a wind-up toy.
 *
 * The shapes themselves live in `rangerMesh.ts`, baked one buffer per joint.
 * This file owns only the skeleton and how it moves.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { BufferGeometry, Group, Mesh } from 'three';
import { MathUtils, MeshStandardMaterial } from 'three';
import { MOVEMENT } from '../../data/balance';
import { roughnessMap } from '../materials/proceduralTextures';
import { playerRef } from './playerRuntime';
import {
  chestGeometry,
  forearmGeometry,
  headGeometry,
  hipsGeometry,
  satchelGeometry,
  shinGeometry,
  thighGeometry,
  upperArmGeometry,
} from './rangerMesh';
import { RANGER } from './rangerProportions';

interface RangerParts {
  hips: BufferGeometry;
  chest: BufferGeometry;
  satchel: BufferGeometry;
  head: BufferGeometry;
  thigh: BufferGeometry;
  shin: BufferGeometry;
  upperArm: BufferGeometry;
  forearm: BufferGeometry;
}

export function PlayerAvatar(): React.ReactElement {
  const root = useRef<Group>(null);
  const hips = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const chest = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const kneeL = useRef<Group>(null);
  const kneeR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const elbowL = useRef<Group>(null);
  const elbowR = useRef<Group>(null);
  const carried = useRef<Mesh>(null);

  const phase = useRef(0);
  const breath = useRef(0);
  const lean = useRef(0);
  const bob = useRef(0);

  /*
   * One material for the whole character.
   *
   * Colour comes from the merged geometry's vertex attribute, which is what
   * lets skin, cloth, leather and hair share a draw call. A gentle roughness
   * map keeps the surface from going plastic, which is what the per-part
   * roughness constants used to do.
   *
   * No normal map, though the rest of the project uses one everywhere. Merged
   * geometry carries each primitive's own UVs, so a tiled texture lands at a
   * different scale on the hat, the shin and the nose -- fine for roughness,
   * where the variation is a whisper, and badly wrong for a normal map, which
   * covered the ranger in what looked like knitwear.
   */
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.82,
        roughnessMap: roughnessMap('ranger-cloth', 0.82, 0.1, 128),
      }),
    [],
  );

  const parts: RangerParts = useMemo(
    () => ({
      hips: hipsGeometry(),
      chest: chestGeometry(),
      satchel: satchelGeometry(),
      head: headGeometry(),
      thigh: thighGeometry(),
      shin: shinGeometry(),
      upperArm: upperArmGeometry(),
      forearm: forearmGeometry(),
    }),
    [],
  );

  useEffect(() => {
    return () => {
      material.dispose();
      for (const geometry of Object.values(parts)) geometry.dispose();
    };
  }, [material, parts]);

  useFrame((_state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20);
    const g = root.current;
    if (g === null) return;

    g.position.copy(playerRef.position);
    g.rotation.y = MathUtils.damp(g.rotation.y, playerRef.facing, 18, dt);

    const speed = playerRef.speed;
    const norm = Math.min(1, speed / MOVEMENT.basePace);
    const moving = speed > 0.25;
    const crouched = playerRef.stance === 'crouched' || playerRef.stance === 'sliding';
    const tumbling = playerRef.stance === 'tumbling';

    // Stride frequency rises with speed, but sub-linearly -- a sprint is
    // longer strides more than it is faster ones.
    const stride = 3.2 + norm * 5.4;
    phase.current += dt * stride * (moving ? 1 : 0);
    breath.current += dt * (1.1 + norm * 1.6);

    const swing = Math.sin(phase.current);
    const swing2 = Math.sin(phase.current * 2);
    const amp = 0.22 + norm * 0.62;

    /*
     * Knees only bend one way.
     *
     * The flex peaks on the leg that is behind and lifting -- that is the heel
     * kick you see from behind a runner, and it is most of what separates a
     * run from a walk at a glance. A few degrees of standing flex stops the
     * legs looking hyperextended when idle.
     */
    const standingFlex = 0.06 + (crouched ? 0.8 : 0);
    if (legL.current && legR.current && kneeL.current && kneeR.current) {
      legL.current.rotation.x = swing * amp - (crouched ? 0.42 : 0);
      legR.current.rotation.x = -swing * amp - (crouched ? 0.42 : 0);
      kneeL.current.rotation.x = standingFlex + Math.max(0, -swing) * amp * 1.5;
      kneeR.current.rotation.x = standingFlex + Math.max(0, swing) * amp * 1.5;
    }

    /*
     * Arms counter the legs, and the elbow closes as the pace rises. A walker
     * swings almost straight arms; a sprinter holds them near ninety degrees.
     */
    if (armL.current && armR.current && elbowL.current && elbowR.current) {
      const tuck = norm * 0.45;
      armL.current.rotation.x = -swing * amp * 0.8 - tuck;
      armR.current.rotation.x = swing * amp * 0.8 - tuck;
      armL.current.rotation.z = 0.1 + tuck * 0.35;
      armR.current.rotation.z = -0.1 - tuck * 0.35;
      const bend = 0.22 + norm * 0.95;
      elbowL.current.rotation.x = -(bend + Math.max(0, swing) * amp * 0.5);
      elbowR.current.rotation.x = -(bend + Math.max(0, -swing) * amp * 0.5);
    }

    // Vertical bob, twice per stride, scaled so a sprint really pounds.
    bob.current = MathUtils.damp(bob.current, Math.abs(swing2) * 0.045 * norm, 14, dt);

    // Lean into acceleration. Reads as effort without any extra art.
    const wantLean = tumbling ? 0 : norm * 0.16;
    lean.current = MathUtils.damp(lean.current, wantLean, 8, dt);

    if (hips.current) {
      hips.current.position.y =
        RANGER.hipHeight + (crouched ? -RANGER.crouchDrop : 0) + bob.current;
      hips.current.rotation.y = swing * 0.12 * norm;
      hips.current.rotation.x = lean.current + (crouched ? 0.3 : 0);
    }
    if (torso.current) {
      // The counter-rotation. Opposes the hips, lags slightly behind.
      torso.current.rotation.y = -swing * 0.2 * norm;
      torso.current.rotation.x = crouched ? 0.2 : 0;
    }
    if (chest.current) {
      // Breathing: a couple of millimetres, faster when he has been running.
      // Invisible frame to frame, and the reason a still figure looks alive.
      const rise = 1 + Math.sin(breath.current) * (0.012 + norm * 0.014);
      chest.current.scale.set(rise, 1, rise);
    }
    if (head.current) {
      // The head stays level while everything under it moves.
      head.current.rotation.x = -lean.current * 0.8 - (crouched ? 0.32 : 0);
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
      <group ref={hips} position={[0, RANGER.hipHeight, 0]}>
        <mesh geometry={parts.hips} material={material} castShadow />

        <Leg side={-1} legRef={legL} kneeRef={kneeL} parts={parts} material={material} />
        <Leg side={1} legRef={legR} kneeRef={kneeR} parts={parts} material={material} />

        <group ref={torso}>
          <group ref={chest}>
            <mesh geometry={parts.chest} material={material} castShadow />
          </group>
          <mesh geometry={parts.satchel} material={material} castShadow />

          <Arm side={-1} armRef={armL} elbowRef={elbowL} parts={parts} material={material} />
          <Arm
            side={1}
            armRef={armR}
            elbowRef={elbowR}
            parts={parts}
            material={material}
            carriedRef={carried}
          />

          <group ref={head} position={[0, RANGER.hipToHeadCentre, 0]}>
            <mesh geometry={parts.head} material={material} castShadow />
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * Thigh, knee, shin, boot.
 *
 * `side` is −1 for left and +1 for right; everything else is mirrored from it,
 * so the two legs cannot drift apart when one is edited.
 */
function Leg({
  side,
  legRef,
  kneeRef,
  parts,
  material,
}: {
  side: -1 | 1;
  legRef: React.RefObject<Group | null>;
  kneeRef: React.RefObject<Group | null>;
  parts: RangerParts;
  material: MeshStandardMaterial;
}): React.ReactElement {
  return (
    <group ref={legRef} position={[side * RANGER.hipHalfWidth, 0, 0]}>
      <mesh geometry={parts.thigh} material={material} castShadow />
      <group ref={kneeRef} position={[0, -RANGER.thigh, 0]}>
        <mesh geometry={parts.shin} material={material} castShadow />
      </group>
    </group>
  );
}

/** Upper arm, elbow, forearm with a rolled sleeve, and a hand. */
function Arm({
  side,
  armRef,
  elbowRef,
  parts,
  material,
  carriedRef,
}: {
  side: -1 | 1;
  armRef: React.RefObject<Group | null>;
  elbowRef: React.RefObject<Group | null>;
  parts: RangerParts;
  material: MeshStandardMaterial;
  carriedRef?: React.RefObject<Mesh | null>;
}): React.ReactElement {
  return (
    <group ref={armRef} position={[side * RANGER.shoulderHalfWidth, RANGER.hipToShoulder, 0]}>
      <mesh geometry={parts.upperArm} material={material} castShadow />
      <group ref={elbowRef} position={[0, -RANGER.upperArm, 0]}>
        <mesh geometry={parts.forearm} material={material} castShadow />
        {carriedRef === undefined ? null : (
          <mesh ref={carriedRef} position={[0, -RANGER.forearm - 0.16, 0.08]}>
            <sphereGeometry args={[0.11, 12, 10]} />
            <meshStandardMaterial color="#f0e0c0" roughness={0.5} />
          </mesh>
        )}
      </group>
    </group>
  );
}
