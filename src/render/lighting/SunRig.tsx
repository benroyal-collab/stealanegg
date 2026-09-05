/**
 * Sun, cascaded shadow maps and ambient fill.
 *
 * Three cascades, refitted to the camera frustum every frame by our own CSM
 * (see `cascadedShadows.ts` for why it is ours and not three-stdlib's).
 *
 * The bias values were tuned against the two failure modes that matter and
 * are visible in a still: peter-panning, where the shadow detaches from the
 * object's feet because depth bias is too high, and acne, the self-shadow
 * stipple on lit surfaces when it is too low. Normal bias does most of the
 * work here -- it offsets along the surface normal rather than in depth --
 * which lets the depth bias stay small enough that contact shadows survive.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Material, Mesh, Object3D } from 'three';
import type { BiomeLighting } from '../../data/biomes';
import type { QualitySettings } from '../quality';
import { sunDirectionFor } from '../sky/ProceduralSky';
import { CascadedShadowMap } from './cascadedShadows';

export interface SunRigProps {
  lighting: BiomeLighting;
  quality: QualitySettings;
}

export function SunRig({ lighting, quality }: SunRigProps): React.ReactElement {
  const scene = useThree((s) => s.scene);
  const csmRef = useRef<CascadedShadowMap | null>(null);

  useEffect(() => {
    // The sun's direction is where light travels *to*, which is the opposite
    // of the direction to the sun in the sky.
    const direction = sunDirectionFor(lighting).multiplyScalar(-1);

    const csm = new CascadedShadowMap(scene, {
      cascades: quality.shadowCascades,
      shadowMapSize: quality.shadowMapSize,
      maxDistance: quality.shadowDistance,
      direction,
      colour: lighting.sunColour,
      intensity: lighting.sunIntensity,
      lightMargin: 40,
      lambda: 0.55,
      // Small depth bias, because normal bias is carrying the load.
      bias: -0.00018,
      // In world units. Enough to kill acne on the terrain's long slopes,
      // small enough that a creature's feet stay attached to its shadow.
      normalBias: 0.035,
      radius: quality.level === 'low' ? 1 : 2,
    });

    csmRef.current = csm;
    return () => {
      csm.dispose();
      csmRef.current = null;
    };
  }, [scene, lighting, quality]);

  useFrame((state) => {
    const csm = csmRef.current;
    if (csm === null) return;

    // Materials keep arriving as foliage, creatures and props stream in, so
    // walk the scene each frame. setupMaterial is idempotent and guarded by a
    // WeakSet, so this costs a traversal and nothing else.
    scene.traverse((object: Object3D) => {
      const mesh = object as Mesh;
      const material = mesh.material;
      if (material === undefined || material === null) return;
      const list: Material[] = Array.isArray(material) ? material : [material];
      for (const entry of list) {
        if ('isMeshStandardMaterial' in entry) csm.setupMaterial(entry);
      }
    });

    csm.update(state.camera);
  });

  return (
    /*
      Hemisphere fill standing in for bounce light. The environment map does
      most of the ambient work; this keeps shadowed sides from going flat and
      lets each biome tint its own shadows -- cool blue under the birches,
      warm sand-bounce in the dunes.
    */
    <hemisphereLight args={[lighting.skyTint, lighting.groundTint, lighting.ambientIntensity]} />
  );
}
