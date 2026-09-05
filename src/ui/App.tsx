import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { ACESFilmicToneMapping } from 'three';

function SpinningCube() {
  const mesh = useRef<Mesh>(null);
  useFrame((_state, delta) => {
    if (mesh.current) {
      mesh.current.rotation.y += delta * 0.6;
      mesh.current.rotation.x += delta * 0.22;
    }
  });
  return (
    <mesh ref={mesh} castShadow receiveShadow>
      <boxGeometry args={[1.4, 1.4, 1.4]} />
      <meshStandardMaterial color="#c9a86b" roughness={0.45} metalness={0.05} />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas
      shadows
      camera={{ position: [3, 2.4, 4], fov: 55 }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
    >
      <color attach="background" args={['#0d1410']} />
      <hemisphereLight args={['#9fc2d8', '#40492f', 0.6]} />
      <directionalLight position={[4, 6, 3]} intensity={2.4} castShadow color="#ffd9a0" />
      <SpinningCube />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#3f4a2c" roughness={0.95} />
      </mesh>
    </Canvas>
  );
}
