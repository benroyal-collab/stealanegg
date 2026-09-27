/**
 * A Guardian: the Broody Hen, the Sentinel Swan, the Dune Scorpion.
 *
 * Each is built as its own animal in `guardianMesh.ts`, because a child has to
 * know what is chasing them from the silhouette alone. None of them is a
 * threat -- a Guardian's job is to shoo you away and then go back to sitting
 * on its nest -- but all of them are allowed to look cross about it.
 *
 * The FSM lives in `src/sim/guardian.ts`. This component only renders what
 * the FSM decided, and shows the player what it is thinking.
 */

import { useFrame } from '@react-three/fiber';
import { forwardRef, useEffect, useMemo, useRef } from 'react';
import { Color, DoubleSide, MathUtils, ShaderMaterial, type Group, type Mesh } from 'three';
import type { GuardianState } from '../../sim/types';
import type { GuardianInstance } from '../../systems/loop';
import { buildGuardian, disposeGuardian, type GuardianSpecies } from './guardianMesh';

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
  species: GuardianSpecies;
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
  species,
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
  const menace = useRef(0);
  const shine = useRef(EYESHINE.patrol);

  const rig = useMemo(() => buildGuardian(species, scale), [species, scale]);
  useEffect(() => () => disposeGuardian(rig), [rig]);

  /*
   * The cone fades out towards the edge of the guardian's sight instead of
   * ending on a hard line. Drawn flat and unlit it was fine by day; at night
   * it glowed on the ground like a lit slab, the brightest thing on screen.
   * Now it is a soft wash that is strongest at the guardian's feet --
   * readable, and part of the scene rather than pasted over it.
   */
  const coneMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: CONE_VERTEX,
        fragmentShader: CONE_FRAGMENT,
        uniforms: {
          uColour: { value: new Color(colourblindSafe).multiplyScalar(0.8) },
          uOpacity: { value: 0.12 },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    [colourblindSafe],
  );
  useEffect(() => () => coneMaterial.dispose(), [coneMaterial]);

  useFrame((_state, rawDelta) => {
    const g = root.current;
    if (g === null) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const state = instance.runtime.state;

    g.position.set(instance.position.x, instance.groundY, instance.position.z);
    g.rotation.y = MathUtils.damp(g.rotation.y, instance.facing, 8, dt);

    const chasing = state === 'chase';
    const drowsy = state === 'drowsy';
    const moving = chasing || state === 'investigate' || state === 'patrol';
    // 14 rad/s is 2.2 steps a second: fast enough to pound, and every wing
    // beat keyed off it stays under the 3Hz ceiling.
    bob.current += dt * (chasing ? 14 : drowsy ? 1.2 : 4);
    const b = bob.current;

    /*
     * Menace, built from posture rather than from anything unkind.
     *
     * A chasing guardian rears up, pitches forward and pounds -- bigger,
     * lower and faster than the thing that was pottering about a second ago
     * -- and throws its wings or pincers wide. The brief is emphatic that
     * nothing in this game hurts anybody, so the scare has to come from
     * presence and commitment, the way a cross goose is frightening without
     * ever being a threat.
     */
    menace.current = MathUtils.damp(menace.current, chasing ? 1 : 0, 7, dt);
    const m = menace.current;
    g.scale.setScalar(1 + m * 0.16);
    rig.body.position.y = rig.bodyBaseY + (moving ? Math.abs(Math.sin(b)) * 0.06 : 0);

    // A drowsy guardian visibly slumps; a chasing one drives forward.
    const pitch = drowsy ? -0.18 : m * rig.lean;
    rig.body.rotation.x = MathUtils.damp(rig.body.rotation.x, pitch, 6, dt);

    if (rig.head !== null) {
      /*
       * Head down and thrust out: half of what makes a charge read as a
       * charge. On patrol the head nods once a step, which is the whole of
       * how a bird walks as far as anyone watching is concerned.
       */
      const nod = moving && !chasing ? Math.sin(b * 2) * 0.1 : 0;
      const droop = drowsy ? 0.5 : 0;
      rig.head.rotation.x = MathUtils.damp(
        rig.head.rotation.x,
        m * rig.charge + nod + droop,
        9,
        dt,
      );
      rig.head.position.z = rig.headBaseZ + m * rig.thrust;
    }

    for (let i = 0; i < rig.legs.length; i++) {
      const leg = rig.legs[i];
      if (leg === undefined) continue;
      const offset = i % 2 === 0 ? 0 : Math.PI;
      const step = Math.sin(b + offset);
      if (rig.gait === 'stride') {
        // Longer stride under pursuit, so the gait matches the speed.
        leg.rotation.x = moving ? step * (0.42 + m * 0.4) : 0;
      } else {
        // Scuttle: each set of four lifts and swings while the other plants.
        leg.position.y = rig.bodyBaseY + (moving ? Math.max(0, step) * 0.06 : 0);
        leg.rotation.y = moving ? step * (0.1 + m * 0.08) : 0;
      }
    }

    for (let i = 0; i < rig.arms.length; i++) {
      const arm = rig.arms[i];
      if (arm === undefined) continue;
      const side = i === 0 ? -1 : 1;
      if (rig.armStyle === 'wing') {
        // Wings thrown open and beating on the stride. Folded otherwise.
        const beat = Math.sin(b) * rig.armBeat;
        arm.rotation.z = MathUtils.damp(arm.rotation.z, side * m * (rig.armSpread + beat), 12, dt);
      } else {
        // Pincers up and open, swaying either side of the face.
        arm.rotation.x = MathUtils.damp(arm.rotation.x, -m * 0.38, 8, dt);
        arm.rotation.y = side * (m * rig.armSpread + Math.sin(b + side) * (0.04 + m * rig.armBeat));
      }
    }

    /*
     * Eyeshine follows the guardian's mood: a dim watchful glow on patrol,
     * brighter when it has noticed something, blazing -- bright enough to
     * bloom -- when it is coming for you, and dark when it is asleep, which
     * is the signal that the berries worked. A slow ramp, never a flash.
     */
    shine.current = MathUtils.damp(shine.current, EYESHINE[state], 5, dt);
    rig.eyeMaterial.color.copy(rig.glowColour).multiplyScalar(shine.current);

    if (rig.tail !== null) {
      // Curls further over the back as it charges, and never stops swaying.
      rig.tail.rotation.x = MathUtils.damp(
        rig.tail.rotation.x,
        m * 0.28 + Math.sin(b * 0.5) * 0.06,
        6,
        dt,
      );
    }

    const camera = _state.camera.position;
    const toCamera = Math.hypot(camera.x - instance.position.x, camera.z - instance.position.z);

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
      coneMaterial.uniforms.uOpacity!.value = 0.12 + instance.alertness * 0.26;
    }

    // Swap the thought bubble as the state changes. Shape, never colour.
    if (icon.current !== null) {
      const wanted = STATE_ICON[state];
      for (const child of icon.current.children) {
        child.visible = child.name === wanted;
      }
    }
  });

  const coneLength = visionRange;
  const coneRadius = Math.tan((visionConeDegrees * Math.PI) / 360) * coneLength;

  return (
    <group ref={root}>
      <primitive object={rig.root} />

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
        <primitive object={coneMaterial} attach="material" />
      </mesh>

      {/*
        Every icon is mounted and hidden rather than swapped, so changing
        state costs a visibility flag instead of a React reconcile -- this
        component never re-renders after mount.
      */}
      <StateIcons ref={icon} height={(rig.height + 0.35) * scale} instance={instance} />
      {/* coneRadius is derived for callers that want to lay out a HUD blip. */}
      <group visible={false} userData={{ coneRadius }} />
    </group>
  );
}

/** Eyeshine brightness per state. Above about 1.5 it blooms. */
const EYESHINE: Record<GuardianState, number> = {
  patrol: 1.4,
  alert: 2.6,
  investigate: 2.6,
  chase: 5,
  giveUp: 1.6,
  cooldown: 1.2,
  drowsy: 0,
};

const CONE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CONE_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  // 0 at the guardian, 1 at the limit of its sight.
  float r = length(vUv * 2.0 - 1.0);
  float fade = 1.0 - smoothstep(0.3, 1.0, r);
  gl_FragColor = vec4(uColour, uOpacity * fade);
}
`;

/** Beyond this, a vision cone costs overdraw and tells the player nothing. */
const CONE_DRAW_DISTANCE = 34;

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
