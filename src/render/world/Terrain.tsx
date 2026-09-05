/**
 * The terrain mesh and its collider.
 *
 * Geometry comes from the shared `TerrainField`, so the visible surface and
 * the physics heightfield are the same numbers. The material is a standard
 * PBR material with a triplanar splat injected via onBeforeCompile: three
 * ground tiles blended by altitude, plus a cliff tile blended by slope,
 * sampled on world XZ (and XY/ZY on steep faces) so nothing stretches.
 */

import { HeightfieldCollider, RigidBody } from '@react-three/rapier';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  Color,
  MeshStandardMaterial,
  PlaneGeometry,
  type IUniform,
  type Mesh,
} from 'three';
import type { BiomeTerrain } from '../../data/biomes';
import { groundAlbedo, microNormal, roughnessMap } from '../materials/proceduralTextures';
import { NOISE_GLSL } from '../materials/noise';
import type { TerrainField } from './terrain';

export interface TerrainProps {
  field: TerrainField;
  config: BiomeTerrain;
  /** Turns off the detail sampler on the low preset. */
  detail: boolean;
}

export function Terrain({ field, config, detail }: TerrainProps): React.ReactElement {
  const mesh = useRef<Mesh>(null);

  const geometry = useMemo(() => {
    const n = field.resolution;
    const geo = new PlaneGeometry(field.size, field.size, n, n);
    geo.rotateX(-Math.PI / 2);

    const position = geo.attributes.position as BufferAttribute;
    const count = position.count;
    const width = n + 1;

    for (let i = 0; i < count; i++) {
      // PlaneGeometry runs +x then -z after the rotation, which matches the
      // field's row-major order once the row index is flipped.
      const col = i % width;
      const row = Math.floor(i / width);
      position.setY(i, field.heights[row * width + col] ?? 0);
    }
    position.needsUpdate = true;
    geo.computeVertexNormals();

    // Per-vertex altitude and slope, so the shader can splat without needing
    // to re-derive either.
    const splat = new Float32Array(count * 2);
    const normal = geo.attributes.normal as BufferAttribute;
    const range = Math.max(0.001, field.maxHeight - field.minHeight);
    for (let i = 0; i < count; i++) {
      splat[i * 2] = (position.getY(i) - field.minHeight) / range;
      splat[i * 2 + 1] = 1 - Math.abs(normal.getY(i));
    }
    geo.setAttribute('aSplat', new BufferAttribute(splat, 2));

    return geo;
  }, [field]);

  /**
   * Heightfield rows for Rapier.
   *
   * Rapier wants column-major over (rows+1)*(cols+1) with the grid centred on
   * the body, which is a different traversal order from the render geometry.
   * Getting this wrong produces a collider silently rotated 90 degrees from
   * the thing you can see, so it is worth the explicit transpose.
   */
  const colliderHeights = useMemo(() => {
    const n = field.resolution + 1;
    const out = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        out[i * n + j] = field.heights[j * n + i] ?? 0;
      }
    }
    return Array.from(out);
  }, [field]);

  const material = useMemo(() => {
    const lowTex = groundAlbedo(
      `${config.groundColourLow}-${config.groundColourMid}`,
      config.groundColourLow,
      config.groundColourMid,
    );
    const highTex = groundAlbedo(
      `${config.groundColourMid}-${config.groundColourHigh}`,
      config.groundColourMid,
      config.groundColourHigh,
    );
    const cliffTex = groundAlbedo(
      `${config.cliffColour}-cliff`,
      config.cliffColour,
      config.groundColourHigh,
    );

    const mat = new MeshStandardMaterial({
      map: lowTex,
      normalMap: microNormal(),
      roughnessMap: roughnessMap('terrain', 0.86, 0.16),
      roughness: 1,
      metalness: 0,
      dithering: true,
    });
    mat.normalScale.set(0.55, 0.55);

    // three no longer exports a Shader type for onBeforeCompile; this is the
    // shape it actually passes.
    interface CompileShader {
      uniforms: Record<string, IUniform>;
      vertexShader: string;
      fragmentShader: string;
    }

    mat.onBeforeCompile = (shader: CompileShader) => {
      shader.uniforms.uHighMap = { value: highTex };
      shader.uniforms.uCliffMap = { value: cliffTex };
      // One tile every 2.6 metres. At 1/9 the texels were nine metres across
      // and the ground read as a flat painted plane from any playing distance.
      shader.uniforms.uTileScale = { value: 1 / 2.6 };
      shader.uniforms.uDetailScale = { value: detail ? 1 / 1.6 : 0 };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute vec2 aSplat;
           varying vec2 vSplat;
           varying vec3 vWorldPos;
           varying vec3 vWorldNormal;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
           vSplat = aSplat;
           vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
           vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           ${NOISE_GLSL}
           uniform sampler2D uHighMap;
           uniform sampler2D uCliffMap;
           uniform float uTileScale;
           uniform float uDetailScale;
           varying vec2 vSplat;
           varying vec3 vWorldPos;
           varying vec3 vWorldNormal;

           // Triplanar: project on all three axes and blend by the normal, so
           // cliff faces get the same texel density as flat ground instead of
           // smearing a top-down projection down a wall.
           vec4 ehTriplanar(sampler2D tex, vec3 pos, vec3 nrm, float scale) {
             vec3 blend = pow(abs(nrm), vec3(4.0));
             blend /= max(blend.x + blend.y + blend.z, 0.0001);
             vec4 xa = texture2D(tex, pos.yz * scale);
             vec4 ya = texture2D(tex, pos.xz * scale);
             vec4 za = texture2D(tex, pos.xy * scale);
             return xa * blend.x + ya * blend.y + za * blend.z;
           }`,
        )
        .replace(
          '#include <map_fragment>',
          `vec3 nrm = normalize(vWorldNormal);
           vec4 lowSample = ehTriplanar(map, vWorldPos, nrm, uTileScale);
           vec4 highSample = ehTriplanar(uHighMap, vWorldPos, nrm, uTileScale);
           vec4 cliffSample = ehTriplanar(uCliffMap, vWorldPos, nrm, uTileScale * 1.7);

           // Altitude blend, with a noisy boundary so the transition never
           // reads as a contour line on a map.
           float altitudeNoise = ehFbm(vWorldPos.xz * 0.06, 3) * 0.22 - 0.11;
           float altitude = smoothstep(0.25, 0.72, vSplat.x + altitudeNoise);
           vec4 ground = mix(lowSample, highSample, altitude);

           float slope = smoothstep(0.28, 0.58, vSplat.y);
           vec4 blended = mix(ground, cliffSample, slope);

           if (uDetailScale > 0.0) {
             // A second octave of the same tile at a different scale breaks up
             // the obvious repeat without a second texture.
             vec4 detailSample = ehTriplanar(map, vWorldPos, nrm, uTileScale * 4.3);
             blended.rgb = mix(blended.rgb, blended.rgb * detailSample.rgb * 2.0, 0.28);
           }

           diffuseColor *= blended;`,
        );
    };
    mat.customProgramCacheKey = () => `terrain-${config.groundColourLow}-${detail ? 1 : 0}`;
    return mat;
  }, [config, detail]);

  useLayoutEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <group>
      <mesh ref={mesh} geometry={geometry} material={material} receiveShadow castShadow />
      <RigidBody type="fixed" colliders={false} userData={{ tag: 'terrain' }}>
        <HeightfieldCollider
          args={[
            field.resolution,
            field.resolution,
            colliderHeights,
            { x: field.size, y: 1, z: field.size },
          ]}
        />
      </RigidBody>
    </group>
  );
}

/** Ambient tint the sky and fog are matched against. */
export function terrainAverageColour(config: BiomeTerrain): Color {
  const a = new Color(config.groundColourLow);
  const b = new Color(config.groundColourMid);
  return a.lerp(b, 0.5);
}
