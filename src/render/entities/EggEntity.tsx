/**
 * An egg, in a nest or in the player's hands.
 *
 * The mutation is a real material variant, not a tint: Golden is metal,
 * Frosted has a subsurface wrap and an ice normal, Storm animates emissive
 * arcs, Prism uses thin-film iridescence. That is the whole point of the
 * mutation system -- a child has to be able to tell a Prism from a Golden
 * from across the clearing, before reading a single word of UI.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, MeshPhysicalMaterial, type Group, type IUniform, type Mesh } from 'three';
import { MUTATION_DEFS } from '../../data/mutations';
import { hashString } from '../../sim/rng';
import { requireSpecies } from '../../data/creatures';
import type { EggRoll } from '../../sim/types';
import {
  brushedNormal,
  iceNormal,
  microNormal,
  shellAlbedo,
} from '../materials/proceduralTextures';
import { eggGeometry } from './eggMesh';

interface CompileShader {
  uniforms: Record<string, IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

/** Shared clock for the Storm arcs, so every stormy egg pulses together. */
const ARC_CLOCK: IUniform<number> = { value: 0 };

/** Stable per-egg bob offset, so neighbouring eggs are not in lockstep. */
function hashPhase(...parts: string[]): number {
  return (hashString(parts.join(':')) / 4294967296) * Math.PI * 2;
}

export interface EggEntityProps {
  roll: EggRoll;
  position: [number, number, number];
  /** Nest eggs bob and turn; a carried egg is held still. */
  idle?: boolean;
  /** Highlight ring shown when the player is close enough to grab. */
  highlighted?: boolean;
}

export function useEggMaterial(roll: EggRoll): MeshPhysicalMaterial {
  return useMemo(() => {
    const species = requireSpecies(roll.speciesId);
    const mutation = MUTATION_DEFS[roll.mutation];
    const [primary, secondary, accent] = species.body.palette;

    const material = new MeshPhysicalMaterial({
      map: shellAlbedo(species.body.shellPattern, primary, accent),
      normalMap:
        mutation.material.detailNormal === 'ice'
          ? iceNormal()
          : mutation.material.detailNormal === 'brushed'
            ? brushedNormal()
            : microNormal(),
      color: new Color(mutation.material.tint),
      // Metalness is 0 or 1 and nothing between, which is what physically
      // based means. Golden is metal; everything else is a dielectric shell.
      metalness: mutation.material.metalness,
      roughness: mutation.material.roughness,
      clearcoat: mutation.material.clearcoat,
      clearcoatRoughness: 0.18,
      iridescence: mutation.material.iridescence,
      iridescenceIOR: mutation.material.iridescenceIOR,
      iridescenceThicknessRange: [120, 520],
      emissive: new Color(mutation.material.emissive),
      emissiveIntensity: mutation.material.emissiveIntensity,
      // A fake subsurface wrap. Real transmission would be lovely and far too
      // expensive for something there can be a dozen of on screen.
      sheen: mutation.material.subsurface,
      sheenColor: new Color(secondary),
      sheenRoughness: 0.5,
    });
    material.normalScale.set(0.7, 0.7);

    if (mutation.material.arcs) {
      material.onBeforeCompile = (shader: CompileShader) => {
        shader.uniforms.uArcTime = ARC_CLOCK;
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
             uniform float uArcTime;`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
             // Thin crawling filaments rather than a pulse. Deliberately
             // slow: nothing in this game may flash above 3Hz.
             float arcBand = sin(vMapUv.y * 34.0 + uArcTime * 2.1)
                           * sin(vMapUv.x * 21.0 - uArcTime * 1.3);
             float arc = smoothstep(0.82, 0.99, abs(arcBand));
             totalEmissiveRadiance += vec3(0.45, 0.38, 1.0) * arc * 2.2;`,
          );
      };
      material.customProgramCacheKey = () => 'egg-storm';
    }

    return material;
  }, [roll]);
}

/** Advances the shared arc clock. Mounted once per scene. */
export function EggArcClock(): null {
  useFrame((_state, delta) => {
    ARC_CLOCK.value += delta;
  });
  return null;
}

export function EggEntity({
  roll,
  position,
  idle = true,
  highlighted = false,
}: EggEntityProps): React.ReactElement {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const material = useEggMaterial(roll);
  const geometry = useMemo(() => eggGeometry(roll.rarity, roll.size), [roll.rarity, roll.size]);
  // Seeded from the roll rather than Math.random: calling an impure function
  // during render is a real hazard under concurrent rendering, and this way
  // an egg's bob phase is stable across remounts instead of jumping.
  const phase = useRef(hashPhase(roll.speciesId, roll.mutation, roll.size));

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  useFrame((state, delta) => {
    const g = group.current;
    if (g === null) return;
    if (idle) {
      phase.current += delta;
      // A slow turn and a small bob, so an egg in a nest catches the light and
      // reads as a thing worth walking over to.
      g.rotation.y += delta * 0.45;
      g.position.y = position[1] + Math.sin(phase.current * 1.2) * 0.035;
    }
    if (ring.current !== null) {
      ring.current.visible = highlighted;
      if (highlighted) ring.current.rotation.z = state.clock.elapsedTime * 0.9;
    }
  });

  return (
    <group ref={group} position={position}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {/*
        Grab prompt ring. A shape, not just a colour change -- rarity and
        interactability must never be signalled by colour alone.
      */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 0]} visible={false}>
        <ringGeometry args={[0.32, 0.4, 5]} />
        <meshBasicMaterial color="#ffe9b0" transparent opacity={0.85} toneMapped={false} />
      </mesh>
    </group>
  );
}
