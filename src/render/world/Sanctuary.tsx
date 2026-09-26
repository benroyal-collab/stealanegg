/**
 * The sanctuary: incubator, habitats, training track, shop hut.
 *
 * Everything here is diegetic. There is no "shop menu button" -- you walk up
 * to the hut. There is no "incubate" command -- you carry the egg to the
 * incubator and put it down. An eight year old should be able to work out
 * what every building does by looking at it, which is why each one has a
 * distinct silhouette and a big icon on a signboard.
 */

import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, MeshStandardMaterial, type Group, type Mesh } from 'three';
import { EGG, WORLD } from '../../data/balance';
import type { OwnedCreature } from '../../sim/types';
import { requireSpecies } from '../../data/creatures';
import { eggGeometry } from '../entities/eggMesh';
import { useEggMaterial } from '../entities/EggEntity';
import type { EggInIncubator } from '../../sim/types';
import { CreatureInHabitat } from '../entities/CreatureInHabitat';
import { fenceGeometry } from './fenceGeometry';
import { groundAlbedo, microNormal, roughnessMap } from '../materials/proceduralTextures';

export const SANCTUARY_RADIUS = 11;

/** Multiply a hex colour's channels, for "the same earth but walked on". */
function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number): number =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

export interface SanctuaryProps {
  groundY: number;
  /**
   * The biome's exposed-soil colour -- its `cliffColour`, not its surface.
   *
   * A trodden clearing is the ground with the surface worn off it, so it
   * should look like what is *under* the grass. Two wrong answers were tried
   * first: one fixed brown, which read as a patch pasted onto the Dunes' pale
   * sand; then the biome's own surface colour darkened, which made Whisper
   * Glade's clearing dark green and it vanished into the lawn entirely -- the
   * sanctuary stopped reading as somewhere people are.
   *
   * The soil colour gives brown earth under the Glade's grass, grey-green
   * under Mirrormere's, and warm sand in the Dunes, which is right in all
   * three.
   */
  soil: string;
  incubator: EggInIncubator | null;
  creatures: readonly OwnedCreature[];
  habitatSlots: number;
  /** Highlighted station, so the player can see what pressing Grab will do. */
  activeStation: StationId | null;
}

export type StationId = 'incubator' | 'shop' | 'guide' | 'breeding' | 'track';

export interface Station {
  readonly id: StationId;
  readonly position: readonly [number, number, number];
  readonly label: string;
  readonly radius: number;
}

/**
 * The clear lane between the spawn and the tutorial nest.
 *
 * Nest zero is placed straight ahead of the spawn in every biome (see
 * CLAUDE.md), which only helps if a child can actually walk that way. No
 * station may stand within this distance of the centre line.
 *
 * This is not hypothetical. The incubator used to sit at x=0, z=-1.5,
 * described in its own comment as being placed there "so a child carrying
 * their first egg home walks straight into it". They did walk straight into
 * it -- on the way *out*, at z=-0.55, where its collider stopped them dead. A
 * cold start could not reach the first nest at all.
 */
export const SPAWN_CORRIDOR_HALF_WIDTH = WORLD.spawnCorridorHalfWidth;

/**
 * Fixed layout, so a returning player finds everything where they left it.
 *
 * The incubator sits just off the path home with a deposit radius that
 * reaches it, so a child carrying their first egg gets the prompt without
 * having to aim. Interaction radii come from `EGG.depositRadius` rather than
 * being invented here.
 */
export const STATIONS: readonly Station[] = [
  { id: 'incubator', position: [-2.6, 0, -1.5], label: 'Incubator', radius: EGG.depositRadius },
  { id: 'shop', position: [5.6, 0, 2.4], label: 'Ranger Store', radius: EGG.depositRadius },
  { id: 'guide', position: [-5.6, 0, 2.4], label: 'Field Guide', radius: EGG.depositRadius },
  { id: 'breeding', position: [-4.4, 0, -3.6], label: 'Breeding Hut', radius: EGG.depositRadius },
  { id: 'track', position: [4.4, 0, -3.6], label: 'Training Track', radius: EGG.depositRadius },
];

export function Sanctuary({
  groundY,
  soil,
  incubator,
  creatures,
  habitatSlots,
  activeStation,
}: SanctuaryProps): React.ReactElement {
  /*
   * Trodden earth, textured rather than painted.
   *
   * Tiled tightly (repeat 9) because this surface is walked on at close
   * range: at the terrain's own scale a two-hundred square metre disc shows
   * about one texel of variation and looks exactly as flat as a solid fill.
   */
  const clearingMaterial = useMemo(() => {
    // Darker and a touch less saturated than the surrounding soil: the same
    // earth, walked on.
    const albedo = groundAlbedo(`sanctuary-${soil}`, shade(soil, 0.84), shade(soil, 1.1));
    albedo.repeat.set(9, 9);
    const rough = roughnessMap(`sanctuary-${soil}`, 0.94, 0.12);
    rough.repeat.set(9, 9);
    const normal = microNormal();
    normal.repeat.set(9, 9);
    const mat = new MeshStandardMaterial({
      map: albedo,
      normalMap: normal,
      roughnessMap: rough,
      roughness: 1,
      metalness: 0,
      dithering: true,
    });
    mat.normalScale.set(0.7, 0.7);
    return mat;
  }, [soil]);

  useEffect(() => () => clearingMaterial.dispose(), [clearingMaterial]);

  const habitatPositions = useMemo(() => {
    // A gentle arc in front of the sanctuary, so the collection is the first
    // thing you see when you come home with an egg.
    const out: [number, number, number][] = [];
    for (let i = 0; i < habitatSlots; i++) {
      const t = habitatSlots === 1 ? 0.5 : i / (habitatSlots - 1);
      const angle = Math.PI * (0.15 + t * 0.7);
      const radius = 7.4 + (i % 2) * 1.1;
      out.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
    }
    return out;
  }, [habitatSlots]);

  return (
    <group position={[0, groundY, 0]}>
      {/*
        A trodden clearing, so the ground reads as "somewhere people are".

        This was a single flat colour with no maps of any kind, and because
        foliage is excluded from the sanctuary it is also the largest bare
        surface in the game -- a couple of hundred square metres of unbroken
        #b39468 sitting in the middle of every screenshot. It is the single
        biggest reason the game read as unfinished. It now uses the same
        procedural albedo, normal and roughness the terrain does.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[SANCTUARY_RADIUS, 40]} />
        <primitive object={clearingMaterial} attach="material" />
      </mesh>
      {/* A soft edge, so the clearing does not end on a hard circle. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} receiveShadow>
        <ringGeometry args={[SANCTUARY_RADIUS - 1.4, SANCTUARY_RADIUS + 3.4, 44]} />
        <meshStandardMaterial
          color={shade(soil, 1.02)}
          roughness={0.97}
          transparent
          opacity={0.72}
        />
      </mesh>

      <Incubator
        position={STATIONS[0]!.position}
        contents={incubator}
        highlighted={activeStation === 'incubator'}
      />
      <Hut
        position={STATIONS[1]!.position}
        colour="#a8683c"
        icon="coin"
        highlighted={activeStation === 'shop'}
      />
      <Hut
        position={STATIONS[2]!.position}
        colour="#4c7ba8"
        icon="book"
        highlighted={activeStation === 'guide'}
      />
      <Hut
        position={STATIONS[3]!.position}
        colour="#7a5a9a"
        icon="fuse"
        highlighted={activeStation === 'breeding'}
      />
      <TrainingTrack position={STATIONS[4]!.position} highlighted={activeStation === 'track'} />

      {habitatPositions.map((position, slot) => {
        const occupant = creatures.find((c) => c.slot === slot) ?? null;
        return <Habitat key={slot} position={position} occupant={occupant} />;
      })}
    </group>
  );
}

function Incubator({
  position,
  contents,
  highlighted,
}: {
  position: readonly [number, number, number];
  contents: EggInIncubator | null;
  highlighted: boolean;
}): React.ReactElement {
  const glow = useRef<Mesh>(null);
  const eggGroup = useRef<Group>(null);

  const ready = contents !== null && contents.remaining <= 0;
  const progress = contents === null ? 0 : 1 - contents.remaining / Math.max(contents.total, 0.001);

  useFrame((state, delta) => {
    if (glow.current !== null) {
      const material = glow.current.material as { emissiveIntensity?: number };
      if (material.emissiveIntensity !== undefined) {
        // Warmth rises as the egg gets closer to hatching. Slow on purpose:
        // nothing in this game pulses fast enough to bother anyone.
        const target =
          0.2 + progress * 1.4 + (ready ? Math.sin(state.clock.elapsedTime * 1.6) * 0.3 : 0);
        material.emissiveIntensity = MathUtils.damp(material.emissiveIntensity, target, 4, delta);
      }
    }
    if (eggGroup.current !== null && contents !== null) {
      // A wobble that grows as it gets close. This is the anticipation.
      const wobble = Math.sin(state.clock.elapsedTime * (2 + progress * 5)) * 0.06 * progress;
      eggGroup.current.rotation.z = wobble;
      eggGroup.current.position.y = 0.72 + Math.abs(wobble) * 0.4;
    }
  });

  return (
    <group position={[position[0], position[1], position[2]]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.75, 0.45, 0.6]} position={[0, 0.45, 0]} />
      </RigidBody>

      {/* Warm stone base. */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.78, 0.9, 0.56, 10]} />
        <meshStandardMaterial color="#8a7a66" roughness={0.9} />
      </mesh>
      <mesh ref={glow} position={[0, 0.58, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.68, 0.14, 10]} />
        <meshStandardMaterial
          color="#c98a4a"
          emissive="#ff8a3a"
          emissiveIntensity={0.2}
          roughness={0.65}
        />
      </mesh>

      {contents !== null ? (
        <group ref={eggGroup} position={[0, 0.72, 0]}>
          <IncubatorEgg contents={contents} />
        </group>
      ) : null}

      <Signboard icon="egg-warm" highlighted={highlighted} height={1.5} />
    </group>
  );
}

function IncubatorEgg({ contents }: { contents: EggInIncubator }): React.ReactElement {
  const material = useEggMaterial(contents.roll);
  const geometry = useMemo(
    () => eggGeometry(contents.roll.rarity, contents.roll.size),
    [contents.roll.rarity, contents.roll.size],
  );
  return <mesh geometry={geometry} material={material} castShadow />;
}

function Hut({
  position,
  colour,
  icon,
  highlighted,
}: {
  position: readonly [number, number, number];
  colour: string;
  icon: string;
  highlighted: boolean;
}): React.ReactElement {
  return (
    <group position={[position[0], position[1], position[2]]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.95, 0.9, 0.95]} position={[0, 0.9, 0]} />
      </RigidBody>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.5, 1.8]} />
        <meshStandardMaterial color="#c4a882" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.72, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.55, 0.85, 4]} />
        <meshStandardMaterial color={colour} roughness={0.8} />
      </mesh>
      <Signboard icon={icon} highlighted={highlighted} height={2.5} />
    </group>
  );
}

function TrainingTrack({
  position,
  highlighted,
}: {
  position: readonly [number, number, number];
  highlighted: boolean;
}): React.ReactElement {
  return (
    <group position={[position[0], position[1], position[2]]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1.1, 0.3, 0.35]} position={[0, 0.3, 0]} />
      </RigidBody>
      {/* Two hurdles and a strip of track. Reads as "go faster" instantly. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.4, 1.2]} />
        <meshStandardMaterial color="#b06a4a" roughness={0.95} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.3, -0.35]} castShadow>
            <boxGeometry args={[0.07, 0.6, 0.07]} />
            <meshStandardMaterial color="#e8e2d4" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.3, 0.35]} castShadow>
            <boxGeometry args={[0.07, 0.6, 0.07]} />
            <meshStandardMaterial color="#e8e2d4" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.56, 0]} castShadow>
            <boxGeometry args={[0.06, 0.06, 0.78]} />
            <meshStandardMaterial color="#e8e2d4" roughness={0.7} />
          </mesh>
        </group>
      ))}
      <Signboard icon="boot-run" highlighted={highlighted} height={1.4} />
    </group>
  );
}

function Habitat({
  position,
  occupant,
}: {
  position: [number, number, number];
  occupant: OwnedCreature | null;
}): React.ReactElement {
  return (
    <group position={position}>
      {/*
        A low fence ring: six posts joined by a rail, baked into one shared
        geometry. See fenceGeometry.ts for why -- eight meshes a pen is four
        times the draw calls this needs.
      */}
      <mesh geometry={fenceGeometry()} castShadow receiveShadow>
        <meshStandardMaterial color="#8a7048" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.2, 18]} />
        <meshStandardMaterial color="#6f7f4a" roughness={0.95} />
      </mesh>

      {occupant !== null ? (
        <CreatureInHabitat
          body={requireSpecies(occupant.speciesId).body}
          mutation={occupant.mutation}
          size={occupant.size}
        />
      ) : null}
    </group>
  );
}

/**
 * A signboard with a shape on it.
 *
 * Reading age eight means every station is labelled with a picture first and
 * a word second, and the word only appears once the player is close enough
 * for the HUD prompt to show.
 */
function Signboard({
  icon,
  highlighted,
  height,
}: {
  icon: string;
  highlighted: boolean;
  height: number;
}): React.ReactElement {
  const board = useRef<Group>(null);
  useFrame((state, delta) => {
    if (board.current === null) return;
    const target = highlighted ? 1.18 : 1;
    board.current.scale.setScalar(MathUtils.damp(board.current.scale.x, target, 10, delta));
    board.current.quaternion.copy(state.camera.quaternion);
  });

  return (
    <group ref={board} position={[0, height, 0]}>
      <mesh>
        <circleGeometry args={[0.32, 20]} />
        <meshBasicMaterial color={highlighted ? '#fff3d0' : '#e0d6bc'} toneMapped={false} />
      </mesh>
      <StationIcon icon={icon} />
    </group>
  );
}

function StationIcon({ icon }: { icon: string }): React.ReactElement {
  const colour = '#3a3226';
  switch (icon) {
    case 'coin':
      return (
        <mesh position={[0, 0, 0.01]}>
          <ringGeometry args={[0.09, 0.17, 16]} />
          <meshBasicMaterial color={colour} toneMapped={false} />
        </mesh>
      );
    case 'book':
      return (
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[0.26, 0.2]} />
          <meshBasicMaterial color={colour} toneMapped={false} />
        </mesh>
      );
    case 'fuse':
      return (
        <group position={[0, 0, 0.01]}>
          {[-0.09, 0, 0.09].map((x, i) => (
            <mesh key={i} position={[x, i === 1 ? 0.06 : -0.04, 0]}>
              <circleGeometry args={[0.055, 12]} />
              <meshBasicMaterial color={colour} toneMapped={false} />
            </mesh>
          ))}
        </group>
      );
    case 'boot-run':
      return (
        <group position={[0, 0, 0.01]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[-0.12 + i * 0.12, -0.02 + i * 0.03, 0]}>
              <planeGeometry args={[0.07, 0.02]} />
              <meshBasicMaterial color={colour} toneMapped={false} />
            </mesh>
          ))}
        </group>
      );
    case 'egg-warm':
    default:
      return (
        <mesh position={[0, 0, 0.01]} scale={[0.75, 1, 1]}>
          <circleGeometry args={[0.15, 16]} />
          <meshBasicMaterial color={colour} toneMapped={false} />
        </mesh>
      );
  }
}
