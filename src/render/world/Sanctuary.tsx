/**
 * The sanctuary: incubator, habitats, training track, shop hut.
 *
 * Everything here is diegetic. There is no "shop menu button" -- you walk up
 * to the hut. There is no "incubate" command -- you carry the egg to the
 * incubator and put it down. An eight year old should be able to work out
 * what every building does by looking at it, which is why each one has a
 * distinct silhouette and a big icon on a signboard.
 */

import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type BufferGeometry,
  type Group,
} from 'three';
import { WORLD } from '../../data/balance';
import type { OwnedCreature } from '../../sim/types';
import { requireSpecies } from '../../data/creatures';
import { eggGeometry } from '../entities/eggMesh';
import { useEggMaterial } from '../entities/EggEntity';
import type { EggInIncubator } from '../../sim/types';
import { CreatureInHabitat } from '../entities/CreatureInHabitat';
import {
  INCUBATOR_NEST_Y,
  SIGN_HEIGHT,
  cabinWindowGlow,
  hutWindowGlow,
  LANTERN_ANGLES,
  LANTERN_RING,
  lanternGeometry,
  breedingGeometry,
  guideGeometry,
  incubatorGeometry,
  penGeometry,
  storeGeometry,
  trackGeometry,
} from './stationMesh';
import { iconBadgeTexture } from '../materials/iconTexture';
import type { IconName } from '../../ui/iconPaths';
import { groundAlbedo, microNormal, roughnessMap } from '../materials/proceduralTextures';

/** The visible clearing is the safe zone the sim enforces; one number for both. */
export const SANCTUARY_RADIUS = WORLD.sanctuaryRadius;

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
   * The biome's trodden-earth colour, `terrain.pathColour`.
   *
   * A trodden clearing is the ground with the surface worn off it, so it
   * should look like what is *under* the grass. Three wrong answers were
   * tried first: one fixed brown, which read as a patch pasted onto the
   * Dunes' pale sand; the biome's own surface colour darkened, which made
   * Whisper Glade's clearing dark green so it vanished into the lawn; and
   * the cliff colour darkened, which was right in hue but came out the grey
   * of tarmac under a low warm sun.
   */
  soil: string;
  incubator: EggInIncubator | null;
  creatures: readonly OwnedCreature[];
  habitatSlots: number;
  /** Highlighted station, so the player can see what pressing Grab will do. */
  activeStation: StationId | null;
}

import { STATIONS, type StationId } from './stationLayout';

export { SPAWN_CORRIDOR_HALF_WIDTH, STATIONS, type Station, type StationId } from './stationLayout';

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
    // A gentle spread either side of the path colour, so it is mottled
    // rather than painted.
    const albedo = groundAlbedo(`sanctuary-${soil}`, shade(soil, 0.88), shade(soil, 1.08));
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

  /*
   * Every building shares one material; colour rides on the vertices. The
   * geometries are built once per visit and shared -- all the pens use the
   * same one.
   */
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        roughnessMap: roughnessMap('station', 0.9, 0.1, 128),
      }),
    [],
  );
  const geometries = useMemo(
    () => ({
      incubator: incubatorGeometry(),
      store: storeGeometry(),
      guide: guideGeometry(),
      breeding: breedingGeometry(),
      track: trackGeometry(),
      pen: penGeometry(),
      lanterns: lanternGeometry(),
      cabinWindow: cabinWindowGlow(),
      hutWindow: hutWindowGlow(),
    }),
    [],
  );
  /*
   * Lamplight: lantern glass and lit windows. Unlit and brighter than one,
   * so the bloom pass gives each a halo -- the warm points that say "home"
   * from the dark edge of the wood.
   */
  const lamplight = useMemo(
    () => new MeshBasicMaterial({ vertexColors: true, color: new Color(2.6, 2.6, 2.6) }),
    [],
  );
  useEffect(
    () => () => {
      material.dispose();
      lamplight.dispose();
      const { incubator: inc, lanterns, ...rest } = geometries;
      inc.body.dispose();
      inc.glow.dispose();
      lanterns.body.dispose();
      lanterns.glow.dispose();
      for (const geometry of Object.values(rest)) geometry.dispose();
    },
    [material, lamplight, geometries],
  );

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
        geometry={geometries.incubator}
        material={material}
      />
      <Building
        position={STATIONS[1]!.position}
        geometry={geometries.store}
        material={material}
        icon="shop"
        signHeight={SIGN_HEIGHT.shop}
        highlighted={activeStation === 'shop'}
      >
        <CuboidCollider args={[1.0, 1.0, 0.62]} position={[0, 1.0, 0.05]} />
        <CuboidCollider args={[1.42, 0.3, 0.24]} position={[0, 0.3, 0.42]} />
      </Building>
      <Building
        position={STATIONS[2]!.position}
        geometry={geometries.guide}
        material={material}
        icon="guide"
        signHeight={SIGN_HEIGHT.guide}
        highlighted={activeStation === 'guide'}
        glow={geometries.cabinWindow}
        glowMaterial={lamplight}
      >
        <CuboidCollider args={[0.95, 0.9, 0.9]} position={[0, 0.9, 0]} />
      </Building>
      <Building
        position={STATIONS[3]!.position}
        geometry={geometries.breeding}
        material={material}
        icon="breeding"
        signHeight={SIGN_HEIGHT.breeding}
        highlighted={activeStation === 'breeding'}
        glow={geometries.hutWindow}
        glowMaterial={lamplight}
      >
        <CylinderCollider args={[0.7, 0.92]} position={[0, 0.7, 0]} />
      </Building>
      <Building
        position={STATIONS[4]!.position}
        geometry={geometries.track}
        material={material}
        icon="track"
        signHeight={SIGN_HEIGHT.track}
        highlighted={activeStation === 'track'}
      >
        <CuboidCollider args={[1.0, 0.3, 0.5]} position={[0, 0.3, 0]} />
      </Building>

      {/*
        The lantern ring and the one warm light that fills the clearing.

        The wilderness is lit by the moon and your torch and nothing else;
        home is lit like home. That contrast is the design: the safe zone is
        also the warm zone, and a child running back through the dark can
        see exactly where safety starts. One point light, no shadows -- a
        second shadow-casting light would cost another pass over the scene.
      */}
      <RigidBody type="fixed" colliders={false}>
        {LANTERN_ANGLES.map((angle) => (
          <CylinderCollider
            key={angle}
            args={[1.15, 0.1]}
            position={[Math.sin(angle) * LANTERN_RING, 1.15, Math.cos(angle) * LANTERN_RING]}
          />
        ))}
      </RigidBody>
      <mesh geometry={geometries.lanterns.body} material={material} castShadow receiveShadow />
      <mesh geometry={geometries.lanterns.glow} material={lamplight} />
      <pointLight
        position={[0, 3.4, 0]}
        color="#ffb46a"
        intensity={38}
        distance={SANCTUARY_RADIUS + 7}
        decay={1.2}
      />

      {habitatPositions.map((position, slot) => {
        const occupant = creatures.find((c) => c.slot === slot) ?? null;
        return (
          <Habitat
            key={slot}
            position={position}
            occupant={occupant}
            geometry={geometries.pen}
            material={material}
          />
        );
      })}
    </group>
  );
}

/** Turn a building at this position to face the middle of the clearing. */
function facingCentre(position: readonly [number, number, number]): number {
  return Math.atan2(-position[0], -position[2]);
}

function Incubator({
  position,
  contents,
  highlighted,
  geometry,
  material,
}: {
  position: readonly [number, number, number];
  contents: EggInIncubator | null;
  highlighted: boolean;
  geometry: { body: BufferGeometry; glow: BufferGeometry };
  material: MeshStandardMaterial;
}): React.ReactElement {
  const eggGroup = useRef<Group>(null);

  // The nest lining and the lamp bulb share a warm emissive that rises as
  // the egg gets closer to hatching.
  const glowMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        emissive: '#ff8a3a',
        emissiveIntensity: 0.2,
        roughness: 0.6,
      }),
    [],
  );
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial]);

  const ready = contents !== null && contents.remaining <= 0;
  const progress = contents === null ? 0 : 1 - contents.remaining / Math.max(contents.total, 0.001);

  useFrame((state, delta) => {
    // Warmth rises as the egg gets closer to hatching. Slow on purpose:
    // nothing in this game pulses fast enough to bother anyone.
    const target =
      0.2 + progress * 1.4 + (ready ? Math.sin(state.clock.elapsedTime * 1.6) * 0.3 : 0);
    glowMaterial.emissiveIntensity = MathUtils.damp(
      glowMaterial.emissiveIntensity,
      target,
      4,
      delta,
    );
    if (eggGroup.current !== null && contents !== null) {
      // A wobble that grows as it gets close. This is the anticipation.
      const wobble = Math.sin(state.clock.elapsedTime * (2 + progress * 5)) * 0.06 * progress;
      eggGroup.current.rotation.z = wobble;
      eggGroup.current.position.y = EGG_REST_Y + Math.abs(wobble) * 0.4;
    }
  });

  return (
    <group position={[position[0], position[1], position[2]]}>
      {/*
        Unrotated, unlike the other stations: the incubator sits beside the
        walk to the first nest, and a box turned to face the centre would
        swing a corner into that lane.
      */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.75, 0.45, 0.6]} position={[0, 0.45, 0]} />
      </RigidBody>

      <group rotation={[0, facingCentre(position), 0]}>
        <mesh geometry={geometry.body} material={material} castShadow receiveShadow />
        <mesh geometry={geometry.glow} material={glowMaterial} />
      </group>

      {contents !== null ? (
        <group ref={eggGroup} position={[0, EGG_REST_Y, 0]}>
          <IncubatorEgg contents={contents} />
        </group>
      ) : null}

      <Signboard icon="incubator" highlighted={highlighted} height={SIGN_HEIGHT.incubator} />
    </group>
  );
}

/** Where a waiting egg sits: its centre, half an egg above the nest lining. */
const EGG_REST_Y = INCUBATOR_NEST_Y + 0.16;

function IncubatorEgg({ contents }: { contents: EggInIncubator }): React.ReactElement {
  const material = useEggMaterial(contents.roll);
  const geometry = useMemo(
    () => eggGeometry(contents.roll.rarity, contents.roll.size),
    [contents.roll.rarity, contents.roll.size],
  );
  return <mesh geometry={geometry} material={material} castShadow />;
}

/**
 * One station building, turned to face the centre, with its colliders and a
 * sign. The colliders are children so they turn with the building.
 */
function Building({
  position,
  geometry,
  material,
  icon,
  signHeight,
  highlighted,
  glow,
  glowMaterial,
  children,
}: {
  position: readonly [number, number, number];
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  icon: IconName;
  signHeight: number;
  highlighted: boolean;
  /** Lit windows, if the building has any. */
  glow?: BufferGeometry;
  glowMaterial?: MeshBasicMaterial;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <group position={[position[0], position[1], position[2]]}>
      <group rotation={[0, facingCentre(position), 0]}>
        <RigidBody type="fixed" colliders={false}>
          {children}
        </RigidBody>
        <mesh geometry={geometry} material={material} castShadow receiveShadow />
        {glow !== undefined && glowMaterial !== undefined ? (
          <mesh geometry={glow} material={glowMaterial} />
        ) : null}
      </group>
      <Signboard icon={icon} highlighted={highlighted} height={signHeight} />
    </group>
  );
}

function Habitat({
  position,
  occupant,
  geometry,
  material,
}: {
  position: [number, number, number];
  occupant: OwnedCreature | null;
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
}): React.ReactElement {
  return (
    <group position={position}>
      {/* The gate faces the centre, so every pen opens onto the clearing. */}
      <group rotation={[0, facingCentre(position), 0]}>
        <mesh geometry={geometry} material={material} castShadow receiveShadow />
      </group>

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
 * A round sign carrying the station's icon -- the same picture the HUD uses
 * for the same place, so a child learns one from the other.
 *
 * Reading age eight means every station is labelled with a picture first and
 * a word second, and the word only appears once the player is close enough
 * for the HUD prompt to show. The sign grows when the station is the one
 * that pressing Grab would use.
 */
function Signboard({
  icon,
  highlighted,
  height,
}: {
  icon: IconName;
  highlighted: boolean;
  height: number;
}): React.ReactElement {
  const board = useRef<Group>(null);
  const texture = useMemo(() => iconBadgeTexture(icon), [icon]);
  useFrame((state, delta) => {
    if (board.current === null) return;
    const target = highlighted ? 1.2 : 1;
    board.current.scale.setScalar(MathUtils.damp(board.current.scale.x, target, 10, delta));
    board.current.quaternion.copy(state.camera.quaternion);
  });

  return (
    <group ref={board} position={[0, height, 0]}>
      <mesh>
        <planeGeometry args={[0.78, 0.78]} />
        <meshBasicMaterial
          map={texture}
          transparent
          alphaTest={0.5}
          color={highlighted ? '#ffffff' : '#e2dccb'}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
