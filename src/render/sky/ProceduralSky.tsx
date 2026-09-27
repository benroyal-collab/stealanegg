/**
 * The sky, and the environment lighting that comes from it.
 *
 * A Preetham-style analytic sky is evaluated in a shader on a large inverted
 * sphere. The same sphere is then rendered once into a cube camera and
 * PMREM-filtered to produce the scene's environment map, so image-based
 * lighting and the visible sky are guaranteed to agree -- no HDRI file, no
 * download, and a biome's whole mood is a handful of numbers in `biomes.ts`.
 *
 * Baked once per biome, not per frame. It costs a few milliseconds at load
 * and nothing thereafter.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  Color,
  CubeCamera,
  Mesh,
  PMREMGenerator,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLCubeRenderTarget,
  HalfFloatType,
  LinearFilter,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { BiomeLighting } from '../../data/biomes';

const SKY_VERTEX = /* glsl */ `
varying vec3 vWorldDirection;
void main() {
  vWorldDirection = normalize((modelMatrix * vec4(position, 1.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w; // keep the dome on the far plane
}
`;

/**
 * Rayleigh scattering for the blue, Mie for the haze around the sun, plus a
 * ground bounce term below the horizon so the lower hemisphere of the
 * environment map isn't black. Output is linear HDR: tone mapping happens
 * once, at the end of the post chain, as it should.
 */
const SKY_FRAGMENT = /* glsl */ `
varying vec3 vWorldDirection;

uniform vec3 uSunDirection;
uniform vec3 uSkyTint;
uniform vec3 uHorizonTint;
uniform vec3 uGroundTint;
uniform float uTurbidity;
uniform float uRayleigh;
uniform float uMieCoefficient;
uniform float uMieG;
uniform float uSunIntensity;
uniform float uStars;

const float PI = 3.141592653589793;

float rayleighPhase(float cosTheta) {
  return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
}

float miePhase(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * PI * pow(max(denom, 0.0001), 1.5));
}

void main() {
  vec3 dir = normalize(vWorldDirection);
  float up = dir.y;
  float cosTheta = dot(dir, uSunDirection);

  // Optical depth grows sharply towards the horizon.
  float zenith = max(up, 0.0);
  float opticalDepth = 1.0 / (zenith + 0.15 * pow(93.885 - degrees(acos(clamp(zenith, -1.0, 1.0))), -1.253));

  float rayleigh = rayleighPhase(cosTheta) * uRayleigh;
  float mie = miePhase(cosTheta, uMieG) * uMieCoefficient * uTurbidity;

  vec3 sky = mix(uHorizonTint, uSkyTint, pow(clamp(up * 1.25 + 0.05, 0.0, 1.0), 0.55));
  sky *= (0.55 + rayleigh * 0.9) * (1.0 + opticalDepth * 0.02);
  sky += uSunTintFromMie(mie);

  /*
   * The moon. Every biome is played at night, so the light source in the
   * sky is a moon: drawn larger than life, the way films frame it, with a
   * crisp edge for bloom to catch and a mottled face so it reads as a moon
   * rather than a lamp.
   */
  // About three degrees across: large, as film frames it, but short of the
  // first draft's six, which filled a corner of the Dunes sky.
  float moonDisc = smoothstep(0.99955, 0.99966, cosTheta);
  float maria = 0.72 + 0.28 * skyNoise(dir * 90.0);
  vec3 sun = uSunColour * moonDisc * maria * uSunIntensity * 9.0;

  /*
   * Stars, hashed onto a fine grid over the dome. Static on purpose: a
   * twinkle is a flicker, and nothing in this game flickers. They fade out
   * towards the horizon, where the fog and the haze would hide them.
   */
  vec3 cell = dir * 170.0;
  float h = skyHash(floor(cell));
  float point = smoothstep(0.42, 0.0, length(fract(cell) - 0.5));
  float star = step(0.9968, h) * point * smoothstep(0.02, 0.3, up) * (1.0 - moonDisc);
  vec3 stars = vec3(0.86, 0.9, 1.0) * star * uStars * (0.5 + 2.5 * fract(h * 791.0));
  sky += stars;

  // Ground bounce, so image-based lighting has a floor colour.
  float below = smoothstep(0.0, -0.28, up);
  vec3 ground = uGroundTint * (0.28 + 0.25 * max(cosTheta, 0.0));

  vec3 colour = mix(sky + sun, ground, below);
  gl_FragColor = vec4(max(colour, vec3(0.0)), 1.0);
}
`;

// Injected above main() -- keeps the Mie tint expression readable in context.
const SKY_HELPERS = /* glsl */ `
uniform vec3 uSunColour;
vec3 uSunTintFromMie(float mie) {
  return uSunColour * mie * 2.4;
}
float skyHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float skyNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(skyHash(i), skyHash(i + vec3(1, 0, 0)), f.x),
        mix(skyHash(i + vec3(0, 1, 0)), skyHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(skyHash(i + vec3(0, 0, 1)), skyHash(i + vec3(1, 0, 1)), f.x),
        mix(skyHash(i + vec3(0, 1, 1)), skyHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

function buildSkyMaterial(lighting: BiomeLighting, sunDirection: Vector3): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fragmentShader: SKY_FRAGMENT.replace(
      'varying vec3 vWorldDirection;',
      `varying vec3 vWorldDirection;\n${SKY_HELPERS}`,
    ),
    vertexShader: SKY_VERTEX,
    uniforms: {
      uSunDirection: { value: sunDirection.clone() },
      uSunColour: { value: hexVec(lighting.sunColour) },
      uSkyTint: { value: hexVec(lighting.skyTint) },
      uHorizonTint: { value: hexVec(lighting.horizonTint) },
      uGroundTint: { value: hexVec(lighting.groundTint) },
      uTurbidity: { value: lighting.turbidity },
      uRayleigh: { value: lighting.rayleigh },
      uMieCoefficient: { value: lighting.mieCoefficient },
      uMieG: { value: lighting.mieDirectionalG },
      uSunIntensity: { value: lighting.sunIntensity },
      uStars: { value: lighting.stars },
    },
  });
}

/** Hex colour to a linear-space vec3 uniform. */
function hexVec(hex: string): Vector3 {
  const c = new Color(hex).convertSRGBToLinear();
  return new Vector3(c.r, c.g, c.b);
}

export function sunDirectionFor(lighting: BiomeLighting): Vector3 {
  const elevation = (lighting.sunElevation * Math.PI) / 180;
  const azimuth = (lighting.sunAzimuth * Math.PI) / 180;
  return new Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  ).normalize();
}

export interface ProceduralSkyProps {
  lighting: BiomeLighting;
  /** Cube resolution for the environment bake. Scales with quality preset. */
  envResolution: number;
  /** The sun mesh is the light source the god-ray pass samples. */
  onSunMesh?: (mesh: Mesh | null) => void;
  worldRadius: number;
}

export function ProceduralSky({
  lighting,
  envResolution,
  onSunMesh,
  worldRadius,
}: ProceduralSkyProps): React.ReactElement {
  const sunMesh = useRef<Mesh>(null);
  const sunDirection = useMemo(() => sunDirectionFor(lighting), [lighting]);
  const material = useMemo(
    () => buildSkyMaterial(lighting, sunDirection),
    [lighting, sunDirection],
  );
  const geometry = useMemo(() => new SphereGeometry(1, 32, 20), []);

  useEffect(() => {
    return () => {
      material.dispose();
      geometry.dispose();
    };
  }, [material, geometry]);

  useEffect(() => {
    onSunMesh?.(sunMesh.current);
    return () => onSunMesh?.(null);
  }, [onSunMesh]);

  const skyRadius = worldRadius * 4;
  const sunDistance = worldRadius * 3.2;

  return (
    <group>
      <mesh geometry={geometry} material={material} scale={skyRadius} frustumCulled={false} />
      <EnvironmentBake material={material} resolution={envResolution} />
      {/*
        A small emissive sphere sitting where the sun is. It exists so the
        god-ray pass has something to occlude; it is far enough out that the
        player can never reach it.
      */}
      <mesh
        ref={sunMesh}
        position={[
          sunDirection.x * sunDistance,
          sunDirection.y * sunDistance,
          sunDirection.z * sunDistance,
        ]}
      >
        <sphereGeometry args={[worldRadius * 0.09, 20, 16]} />
        <meshBasicMaterial color={lighting.sunColour} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Renders the sky dome once into a cube target and hands the PMREM result to
 * the scene as `scene.environment`.
 *
 * `frames` is one on purpose. Re-baking a static sky every frame is the
 * single most expensive mistake available in this file.
 */
function EnvironmentBake({
  material,
  resolution,
}: {
  material: ShaderMaterial;
  resolution: number;
}): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const baked = useRef(false);

  useEffect(() => {
    baked.current = false;
  }, [material, resolution]);

  useFrame((state) => {
    if (baked.current) return;
    baked.current = true;
    bakeEnvironment(state.gl, state.scene, material, resolution);
  });

  useEffect(() => {
    const currentScene = scene;
    const currentGl = gl;
    return () => {
      const env = currentScene.environment;
      currentScene.environment = null;
      env?.dispose();
      void currentGl;
    };
  }, [scene, gl]);

  return null;
}

function bakeEnvironment(
  renderer: WebGLRenderer,
  scene: Scene,
  material: ShaderMaterial,
  resolution: number,
): void {
  const target = new WebGLCubeRenderTarget(resolution, {
    type: HalfFloatType,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  });
  const cubeCamera = new CubeCamera(0.1, 10, target);

  // A private scene containing only the dome, so nothing else leaks into the
  // lighting -- an environment map that contains the player is a strange bug
  // to debug later.
  const domeGeometry = new SphereGeometry(1, 32, 20);
  const dome = new Mesh(domeGeometry, material);
  dome.scale.setScalar(5);
  dome.frustumCulled = false;

  const captureScene = scene.clone(false);
  captureScene.background = null;
  captureScene.environment = null;
  captureScene.add(dome);

  cubeCamera.update(renderer, captureScene);

  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const envMap = pmrem.fromCubemap(target.texture);

  scene.environment = envMap.texture;

  pmrem.dispose();
  target.dispose();
  domeGeometry.dispose();
}
