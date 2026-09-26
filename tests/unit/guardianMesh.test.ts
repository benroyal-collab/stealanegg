import { describe, expect, it } from 'vitest';
import { Box3, Color, Mesh, type BufferAttribute } from 'three';
import {
  buildGuardian,
  disposeGuardian,
  type GuardianSpecies,
} from '../../src/render/entities/guardianMesh';

/**
 * The guardians, asserted rather than eyeballed.
 *
 * The previous hen was built from the generic creature kit and read as an
 * orange blob -- which nobody noticed in a unit test, because there was
 * nothing to notice it with. A silhouette cannot be tested directly, but the
 * things that let one go wrong can: whether the animal stands on the ground,
 * whether its bubble clears its head, whether the three species actually
 * differ in shape, and whether the detail that makes them legible has
 * quietly become a draw-call bill.
 */

const SPECIES: GuardianSpecies[] = ['hen', 'swan', 'scorpion'];

function measure(species: GuardianSpecies): {
  box: Box3;
  meshes: number;
  rig: ReturnType<typeof buildGuardian>;
} {
  const rig = buildGuardian(species);
  rig.root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(rig.root);
  let meshes = 0;
  rig.root.traverse((o) => {
    if (o instanceof Mesh) meshes += 1;
  });
  return { box, meshes, rig };
}

describe('the guardians', () => {
  it('each cost six draw calls or fewer, however much detail they carry', () => {
    // The old builder was thirteen up close, times nine guardians, times
    // every shadow cascade.
    for (const species of SPECIES) {
      const { meshes, rig } = measure(species);
      expect(meshes, species).toBeLessThanOrEqual(6);
      disposeGuardian(rig);
    }
  });

  it('stand on the ground', () => {
    for (const species of SPECIES) {
      const { box, rig } = measure(species);
      expect(Math.abs(box.min.y), `${species} floats or sinks`).toBeLessThan(0.05);
      disposeGuardian(rig);
    }
  });

  it('put the thought bubble above the head, not inside it', () => {
    for (const species of SPECIES) {
      const { box, rig } = measure(species);
      expect(rig.height, species).toBeGreaterThanOrEqual(box.max.y - 0.05);
      expect(rig.height, species).toBeLessThan(box.max.y + 0.25);
      disposeGuardian(rig);
    }
  });

  it('have three different silhouettes', () => {
    /*
     * A silhouette is more than a bounding box, but two animals with the same
     * box are well on the way to reading alike. Every pair has to differ by
     * at least fifteen per cent in height or in length.
     */
    const boxes = SPECIES.map((species) => {
      const { box, rig } = measure(species);
      disposeGuardian(rig);
      return { species, height: box.max.y - box.min.y, length: box.max.z - box.min.z };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const dh = Math.abs(a.height - b.height) / Math.max(a.height, b.height);
        const dl = Math.abs(a.length - b.length) / Math.max(a.length, b.length);
        expect(Math.max(dh, dl), `${a.species} and ${b.species}`).toBeGreaterThan(0.15);
      }
    }
  });

  it('use no pure black or pure white anywhere', () => {
    // A pure-black albedo swallows every highlight and a pure-white one
    // blooms off the lake; neither survives the tone mapper.
    const colour = new Color();
    for (const species of SPECIES) {
      const rig = buildGuardian(species);
      rig.root.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const attribute = o.geometry.attributes.color as BufferAttribute;
        for (let i = 0; i < attribute.count; i++) {
          colour.fromBufferAttribute(attribute, i);
          const max = Math.max(colour.r, colour.g, colour.b);
          const min = Math.min(colour.r, colour.g, colour.b);
          expect(max, species).toBeGreaterThan(0.004);
          expect(min, species).toBeLessThan(0.99);
        }
      });
      disposeGuardian(rig);
    }
  });
});
