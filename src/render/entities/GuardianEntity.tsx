/**
 * A Guardian: the Broody Hen, the Sentinel Swan, the Dune Scorpion.
 *
 * The mesh comes from the same parametric builder as the creatures, so a
 * Guardian reads as a big cousin of the things you are collecting rather than
 * as an enemy. That is deliberate and it is a safety requirement, not a style
 * choice: nothing in this game is threatening, and a Guardian's job is to
 * shoo you away and then go back to sitting on its nest.
 *
 * The FSM lives in `src/sim/guardian.ts`. This component only renders what
 * the FSM decided, and shows the player what it is thinking.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, MathUtils, type Group, type Mesh } from 'three';
import type { CreatureBody, GuardianState } from '../../sim/types';
import { buildCreature, disposeCreature } from './creatureMesh';

export interface GuardianEntityProps {
  body: CreatureBody;
  scale: number;
  state: GuardianState;
  /** 0..1, how sure it is that something is out there. */
  alertness: number;
  position: [number, number, number];
  facing: number;
  visionConeDegrees: number;
  visionRange: number;
  /** Turns the vision cone off for players who find it cluttered. */
  showVisionCone: boolean;
  colourblindSafe: string;
}

/**
 * State is signalled three ways at once, because it must never depend on
 * colour alone: the cone changes colour, the icon above the head changes
 * shape, and the caption track spells it out in words.
 */
const STATE_ICON: Record<GuardianState, string> = {
  patrol: 'dots',
  alert: 'question',
  investigate: 'question',
  chase: 'exclaim',
  giveUp: 'sigh',
  cooldown: 'dots',
  drowsy: 'zzz',
};

export function GuardianEntity({
  body,
  scale,
  state,
  alertness,
  position,
  facing,
  visionConeDegrees,
  visionRange,
  showVisionCone,
  colourblindSafe,
}: GuardianEntityProps): React.ReactElement {
  const root = useRef<Group>(null);
  const cone = useRef<Mesh>(null);
  const bob = useRef(0);

  const parts = useMemo(() => buildCreature(body, scale), [body, scale]);
  useEffect(() => {
    return () => disposeCreature(parts);
  }, [parts]);

  useFrame((_state, rawDelta) => {
    const g = root.current;
    if (g === null) return;
    const dt = Math.min(rawDelta, 1 / 20);

    g.position.set(position[0], position[1], position[2]);
    g.rotation.y = MathUtils.damp(g.rotation.y, facing, 8, dt);

    const moving = state === 'chase' || state === 'investigate' || state === 'patrol';
    bob.current += dt * (state === 'chase' ? 9 : state === 'drowsy' ? 1.2 : 4);
    parts.body.position.y =
      parts.body.userData.baseY !== undefined
        ? (parts.body.userData.baseY as number) +
          (moving ? Math.abs(Math.sin(bob.current)) * 0.06 : 0)
        : parts.body.position.y;

    // A drowsy guardian visibly slumps. Feeding it a berry has to read.
    const slump = state === 'drowsy' ? -0.18 : 0;
    parts.body.rotation.x = MathUtils.damp(parts.body.rotation.x, slump, 6, dt);

    for (let i = 0; i < parts.legs.length; i++) {
      const leg = parts.legs[i];
      if (leg === undefined) continue;
      const offset = (i % 2 === 0 ? 0 : Math.PI) + Math.floor(i / 2) * 0.7;
      leg.rotation.x = moving ? Math.sin(bob.current + offset) * 0.42 : 0;
    }

    if (cone.current !== null) {
      cone.current.visible = showVisionCone && state !== 'drowsy';
    }
  });

  useEffect(() => {
    parts.body.userData.baseY = parts.body.position.y;
  }, [parts]);

  const coneLength = visionRange;
  const coneRadius = Math.tan((visionConeDegrees * Math.PI) / 360) * coneLength;

  return (
    <group ref={root}>
      <primitive object={parts.root} />

      {/*
        The vision cone. Flat on the ground, pointing where the Guardian is
        looking, so a child can read the whole stealth system without being
        told what a "detection cone" is.
      */}
      <mesh
        ref={cone}
        position={[0, 0.06, coneLength / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <circleGeometry
          args={[
            coneLength,
            24,
            -Math.PI / 2 - (visionConeDegrees * Math.PI) / 360,
            (visionConeDegrees * Math.PI) / 180,
          ]}
        />
        <meshBasicMaterial
          color={colourblindSafe}
          transparent
          opacity={0.1 + alertness * 0.22}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      <StateIcon icon={STATE_ICON[state]} height={scale * 1.5} alertness={alertness} />
      {/* coneRadius is derived for callers that want to lay out a HUD blip. */}
      <group visible={false} userData={{ coneRadius }} />
    </group>
  );
}

/**
 * The thought bubble above a Guardian's head.
 *
 * Shape, not colour: a question mark for "did I hear something", an
 * exclamation for "there you are", Zs for asleep. Readable at a glance and
 * completely colourblind-safe.
 */
function StateIcon({
  icon,
  height,
  alertness,
}: {
  icon: string;
  height: number;
  alertness: number;
}): React.ReactElement | null {
  const group = useRef<Group>(null);

  useFrame((state) => {
    const g = group.current;
    if (g === null) return;
    // Always face the camera.
    g.quaternion.copy(state.camera.quaternion);
    const pop = icon === 'exclaim' ? 1 + Math.sin(state.clock.elapsedTime * 6) * 0.08 : 1;
    g.scale.setScalar(pop * (0.6 + alertness * 0.5));
  });

  if (icon === 'dots') return null;

  return (
    <group ref={group} position={[0, height, 0]}>
      {icon === 'exclaim' ? (
        <>
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[0.07, 0.22, 0.02]} />
            <meshBasicMaterial color="#ffd05a" toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.09, 0]}>
            <boxGeometry args={[0.07, 0.07, 0.02]} />
            <meshBasicMaterial color="#ffd05a" toneMapped={false} />
          </mesh>
        </>
      ) : null}

      {icon === 'question' ? (
        <>
          <mesh position={[0, 0.08, 0]} rotation={[0, 0, 0.3]}>
            <torusGeometry args={[0.09, 0.028, 6, 12, Math.PI * 1.3]} />
            <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.11, 0]}>
            <boxGeometry args={[0.06, 0.06, 0.02]} />
            <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
          </mesh>
        </>
      ) : null}

      {icon === 'zzz' ? (
        <>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[i * 0.07 - 0.07, i * 0.07, 0]} scale={1 - i * 0.2}>
              <boxGeometry args={[0.09, 0.02, 0.02]} />
              <meshBasicMaterial color="#bcd6ea" toneMapped={false} />
            </mesh>
          ))}
        </>
      ) : null}

      {icon === 'sigh' ? (
        <mesh>
          <boxGeometry args={[0.16, 0.03, 0.02]} />
          <meshBasicMaterial color="#cfcfc4" toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}
