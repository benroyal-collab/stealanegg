/**
 * The ranger's torch.
 *
 * Every biome is played at night, and this is how a child sees in it: a warm
 * cone thrown wherever the camera looks, so steering the view is steering
 * the light. It is the single strongest horror-film device available --
 * everything outside the beam is a guess -- and it costs one light.
 *
 * The beam itself is drawn as a faint additive cone. Real torchlight in fog
 * is visible as a shaft, and without it the light reads as a patch painted
 * on the ground rather than as something being held.
 *
 * It never flickers. Flicker is the cliché, and flicker is also a flash, and
 * nothing in this game flashes.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DoubleSide,
  Object3D,
  ShaderMaterial,
  Vector3,
  type Mesh,
  type SpotLight,
} from 'three';
import { playerRef } from './playerRuntime';

/** Half-angle of the cone, in radians. Wide enough to see a path by. */
const ANGLE = 0.46;
/** How far the light reaches before it is gone. */
const RANGE = 40;
/** How long the visible shaft is drawn; shorter than the light, or it glows over distant hills. */
const BEAM_LENGTH = 11;
const WARM = '#ffe0b4';

const BEAM_VERTEX = /* glsl */ `
varying float vAlong;
varying float vFacing;
void main() {
  // uv.y is 1 at the apex (the torch) and 0 at the far end.
  vAlong = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  // Edge-on to the camera the shaft is thick with light; face-on it is thin.
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uStrength;
varying float vAlong;
varying float vFacing;
void main() {
  float fade = pow(vAlong, 1.6);
  float edge = pow(vFacing, 1.4);
  gl_FragColor = vec4(uColour * fade * edge * uStrength, 1.0);
}
`;

export function Flashlight({ shadows }: { shadows: boolean }): React.ReactElement {
  const light = useRef<SpotLight>(null);
  const beam = useRef<Mesh>(null);
  const scene = useThree((s) => s.scene);
  const target = useMemo(() => new Object3D(), []);
  const direction = useMemo(() => new Vector3(), []);

  const beamGeometry = useMemo(() => {
    const geometry = new ConeGeometry(
      Math.tan(ANGLE * 0.8) * BEAM_LENGTH,
      BEAM_LENGTH,
      28,
      1,
      true,
    );
    // Apex at the origin, opening along +Z, so `lookAt` aims it.
    geometry.translate(0, -BEAM_LENGTH / 2, 0);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, []);
  const beamMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        uniforms: {
          uColour: { value: new Color(WARM) },
          uStrength: { value: 0.07 },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [],
  );

  useEffect(() => {
    scene.add(target);
    if (light.current !== null) light.current.target = target;
    return () => {
      scene.remove(target);
      beamGeometry.dispose();
      beamMaterial.dispose();
    };
  }, [scene, target, beamGeometry, beamMaterial]);

  useFrame((state) => {
    const spot = light.current;
    if (spot === null) return;

    // Aim where the camera looks, levelled and dipped a touch: a torch is
    // pointed at the path ten metres ahead. Following the camera's own
    // downward tilt put the whole beam in a hot puddle at the ranger's feet.
    state.camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    direction.y = -0.16;
    direction.normalize();

    // Held at chest height, a little in front of the body so the ranger does
    // not shadow their own beam.
    const p = playerRef.position;
    spot.position.set(p.x + direction.x * 0.35, p.y + 1.3, p.z + direction.z * 0.35);
    target.position.copy(spot.position).addScaledVector(direction, 12);

    if (beam.current !== null) {
      beam.current.position.copy(spot.position);
      beam.current.lookAt(target.position);
    }
  });

  return (
    <group>
      <spotLight
        ref={light}
        color={WARM}
        intensity={110}
        distance={RANGE}
        decay={1.3}
        angle={ANGLE}
        penumbra={0.65}
        castShadow={shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-near={0.4}
        shadow-camera-far={RANGE}
      />
      <mesh
        ref={beam}
        geometry={beamGeometry}
        material={beamMaterial}
        frustumCulled={false}
        renderOrder={2}
      />
    </group>
  );
}
