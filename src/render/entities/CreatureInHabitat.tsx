/**
 * A hatchling pottering about in its habitat.
 *
 * Idle behaviour on a per-creature timer: wander a step, look around, pause.
 * It costs almost nothing and it is the difference between a habitat that
 * looks like a display case and one that looks alive -- which matters, because
 * the habitats are what the whole economy is *for*.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, MathUtils, MeshStandardMaterial, type Group } from 'three';
import { SIZE_MESH_SCALE } from '../../data/balance';
import { MUTATION_DEFS } from '../../data/mutations';
import type { CreatureBody, MutationId, SizeId } from '../../sim/types';
import { buildCreature, disposeCreature } from './creatureMesh';

export interface CreatureInHabitatProps {
  body: CreatureBody;
  mutation: MutationId;
  size: SizeId;
}

/** A hatchling is small, so its detail vanishes sooner. */
const HATCHLING_DETAIL_DISTANCE = 18;

export function CreatureInHabitat({
  body,
  mutation,
  size,
}: CreatureInHabitatProps): React.ReactElement {
  const root = useRef<Group>(null);
  const wander = useRef({ targetX: 0, targetZ: 0, timer: 0, x: 0, z: 0, facing: 0, hop: 0 });

  const parts = useMemo(() => buildCreature(body, SIZE_MESH_SCALE[size]), [body, size]);

  useEffect(() => {
    // Mutations show on the creature as well as the egg. A Golden hatchling
    // has to still look golden once it is out of its shell, or the reward
    // stops being visible the moment you collect it.
    const definition = MUTATION_DEFS[mutation];
    const tint = new Color(definition.material.tint);
    for (const owned of parts.owned) {
      if (!(owned instanceof MeshStandardMaterial)) continue;
      owned.color.multiply(tint);
      owned.metalness = definition.material.metalness;
      owned.roughness = Math.max(0.08, definition.material.roughness);
      if (definition.material.emissiveIntensity > 0) {
        owned.emissive = new Color(definition.material.emissive);
        owned.emissiveIntensity = definition.material.emissiveIntensity * 0.7;
      }
    }
    return () => disposeCreature(parts);
  }, [parts, mutation]);

  useFrame((state, rawDelta) => {
    const g = root.current;
    if (g === null) return;
    const dt = Math.min(rawDelta, 1 / 20);
    const w = wander.current;

    w.timer -= dt;
    if (w.timer <= 0) {
      // Pick a new spot inside the pen and a new pause length.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 0.72;
      w.targetX = Math.cos(angle) * radius;
      w.targetZ = Math.sin(angle) * radius;
      w.timer = 1.6 + Math.random() * 3.4;
    }

    const dx = w.targetX - w.x;
    const dz = w.targetZ - w.z;
    const distance = Math.hypot(dx, dz);

    if (distance > 0.04) {
      const speed = 0.42;
      w.x += (dx / distance) * speed * dt;
      w.z += (dz / distance) * speed * dt;
      w.facing = Math.atan2(dx, dz);
      // A little hop with each step. Legs alone are not enough at this scale.
      w.hop += dt * 7;
    }

    g.position.set(w.x, Math.abs(Math.sin(w.hop)) * 0.035 * (distance > 0.04 ? 1 : 0), w.z);
    g.rotation.y = MathUtils.damp(g.rotation.y, w.facing, 6, dt);

    for (let i = 0; i < parts.legs.length; i++) {
      const leg = parts.legs[i];
      if (leg === undefined) continue;
      leg.rotation.x = distance > 0.04 ? Math.sin(w.hop + (i % 2 === 0 ? 0 : Math.PI)) * 0.38 : 0;
    }

    if (parts.tail !== null) {
      parts.tail.rotation.y = Math.sin(state.clock.elapsedTime * 2.2) * 0.22;
    }

    // Distance cull on the small features: a habitat full of hatchlings is
    // otherwise one of the heaviest things in the sanctuary, and at this size
    // the detail is sub-pixel well before twenty metres.
    const camera = state.camera.position;
    const toCamera = Math.hypot(camera.x - g.position.x, camera.z - g.position.z);
    parts.detail.visible = toCamera < HATCHLING_DETAIL_DISTANCE;
  });

  return (
    <group ref={root}>
      <primitive object={parts.root} />
    </group>
  );
}
