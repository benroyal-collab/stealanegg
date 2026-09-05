/**
 * Particle bursts.
 *
 * One pooled instanced mesh for the whole game, recycled by index. A burst is
 * a handful of instances given a velocity and a lifetime; when they expire
 * they are reused. Nothing is allocated after mount.
 *
 * Used for the puff when a guardian shoos you, the sparkle when an egg
 * hatches, and the coin pop when a habitat pays out. Deliberately small and
 * slow -- these are punctuation, not fireworks, and nothing here pulses fast
 * enough to bother anyone.
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';

const CAPACITY = 96;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
}

const pool: Particle[] = Array.from({ length: CAPACITY }, () => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  life: 0,
  maxLife: 1,
  scale: 1,
}));
let cursor = 0;
const burstColour = new Color('#ffffff');

export type BurstKind = 'dust' | 'sparkle' | 'coin';

const BURSTS: Record<
  BurstKind,
  { count: number; speed: number; lift: number; life: number; size: number; colour: string }
> = {
  dust: { count: 14, speed: 2.2, lift: 1.4, life: 0.7, size: 0.16, colour: '#c9b892' },
  sparkle: { count: 20, speed: 1.6, lift: 2.6, life: 1.3, size: 0.09, colour: '#ffe9a8' },
  coin: { count: 6, speed: 1.1, lift: 2.2, life: 0.9, size: 0.08, colour: '#ffd05a' },
};

/** Fire a burst. Safe to call from anywhere, including outside React. */
export function burst(kind: BurstKind, x: number, y: number, z: number): void {
  const spec = BURSTS[kind];
  burstColour.set(spec.colour);
  for (let i = 0; i < spec.count; i++) {
    const particle = pool[cursor % CAPACITY]!;
    cursor += 1;
    const angle = Math.random() * Math.PI * 2;
    const speed = spec.speed * (0.4 + Math.random() * 0.6);
    particle.x = x;
    particle.y = y;
    particle.z = z;
    particle.vx = Math.cos(angle) * speed;
    particle.vz = Math.sin(angle) * speed;
    particle.vy = spec.lift * (0.5 + Math.random() * 0.8);
    particle.maxLife = spec.life * (0.7 + Math.random() * 0.6);
    particle.life = particle.maxLife;
    particle.scale = spec.size;
  }
}

export function Particles(): React.ReactElement {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame((_state, rawDelta) => {
    const instanced = mesh.current;
    if (instanced === null) return;
    const dt = Math.min(rawDelta, 1 / 20);

    for (let i = 0; i < CAPACITY; i++) {
      const particle = pool[i]!;
      if (particle.life <= 0) {
        // Park dead instances at zero scale rather than removing them: the
        // instance count stays constant and the buffer never resizes.
        dummy.scale.setScalar(0);
        dummy.position.set(0, -1000, 0);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
        continue;
      }

      particle.life -= dt;
      particle.vy -= 7 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      // Air drag, so a puff settles rather than flying off.
      particle.vx *= 1 - 2.2 * dt;
      particle.vz *= 1 - 2.2 * dt;

      const fraction = Math.max(0, particle.life / particle.maxLife);
      dummy.position.set(particle.x, particle.y, particle.z);
      dummy.scale.setScalar(particle.scale * fraction);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CAPACITY]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 5]} />
      <meshBasicMaterial color="#f0e4c8" transparent opacity={0.85} toneMapped={false} />
    </instancedMesh>
  );
}
