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
import { forwardRef, useEffect, useMemo, useRef } from 'react';
import { DoubleSide, MathUtils, type Group, type Mesh } from 'three';
import type { CreatureBody, GuardianState } from '../../sim/types';
import type { GuardianInstance } from '../../systems/loop';
import { buildCreature, disposeCreature } from './creatureMesh';

export interface GuardianEntityProps {
  /**
   * The live runtime object, read inside this component's own frame loop.
   *
   * Passing position and state as props would pin the guardian to whatever
   * rate the parent re-renders at -- ten hertz, in practice, which looks
   * like a stop-motion animation. Reading the mutable instance per frame
   * gives smooth movement for one prop.
   */
  instance: GuardianInstance;
  body: CreatureBody;
  scale: number;
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
  instance,
  body,
  scale,
  visionConeDegrees,
  visionRange,
  showVisionCone,
  colourblindSafe,
}: GuardianEntityProps): React.ReactElement {
  const root = useRef<Group>(null);
  const cone = useRef<Mesh>(null);
  const icon = useRef<Group>(null);
  const bob = useRef(0);

  const parts = useMemo(() => buildCreature(body, scale), [body, scale]);
  useEffect(() => {
    return () => disposeCreature(parts);
  }, [parts]);

  useFrame((_state, rawDelta) => {
    const g = root.current;
    if (g === null) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const state = instance.runtime.state;

    g.position.set(instance.position.x, instance.groundY, instance.position.z);
    g.rotation.y = MathUtils.damp(g.rotation.y, instance.facing, 8, dt);

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

    const camera = _state.camera.position;
    const toCamera = Math.hypot(camera.x - instance.position.x, camera.z - instance.position.z);

    /*
     * Eyes, pupils, ears and belly are a dozen extra draw calls per guardian,
     * paid again for every shadow cascade, and past twenty metres each one is
     * smaller than the pixel it lands in. Hiding the detail group is free
     * fidelity: nobody can see what is being removed.
     */
    parts.detail.visible = toCamera < DETAIL_DRAW_DISTANCE;

    if (cone.current !== null) {
      /*
       * Vision cones are the single most expensive thing this entity draws:
       * a transparent disc metres across, and with nine guardians in a biome
       * they stack into near-full-screen overdraw. They are also useless at
       * range -- a cone you cannot walk into does not help you plan.
       *
       * So they are culled by distance. This took the software rasteriser in
       * CI from seventeen seconds a frame to something usable, and it is the
       * same saving on a real integrated GPU.
       */
      cone.current.visible = showVisionCone && state !== 'drowsy' && toCamera < CONE_DRAW_DISTANCE;
      const material = cone.current.material as { opacity?: number };
      if (material.opacity !== undefined) {
        material.opacity = 0.1 + instance.alertness * 0.22;
      }
    }

    // Swap the thought bubble as the state changes. Shape, never colour.
    if (icon.current !== null) {
      const wanted = STATE_ICON[state];
      for (const child of icon.current.children) {
        child.visible = child.name === wanted;
      }
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
          // Updated per frame from the runtime; this is only the initial value.
          opacity={0.1}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/*
        Every icon is mounted and hidden rather than swapped, so changing
        state costs a visibility flag instead of a React reconcile -- this
        component never re-renders after mount.
      */}
      <StateIcons ref={icon} height={scale * 1.5} instance={instance} />
      {/* coneRadius is derived for callers that want to lay out a HUD blip. */}
      <group visible={false} userData={{ coneRadius }} />
    </group>
  );
}

/** Beyond this, a vision cone costs overdraw and tells the player nothing. */
const CONE_DRAW_DISTANCE = 34;

/** Beyond this, a creature's small features are smaller than a pixel. */
const DETAIL_DRAW_DISTANCE = 22;

/**
 * The thought bubbles above a Guardian's head.
 *
 * Shape, not colour: a question mark for "did I hear something", an
 * exclamation for "there you are", Zs for asleep. Readable at a glance and
 * completely colourblind-safe. All of them are mounted at once and toggled by
 * visibility, so a state change never triggers a React render.
 */
const StateIcons = forwardRef<Group, { height: number; instance: GuardianInstance }>(
  function StateIcons({ height, instance }, ref): React.ReactElement {
    const group = useRef<Group>(null);

    useFrame((state) => {
      const g = group.current;
      if (g === null) return;
      // Always face the camera.
      g.quaternion.copy(state.camera.quaternion);
      const urgent = instance.runtime.state === 'chase';
      // 3Hz maximum, everywhere in this game. This is 1Hz.
      const pop = urgent ? 1 + Math.sin(state.clock.elapsedTime * 6) * 0.08 : 1;
      g.scale.setScalar(pop * (0.6 + instance.alertness * 0.5));
    });

    return (
      <group ref={mergeRefs(group, ref)} position={[0, height, 0]}>
        <group name="exclaim" visible={false}>
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[0.07, 0.22, 0.02]} />
            <meshBasicMaterial color="#ffd05a" toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.09, 0]}>
            <boxGeometry args={[0.07, 0.07, 0.02]} />
            <meshBasicMaterial color="#ffd05a" toneMapped={false} />
          </mesh>
        </group>

        <group name="question" visible={false}>
          <mesh position={[0, 0.08, 0]} rotation={[0, 0, 0.3]}>
            <torusGeometry args={[0.09, 0.028, 6, 12, Math.PI * 1.3]} />
            <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.11, 0]}>
            <boxGeometry args={[0.06, 0.06, 0.02]} />
            <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
          </mesh>
        </group>

        <group name="zzz" visible={false}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[i * 0.07 - 0.07, i * 0.07, 0]} scale={1 - i * 0.2}>
              <boxGeometry args={[0.09, 0.02, 0.02]} />
              <meshBasicMaterial color="#bcd6ea" toneMapped={false} />
            </mesh>
          ))}
        </group>

        <group name="sigh" visible={false}>
          <mesh>
            <boxGeometry args={[0.16, 0.03, 0.02]} />
            <meshBasicMaterial color="#cfcfc4" toneMapped={false} />
          </mesh>
        </group>

        <group name="dots" visible={false} />
      </group>
    );
  },
);

/** Point two refs at the same object. */
function mergeRefs<T>(
  local: React.RefObject<T | null>,
  forwarded: React.ForwardedRef<T>,
): (value: T | null) => void {
  return (value) => {
    local.current = value;
    if (typeof forwarded === 'function') forwarded(value);
    else if (forwarded !== null) forwarded.current = value;
  };
}
