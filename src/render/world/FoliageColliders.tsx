/**
 * Physics for the solid foliage.
 *
 * Instanced meshes are one draw call and zero colliders, which is exactly
 * right for grass and exactly wrong for a tree: without a collider a birch is
 * scenery you walk through and, worse, scenery a guardian can see straight
 * past. Cover that does not actually break the ray is the single most
 * frustrating thing a stealth game can do.
 *
 * So the chunky layers -- trunks, rocks, ruins, cacti -- get a real collider
 * each, and the soft layers do not. A few hundred capsules and cuboids is
 * nothing; a collider per grass blade would be tens of thousands.
 */

import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import type { FoliageLayer } from '../../data/biomes';
import { hash2D } from '../materials/noise';
import { isWalkable, sampleHeight, sampleSlope, type TerrainField } from './terrain';
import type { FoliageKind } from './foliageGeometry';
import { isExcluded, type ExclusionZone } from './exclusion';

/** Radius and half-height of the collider for each solid kind, at scale 1. */
const SOLID: Partial<
  Record<FoliageKind, { radius: number; halfHeight: number; kind: 'cylinder' | 'box' }>
> = {
  birch: { radius: 0.19, halfHeight: 2.6, kind: 'cylinder' },
  pine: { radius: 0.22, halfHeight: 2.2, kind: 'cylinder' },
  palm: { radius: 0.17, halfHeight: 2.3, kind: 'cylinder' },
  cactus: { radius: 0.24, halfHeight: 0.9, kind: 'cylinder' },
  rock: { radius: 0.8, halfHeight: 0.55, kind: 'box' },
  ruin: { radius: 0.75, halfHeight: 1.6, kind: 'box' },
};

export interface FoliageCollidersProps {
  layers: readonly FoliageLayer[];
  field: TerrainField;
  seed: number;
  density: number;
  exclusions: readonly ExclusionZone[];
}

export function FoliageColliders({
  layers,
  field,
  seed,
  density,
  exclusions,
}: FoliageCollidersProps): React.ReactElement {
  const bodies = useMemo(() => {
    const out: {
      key: string;
      x: number;
      y: number;
      z: number;
      scale: number;
      kind: FoliageKind;
    }[] = [];

    layers.forEach((layer, layerIndex) => {
      const shape = SOLID[layer.kind];
      if (shape === undefined) return;

      /*
       * This repeats the scatter from Foliage.tsx exactly -- same seed, same
       * rejection order, same attempt counter -- so collider N lands on
       * instance N. Two implementations of one placement is a maintenance
       * hazard, but the alternative is threading a placement buffer out of a
       * render component, and a mismatch here would be visible immediately
       * (colliders in mid-air) rather than silently.
       */
      const layerSeed = seed + layerIndex * 977;
      const target = Math.max(0, Math.round(layer.count * density));
      const half = field.size / 2 - 2;
      let placed = 0;

      for (let attempt = 0; attempt < target * 8 && placed < target; attempt++) {
        const px = (hash2D(attempt, layerSeed, 1) * 2 - 1) * half;
        const pz = (hash2D(attempt, layerSeed, 2) * 2 - 1) * half;

        const h = sampleHeight(field, px, pz);
        if (h < layer.minHeight || h > layer.maxHeight) continue;
        if (sampleSlope(field, px, pz) > layer.maxSlope) continue;
        if (layer.kind !== 'reed' && !isWalkable(field, px, pz, layer.maxSlope)) continue;

        if (isExcluded(layer.kind, px, pz, exclusions)) continue;

        const scale =
          layer.minScale + hash2D(attempt, layerSeed, 6) * (layer.maxScale - layer.minScale);
        out.push({
          key: `${layer.kind}-${layerIndex}-${placed}`,
          x: px,
          y: h,
          z: pz,
          scale,
          kind: layer.kind,
        });
        placed += 1;
      }
    });

    return out;
  }, [layers, field, seed, density, exclusions]);

  return (
    <RigidBody type="fixed" colliders={false} userData={{ tag: 'cover' }}>
      {bodies.map((body) => {
        const shape = SOLID[body.kind]!;
        const halfHeight = shape.halfHeight * body.scale;
        const radius = shape.radius * body.scale;
        return shape.kind === 'cylinder' ? (
          <CylinderCollider
            key={body.key}
            args={[halfHeight, radius]}
            position={[body.x, body.y + halfHeight, body.z]}
          />
        ) : (
          <CuboidCollider
            key={body.key}
            args={[radius, halfHeight, radius]}
            position={[body.x, body.y + halfHeight * 0.8, body.z]}
          />
        );
      })}
    </RigidBody>
  );
}
