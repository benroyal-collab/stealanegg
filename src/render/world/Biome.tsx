/**
 * A biome, assembled.
 *
 * Terrain, sky, sun, water, foliage, props. Everything reads from the biome
 * definition in `src/data/biomes.ts`, which is what makes the three of them
 * genuinely different places rather than three tints of one place: the
 * heightfield shape, the sun angle, the fog, the plant mix and the palette
 * are all data, not code.
 */

import { useEffect, useMemo, useState } from 'react';
import { Color, FogExp2, type Mesh } from 'three';
import { useThree } from '@react-three/fiber';
import { BIOME_DEFS } from '../../data/biomes';
import type { BiomeId } from '../../sim/types';
import type { QualitySettings } from '../quality';
import { SunRig } from '../lighting/SunRig';
import { ProceduralSky, sunDirectionFor } from '../sky/ProceduralSky';
import { FoliageField } from './Foliage';
import { FoliageColliders } from './FoliageColliders';
import { Terrain } from './Terrain';
import { Water } from './Water';
import { generateTerrain, sampleHeight, type TerrainField } from './terrain';
import { hashString } from '../../sim/rng';

export interface BiomeProps {
  biome: BiomeId;
  quality: QualitySettings;
  reducedMotion: boolean;
  onSunMesh?: (mesh: Mesh | null) => void;
  onField?: (field: TerrainField) => void;
  /** Circles kept clear of foliage: the sanctuary, nests, walkways. */
  exclusions?: readonly { x: number; z: number; radius: number }[];
}

export function useTerrainField(biome: BiomeId): TerrainField {
  return useMemo(() => {
    const def = BIOME_DEFS[biome];
    return generateTerrain(def.terrain, hashString(biome));
  }, [biome]);
}

export function Biome({
  biome,
  quality,
  reducedMotion,
  onSunMesh,
  onField,
  exclusions = [],
}: BiomeProps): React.ReactElement {
  const def = BIOME_DEFS[biome];
  const field = useTerrainField(biome);
  const scene = useThree((s) => s.scene);
  const [sunMesh, setSunMesh] = useState<Mesh | null>(null);

  useEffect(() => {
    onField?.(field);
  }, [field, onField]);

  useEffect(() => {
    onSunMesh?.(sunMesh);
  }, [sunMesh, onSunMesh]);

  // Exponential fog rather than linear: it never produces the hard "wall of
  // fog" edge that linear fog shows on a long sightline, and it is what makes
  // Mirrormere's mist read as depth instead of a curtain.
  useEffect(() => {
    const previous = scene.fog;
    const previousBackground = scene.background;
    scene.fog = new FogExp2(new Color(def.lighting.fogColour).getHex(), def.lighting.fogDensity);
    scene.background = null;
    return () => {
      scene.fog = previous;
      scene.background = previousBackground;
    };
  }, [scene, def]);

  const sunDirection = useMemo(() => sunDirectionFor(def.lighting), [def.lighting]);
  const worldRadius = def.terrain.size * 0.75;

  return (
    <group>
      <ProceduralSky
        lighting={def.lighting}
        envResolution={quality.envResolution}
        onSunMesh={setSunMesh}
        worldRadius={worldRadius}
      />
      <SunRig lighting={def.lighting} quality={quality} />
      <Terrain field={field} config={def.terrain} detail={quality.terrainDetailSampler} />
      {def.terrain.waterLevel !== null ? (
        <Water
          level={def.terrain.waterLevel}
          size={def.terrain.size}
          shallowColour={def.terrain.waterColourShallow}
          deepColour={def.terrain.waterColourDeep}
          skyColour={def.lighting.skyTint}
          sunColour={def.lighting.sunColour}
          sunDirection={sunDirection}
          reflections={quality.waterReflections}
        />
      ) : null}
      <FoliageField
        layers={def.foliage}
        field={field}
        seed={hashString(`${biome}-foliage`)}
        density={quality.foliageDensity}
        drawDistance={quality.foliageDrawDistance}
        reducedMotion={reducedMotion}
        exclusions={exclusions}
      />
      {/*
        Colliders for the solid layers only. Density is pinned to 1 rather
        than following the quality preset: a tree you can walk through on Low
        and not on High would be a different *game*, not a prettier one.
      */}
      <FoliageColliders
        layers={def.foliage}
        field={field}
        seed={hashString(`${biome}-foliage`)}
        density={1}
        exclusions={exclusions}
      />
    </group>
  );
}

/** Ground height at a point, for placing anything that stands on the terrain. */
export function groundAt(field: TerrainField, x: number, z: number): number {
  return sampleHeight(field, x, z);
}
