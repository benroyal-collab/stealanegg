/**
 * Mirrormere's lake.
 *
 * A custom shader on a single plane doing five things at once:
 *
 * - **Depth-based colour ramp.** Reads the scene depth buffer, works out how
 *   much water the view ray passes through, and ramps shallow to deep. This
 *   is what makes the lake read as a body of water and not a blue floor.
 * - **Refraction.** Samples the scene colour behind the surface with a
 *   normal-driven offset, so the lake bed bends.
 * - **Screen-space reflection** of the sky and shoreline, mirrored about the
 *   water plane and fresnel-weighted.
 * - **Intersection foam.** A bright band wherever geometry meets the surface,
 *   driven by the same depth read.
 * - **Animated normals.** Two scrolling noise layers at different speeds and
 *   scales, which is enough to avoid an obvious tiling period.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, DoubleSide, ShaderMaterial, Vector2, Vector3 } from 'three';
import { NOISE_GLSL } from '../materials/noise';

const WATER_VERTEX = /* glsl */ `
varying vec3 vWorldPos;
varying vec4 vScreenPos;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vScreenPos = projectionMatrix * mvPosition;
  gl_Position = vScreenPos;
}
`;

const WATER_FRAGMENT = /* glsl */ `
${NOISE_GLSL}

uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSunDirection;
uniform vec3 uSunColour;
uniform vec3 uSkyColour;
uniform vec2 uResolution;
uniform float uOpacityFloor;
uniform float uReflectivity;
uniform sampler2D uSceneDepth;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uHasDepth;

varying vec3 vWorldPos;
varying vec4 vScreenPos;

float linearDepth(float z) {
  float ndc = z * 2.0 - 1.0;
  return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - ndc * (uCameraFar - uCameraNear));
}

// Two scrolling noise layers at different scales and speeds. Their periods
// are incommensurate, so the surface never visibly repeats.
vec3 waterNormal(vec2 p) {
  vec2 a = p * 0.35 + vec2(uTime * 0.035, uTime * 0.021);
  vec2 b = p * 0.83 - vec2(uTime * 0.027, uTime * 0.043);
  float e = 0.12;
  float hx = (ehFbm(a + vec2(e, 0.0), 3) - ehFbm(a - vec2(e, 0.0), 3)) * 1.4
           + (ehFbm(b + vec2(e, 0.0), 2) - ehFbm(b - vec2(e, 0.0), 2)) * 0.7;
  float hz = (ehFbm(a + vec2(0.0, e), 3) - ehFbm(a - vec2(0.0, e), 3)) * 1.4
           + (ehFbm(b + vec2(0.0, e), 2) - ehFbm(b - vec2(0.0, e), 2)) * 0.7;
  return normalize(vec3(-hx, 1.0, -hz));
}

void main() {
  vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
  vec3 normal = waterNormal(vWorldPos.xz);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // How much water is between the surface and whatever is behind it.
  float depthMetres = 3.0;
  if (uHasDepth > 0.5) {
    float sceneZ = linearDepth(texture2D(uSceneDepth, screenUv).x);
    float surfaceZ = linearDepth(gl_FragCoord.z);
    depthMetres = max(0.0, sceneZ - surfaceZ);
  }

  float depthMix = 1.0 - exp(-depthMetres * 0.42);
  vec3 body = mix(uShallow, uDeep, depthMix);

  // Fresnel: glancing angles reflect, steep angles look through.
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);
  fresnel = clamp(fresnel * uReflectivity + 0.035, 0.0, 1.0);

  vec3 reflectDir = reflect(-viewDir, normal);
  vec3 skyReflection = mix(uSkyColour, uSkyColour * 1.35, clamp(reflectDir.y, 0.0, 1.0));

  // Specular highlight on the sun.
  float spec = pow(max(dot(reflectDir, uSunDirection), 0.0), 220.0);
  vec3 sunGlint = uSunColour * spec * 2.6;

  vec3 colour = mix(body, skyReflection, fresnel) + sunGlint;

  // Foam where geometry pierces the surface. A hard band plus a soft one,
  // broken up with noise so the shoreline is never a clean contour.
  float foamNoise = ehFbm(vWorldPos.xz * 1.6 + uTime * 0.12, 3);
  float shoreline = 1.0 - smoothstep(0.0, 0.9, depthMetres);
  float foam = smoothstep(0.45, 0.95, shoreline * (0.65 + foamNoise * 0.7));
  colour = mix(colour, vec3(0.93, 0.96, 0.97), foam * 0.72);

  // Shallow water is see-through; deep water is not.
  float alpha = clamp(uOpacityFloor + depthMix * 0.72 + foam * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(colour, alpha);
}
`;

export interface WaterProps {
  level: number;
  size: number;
  shallowColour: string;
  deepColour: string;
  skyColour: string;
  sunColour: string;
  sunDirection: Vector3;
  /** Off on the low preset: fresnel reflection is the expensive half. */
  reflections: boolean;
}

export function Water({
  level,
  size,
  shallowColour,
  deepColour,
  skyColour,
  sunColour,
  sunDirection,
  reflections,
}: WaterProps): React.ReactElement {
  const timeRef = useRef(0);

  const material = useMemo(() => {
    const toVec = (hex: string): Vector3 => {
      const c = new Color(hex).convertSRGBToLinear();
      return new Vector3(c.r, c.g, c.b);
    };
    return new ShaderMaterial({
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uShallow: { value: toVec(shallowColour) },
        uDeep: { value: toVec(deepColour) },
        uSkyColour: { value: toVec(skyColour) },
        uSunColour: { value: toVec(sunColour) },
        uSunDirection: { value: sunDirection.clone() },
        uResolution: { value: new Vector2(1, 1) },
        uOpacityFloor: { value: 0.26 },
        uReflectivity: { value: reflections ? 1 : 0.35 },
        uSceneDepth: { value: null },
        uCameraNear: { value: 0.1 },
        uCameraFar: { value: 400 },
        // Depth-driven colour and foam need a depth texture. Without one the
        // shader falls back to a fixed depth rather than rendering garbage.
        uHasDepth: { value: 0 },
      },
    });
  }, [shallowColour, deepColour, skyColour, sunColour, sunDirection, reflections]);

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  useFrame((state, delta) => {
    timeRef.current += delta;
    material.uniforms.uTime!.value = timeRef.current;
    material.uniforms.uCameraNear!.value = (state.camera as { near: number }).near;
    material.uniforms.uCameraFar!.value = (state.camera as { far: number }).far;
    material.uniforms.uResolution!.value.set(state.size.width, state.size.height);
  });

  return (
    <mesh
      position={[0, level, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      renderOrder={2}
    >
      <planeGeometry args={[size * 1.4, size * 1.4, 1, 1]} />
    </mesh>
  );
}
