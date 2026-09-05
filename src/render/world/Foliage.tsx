/**
 * Instanced foliage.
 *
 * One draw call per layer per biome. Every plant of a kind shares a geometry
 * and a material; position, scale, rotation and colour ride in instance
 * attributes. That is the difference between seven thousand grass clumps
 * costing one draw call and costing seven thousand.
 *
 * Three shader features, all in one injected chunk:
 *
 * - **Vertex wind.** Bends from the root using `aHeight`, with a per-instance
 *   phase so no two plants sway together, plus a low-frequency gust term that
 *   sweeps across the field.
 * - **Alpha hashing, not alpha blending.** Blended foliage needs back-to-front
 *   sorting it will never get with instancing, and produces halos through
 *   depth-of-field. Hashed alpha writes depth properly and resolves in TAA/SMAA.
 * - **Distance fade.** Instances dissolve out via the same hash rather than
 *   popping, and the fragment is discarded entirely past the draw distance so
 *   far foliage costs nothing but a vertex.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  DoubleSide,
  FrontSide,
  InstancedBufferAttribute,
  MeshStandardMaterial,
  Object3D,
  type IUniform,
  type InstancedMesh,
} from 'three';
import type { FoliageLayer } from '../../data/biomes';
import { hash2D } from '../materials/noise';
import {
  barkNormal,
  foliageAlpha,
  microNormal,
  roughnessMap,
} from '../materials/proceduralTextures';
import { foliageGeometry, type FoliageKind } from './foliageGeometry';
import { isWalkable, sampleHeight, sampleSlope, type TerrainField } from './terrain';

interface CompileShader {
  uniforms: Record<string, IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

/**
 * One wind clock for every foliage layer in the scene.
 *
 * Module scope rather than a ref per layer, for two reasons: every layer has
 * to advance in lockstep or a gust visibly desynchronises between the grass
 * and the reeds standing in it, and a single shared uniform object is one
 * thing to update per frame instead of one per layer.
 */
const WIND_CLOCK: IUniform<number> = { value: 0 };

/** Advances the shared wind clock. Mounted once by FoliageField. */
function WindClock({ paused }: { paused: boolean }): null {
  useFrame((_state, delta) => {
    if (!paused) WIND_CLOCK.value += delta;
  });
  return null;
}

/** Leaf colours: the two ends of the per-instance variation ramp. */
const KIND_COLOURS: Record<FoliageKind, [string, string]> = {
  grass: ['#657f3c', '#9cb45e'],
  fern: ['#3f6b34', '#6f9448'],
  reed: ['#6e8548', '#a8b46c'],
  birch: ['#6f9440', '#a8c266'],
  pine: ['#2f5236', '#4c7042'],
  palm: ['#4f7c3e', '#84a458'],
  cactus: ['#4a7c50', '#78a05c'],
  rock: ['#7a736a', '#9a938a'],
  ruin: ['#9a8a70', '#b8a88c'],
};

/**
 * Wood colours, applied to the `aPart == 0` half of a tree.
 *
 * Birch bark being near-white against dark leaves is the single strongest
 * silhouette cue Whisper Glade has, and it is the reason a stand of birches
 * reads at a glance from across the map.
 */
const WOOD_COLOURS: Partial<Record<FoliageKind, string>> = {
  birch: '#ddd8cc',
  pine: '#5c4634',
  palm: '#8a7050',
  cactus: '#4a7c50',
};

/** Trunks and rocks are solid; only leafy things get the hashed-alpha path. */
const CUTOUT_KINDS = new Set<FoliageKind>(['grass', 'fern', 'reed']);

export interface FoliageFieldProps {
  layers: readonly FoliageLayer[];
  field: TerrainField;
  seed: number;
  /** Instance-count multiplier from the quality preset. */
  density: number;
  drawDistance: number;
  reducedMotion: boolean;
  /** Keeps foliage out of the sanctuary and off the nests. */
  exclusions?: readonly { x: number; z: number; radius: number }[];
}

export function FoliageField({
  layers,
  field,
  seed,
  density,
  drawDistance,
  reducedMotion,
  exclusions = [],
}: FoliageFieldProps): React.ReactElement {
  return (
    <group>
      <WindClock paused={reducedMotion} />
      {layers.map((layer, i) => (
        <FoliageLayerMesh
          key={`${layer.kind}-${i}`}
          layer={layer}
          field={field}
          seed={seed + i * 977}
          density={density}
          drawDistance={drawDistance}
          reducedMotion={reducedMotion}
          exclusions={exclusions}
        />
      ))}
    </group>
  );
}

function FoliageLayerMesh({
  layer,
  field,
  seed,
  density,
  drawDistance,
  reducedMotion,
  exclusions,
}: {
  layer: FoliageLayer;
  field: TerrainField;
  seed: number;
  density: number;
  drawDistance: number;
  reducedMotion: boolean;
  exclusions: readonly { x: number; z: number; radius: number }[];
}): React.ReactElement | null {
  const mesh = useRef<InstancedMesh>(null);

  const placement = useMemo(
    () => scatter(layer, field, seed, density, exclusions),
    [layer, field, seed, density, exclusions],
  );

  /**
   * A clone of the cached geometry, carrying this layer's own instance
   * attributes. The cache hands out one geometry per kind and variant, so two
   * layers of the same kind would otherwise fight over `aPhase` and `aTint`.
   * A clone is a few kilobytes; the bug it prevents is grass wearing a rock's
   * colours.
   */
  const geometry = useMemo(() => {
    const geo = foliageGeometry(layer.kind, seed % 3).clone();
    geo.setAttribute('aPhase', new InstancedBufferAttribute(placement.phase, 1));
    geo.setAttribute('aTint', new InstancedBufferAttribute(placement.tint, 3));
    return geo;
  }, [layer.kind, seed, placement]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  const material = useMemo(() => {
    const cutout = CUTOUT_KINDS.has(layer.kind);
    const woody = layer.kind === 'birch' || layer.kind === 'pine' || layer.kind === 'palm';

    const mat = new MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
      metalness: 0,
      side: cutout ? DoubleSide : FrontSide,
      // The cutout map is what turns a quad into blades. Without it every
      // grass instance renders as a solid rectangle and a meadow looks like
      // scattered paper.
      ...(cutout ? { map: foliageAlpha(layer.kind as 'grass' | 'fern' | 'reed') } : {}),
      normalMap: woody ? barkNormal() : microNormal(),
      roughnessMap: roughnessMap(`foliage-${layer.kind}`, cutout ? 0.78 : 0.86, 0.14),
      // Alpha testing, never alpha blending: blended foliage needs a
      // back-to-front sort it will never get from an instanced draw, and it
      // haloes through depth of field.
      alphaTest: cutout ? 0.42 : 0,
      transparent: false,
    });
    mat.normalScale.set(0.4, 0.4);

    mat.onBeforeCompile = (shader: CompileShader) => {
      shader.uniforms.uTime = WIND_CLOCK;
      shader.uniforms.uWind = { value: reducedMotion ? 0 : layer.windStrength };
      shader.uniforms.uDrawDistance = { value: drawDistance };
      shader.uniforms.uFadeBand = { value: Math.max(6, drawDistance * 0.18) };
      shader.uniforms.uWood = { value: new Color(WOOD_COLOURS[layer.kind] ?? '#8a7a66') };
      shader.uniforms.uHasWood = { value: WOOD_COLOURS[layer.kind] === undefined ? 0 : 1 };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aHeight;
           attribute float aPart;
           attribute float aPhase;
           attribute vec3 aTint;
           uniform float uTime;
           uniform float uWind;
           varying vec3 vTint;
           varying float vPart;
           varying float vCameraDistance;
           varying float vDither;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vTint = aTint;
           vPart = aPart;
           vDither = fract(aPhase * 71.317);

           // Only leaves move. A trunk that sways is instantly wrong.
           if (uWind > 0.0 && aPart > 0.5) {
             // Bend from the root: displacement scales with the square of
             // height so the base stays planted and the tip does the moving.
             float stiffness = aHeight * aHeight;
             float sway = sin(uTime * 1.7 + aPhase * 6.2831) * 0.5
                        + sin(uTime * 2.9 + aPhase * 12.566) * 0.25;
             // A slow travelling gust, so the whole field breathes together
             // on top of the per-plant jitter.
             float gust = sin(uTime * 0.31 + (modelMatrix * vec4(transformed, 1.0)).x * 0.05) * 0.5 + 0.5;
             float amount = uWind * stiffness * (0.35 + gust * 0.65);
             transformed.x += sway * amount * 0.22;
             transformed.z += cos(uTime * 1.3 + aPhase * 6.2831) * amount * 0.16;
             // Foreshorten slightly while bent, so it hinges instead of stretching.
             transformed.y -= abs(sway) * amount * 0.04;
           }`,
        )
        .replace(
          '#include <fog_vertex>',
          `#include <fog_vertex>
           vCameraDistance = length(mvPosition.xyz);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uDrawDistance;
           uniform float uFadeBand;
           uniform vec3 uWood;
           uniform float uHasWood;
           varying vec3 vTint;
           varying float vPart;
           varying float vCameraDistance;
           varying float vDither;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           // Wood and leaf are one mesh and one draw call, separated here.
           vec3 foliageColour = mix(uWood, vTint, uHasWood > 0.5 ? step(0.5, vPart) : 1.0);
           diffuseColor.rgb *= foliageColour;

           // Hashed dissolve instead of a pop. The per-instance hash is
           // stable, so an instance fades out smoothly as you walk away
           // rather than flickering frame to frame.
           float fade = 1.0 - smoothstep(uDrawDistance - uFadeBand, uDrawDistance, vCameraDistance);
           if (fade < vDither) discard;`,
        );
    };
    mat.customProgramCacheKey = () => `foliage-${layer.kind}-${reducedMotion ? 'still' : 'wind'}`;
    return mat;
  }, [layer.kind, layer.windStrength, drawDistance, reducedMotion]);

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  useEffect(() => {
    const instanced = mesh.current;
    if (instanced === null || placement.count === 0) return;

    const dummy = new Object3D();
    for (let i = 0; i < placement.count; i++) {
      dummy.position.set(placement.x[i]!, placement.y[i]!, placement.z[i]!);
      dummy.rotation.set(placement.tiltX[i]!, placement.rotY[i]!, placement.tiltZ[i]!);
      dummy.scale.setScalar(placement.scale[i]!);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    instanced.count = placement.count;
    instanced.computeBoundingSphere();
  }, [placement]);

  if (placement.count === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, placement.count]}
      castShadow={layer.kind !== 'grass'}
      receiveShadow
      frustumCulled={false}
    />
  );
}

interface Placement {
  count: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  rotY: Float32Array;
  tiltX: Float32Array;
  tiltZ: Float32Array;
  scale: Float32Array;
  phase: Float32Array;
  tint: Float32Array;
}

/**
 * Scatter one layer over the terrain.
 *
 * Rejection sampling against the layer's height and slope masks. Points that
 * fail are dropped rather than nudged: nudging piles plants up along the edge
 * of every mask, which is instantly readable as procedural.
 */
function scatter(
  layer: FoliageLayer,
  field: TerrainField,
  seed: number,
  density: number,
  exclusions: readonly { x: number; z: number; radius: number }[],
): Placement {
  const target = Math.max(0, Math.round(layer.count * density));
  const half = field.size / 2 - 2;

  const x = new Float32Array(target);
  const y = new Float32Array(target);
  const z = new Float32Array(target);
  const rotY = new Float32Array(target);
  const tiltX = new Float32Array(target);
  const tiltZ = new Float32Array(target);
  const scale = new Float32Array(target);
  const phase = new Float32Array(target);
  const tint = new Float32Array(target * 3);

  const [darkHex, lightHex] = KIND_COLOURS[layer.kind];
  const dark = new Color(darkHex);
  const light = new Color(lightHex);
  const mixed = new Color();

  let placed = 0;
  // Bounded attempts: a mask that rejects nearly everything must not spin.
  const maxAttempts = target * 8;

  for (let attempt = 0; attempt < maxAttempts && placed < target; attempt++) {
    const px = (hash2D(attempt, seed, 1) * 2 - 1) * half;
    const pz = (hash2D(attempt, seed, 2) * 2 - 1) * half;

    const h = sampleHeight(field, px, pz);
    if (h < layer.minHeight || h > layer.maxHeight) continue;
    if (sampleSlope(field, px, pz) > layer.maxSlope) continue;

    // Reeds are the exception: they want to stand in the shallows.
    if (layer.kind !== 'reed' && !isWalkable(field, px, pz, layer.maxSlope)) continue;
    if (field.waterLevel !== null && layer.kind === 'reed' && h > field.waterLevel + 1.2) continue;

    let excluded = false;
    for (const zone of exclusions) {
      if (Math.hypot(px - zone.x, pz - zone.z) < zone.radius) {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    x[placed] = px;
    y[placed] = h;
    z[placed] = pz;
    rotY[placed] = hash2D(attempt, seed, 3) * Math.PI * 2;
    // A degree or two off vertical. Perfectly upright plants look printed on.
    tiltX[placed] = (hash2D(attempt, seed, 4) - 0.5) * 0.12;
    tiltZ[placed] = (hash2D(attempt, seed, 5) - 0.5) * 0.12;
    scale[placed] = layer.minScale + hash2D(attempt, seed, 6) * (layer.maxScale - layer.minScale);
    phase[placed] = hash2D(attempt, seed, 7);

    mixed.copy(dark).lerp(light, hash2D(attempt, seed, 8));
    // Per-instance colour variance, so a field is a hundred greens not one.
    const jitter = 1 + (hash2D(attempt, seed, 9) - 0.5) * layer.colourVariance * 2;
    tint[placed * 3] = mixed.r * jitter;
    tint[placed * 3 + 1] = mixed.g * jitter;
    tint[placed * 3 + 2] = mixed.b * jitter;

    placed += 1;
  }

  return {
    count: placed,
    x,
    y,
    z,
    rotY,
    tiltX,
    tiltZ,
    scale,
    phase: phase.slice(0, placed),
    tint: tint.slice(0, placed * 3),
  };
}
