import { describe, expect, it } from 'vitest';
import { Color, type BufferAttribute, type BufferGeometry } from 'three';
import {
  PEN_RADIUS,
  SIGN_HEIGHT,
  breedingGeometry,
  guideGeometry,
  incubatorGeometry,
  penGeometry,
  storeGeometry,
  trackGeometry,
} from '../../src/render/world/stationMesh';

/**
 * The sanctuary's buildings.
 *
 * They were five beige boxes with cones on top, told apart by roof colour.
 * What can be asserted about their replacements: each one is still a single
 * draw, its sign clears its roof, nothing is pure black or white, the five
 * silhouettes differ, and every pen still has a way in.
 */

function top(geometry: BufferGeometry): number {
  geometry.computeBoundingBox();
  return geometry.boundingBox!.max.y;
}

const STATIONS = {
  incubator: () => incubatorGeometry().body,
  shop: storeGeometry,
  guide: guideGeometry,
  breeding: breedingGeometry,
  track: trackGeometry,
} as const;

describe('the sanctuary stations', () => {
  it('each hang their sign clear of the roof', () => {
    for (const [id, build] of Object.entries(STATIONS)) {
      const height = top(build());
      // The badge is 0.78 m across, so its bottom edge is 0.39 below centre.
      expect(SIGN_HEIGHT[id as keyof typeof SIGN_HEIGHT] - 0.39, id).toBeGreaterThan(height);
    }
  });

  it('have five different silhouettes', () => {
    // Height and footprint. Colour is the second signal, never the only one.
    const shapes = Object.entries(STATIONS).map(([id, build]) => {
      const g = build();
      g.computeBoundingBox();
      const box = g.boundingBox!;
      return { id, h: box.max.y - box.min.y, w: box.max.x - box.min.x, d: box.max.z - box.min.z };
    });
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i]!;
        const b = shapes[j]!;
        const differ =
          Math.abs(a.h - b.h) > 0.2 || Math.abs(a.w - b.w) > 0.2 || Math.abs(a.d - b.d) > 0.2;
        expect(differ, `${a.id} and ${b.id} are the same shape`).toBe(true);
      }
    }
  });

  it('use no pure black or pure white', () => {
    const colour = new Color();
    const all = [
      ...Object.values(STATIONS).map((b) => b()),
      penGeometry(),
      incubatorGeometry().glow,
    ];
    for (const geometry of all) {
      const attribute = geometry.attributes.color as BufferAttribute;
      for (let i = 0; i < attribute.count; i++) {
        colour.fromBufferAttribute(attribute, i);
        expect(Math.max(colour.r, colour.g, colour.b)).toBeGreaterThan(0.004);
        expect(Math.min(colour.r, colour.g, colour.b)).toBeLessThan(0.99);
      }
    }
  });

  it('leaves every pen a gate, facing the clearing', () => {
    // Nothing tall stands in the front sector at fence height.
    const position = penGeometry().attributes.position as BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const onTheFence = Math.hypot(x, z) > PEN_RADIUS - 0.15;
      const inTheGateway = z > 0 && Math.abs(x) < 0.12;
      if (onTheFence && inTheGateway) expect(y, 'the gate is fenced off').toBeLessThan(0.06);
    }
  });
});
