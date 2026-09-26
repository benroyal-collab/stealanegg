/**
 * The sanctuary's buildings.
 *
 * Every one of these used to be the same beige box with a four-sided cone on
 * top, told apart by roof colour and a white disc floating over it with a
 * glyph too small to read. The sanctuary is the first thing on screen in every
 * session and the place a child comes back to after every heist, so it was
 * also the single most-seen piece of programmer art in the game.
 *
 * Each station is now a thing you would recognise without its sign:
 *
 * - **Incubator:** a straw nest on a stone plinth under a heat lamp.
 * - **Ranger Store:** a market stall with a striped awning and goods on the
 *   shelves.
 * - **Field Guide:** a log cabin with an open book on a lectern outside.
 * - **Breeding Hut:** a round, whitewashed hut under a thatched cone.
 * - **Training Track:** a running strip with striped hurdles and a chequered
 *   finish arch.
 *
 * Silhouette carries the meaning first, so the stations are distinguishable
 * in greyscale -- colour is the second signal, not the only one.
 *
 * Baked like the ranger and the guardians: one vertex-coloured buffer per
 * station, all sharing one material. The old huts were two or three draws
 * each before their signs; these are one.
 *
 * Every building faces +Z. `Sanctuary.tsx` turns each one to face the centre
 * of the clearing, so their fronts greet you when you come home.
 */

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { roughen } from '../materials/roughen';
import { limb, lumpy, mergeColouredParts, part, type ColouredPart } from '../entities/mergeParts';

/* No pure black or white anywhere, as everywhere else. */
const WOOD = '#8a6440';
const WOOD_DARK = '#5a3e27';
const WOOD_LIGHT = '#b38c5e';
const STONE = '#948b7c';
const STONE_DARK = '#6f675b';
const STRAW = '#d0ac66';
const STRAW_DARK = '#a4803e';
const PLASTER = '#e4d7bc';
const CREAM = '#eee4cc';
const LAMP = '#40644a';
const TERRACOTTA = '#b86a44';
const GRASS = '#6d8a48';
const GRASS_DARK = '#557238';
const WATER = '#5d8eaa';

/** Each station keeps the colour it has always had, as a second signal. */
export const STATION_COLOUR = {
  shop: '#b8563a',
  guide: '#4c7ba8',
  breeding: '#7a5a9a',
  track: '#b0603e',
} as const;

/**
 * How high each station's sign floats, in metres. Clear of the roof, low
 * enough to be seen together with the building it names.
 */
export const SIGN_HEIGHT = {
  incubator: 2.3,
  shop: 2.9,
  guide: 2.9,
  breeding: 3.0,
  track: 2.4,
} as const;

/** A thatch or straw surface: roughened so it catches the light unevenly. */
function rough<T extends BufferGeometry>(geometry: T, seed: number, amount: number): T {
  roughen(geometry, seed, amount);
  return geometry;
}

/* ------------------------------------------------------------------------ */

/** Height of the nest lining the egg rests on. */
export const INCUBATOR_NEST_Y = 0.56;

/**
 * A straw nest on a stone plinth, under a heat lamp.
 *
 * The glowing parts -- the nest lining and the bulb -- are returned
 * separately, because they brighten as the egg gets close to hatching and so
 * need a material of their own.
 */
export function incubatorGeometry(): { body: BufferGeometry; glow: BufferGeometry } {
  const parts: ColouredPart[] = [
    part(new CylinderGeometry(0.6, 0.7, 0.42, 14), STONE, [0, 0.21, 0]),
    part(new CylinderGeometry(0.44, 0.4, 0.08, 16), STRAW_DARK, [0, INCUBATOR_NEST_Y - 0.06, 0]),
    part(
      rough(new TorusGeometry(0.44, 0.13, 8, 20), 31, 0.07),
      STRAW,
      [0, INCUBATOR_NEST_Y, 0],
      [Math.PI / 2, 0, 0],
    ),
  ];

  // A ring of fieldstones round the plinth, so it reads as built, not cast.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push(
      part(
        lumpy(0.17, 40 + i, 0.18, 10, 8),
        i % 2 === 0 ? STONE : STONE_DARK,
        [Math.sin(a) * 0.66, 0.12, Math.cos(a) * 0.66],
        [0, a, 0],
        [1.1, 0.72, 0.9],
      ),
    );
  }

  // Twigs laid across the rim: the difference between a nest and a doughnut.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const b = a + 0.85;
    const y = INCUBATOR_NEST_Y + 0.06 + (i % 3) * 0.02;
    parts.push(
      limb(
        [Math.sin(a) * 0.5, y, Math.cos(a) * 0.5],
        [Math.sin(b) * 0.48, y - 0.03, Math.cos(b) * 0.48],
        0.018,
        i % 2 === 0 ? STRAW_DARK : WOOD,
      ),
    );
  }

  // The lamp: a post at the back, an arm over the nest, a green hood.
  parts.push(
    limb([0, 0.3, -0.72], [0, 1.62, -0.72], 0.045, WOOD_DARK),
    limb([0, 1.62, -0.72], [0, 1.72, -0.28], 0.035, WOOD_DARK),
    limb([0, 1.72, -0.28], [0, 1.56, -0.02], 0.03, WOOD_DARK),
    part(new ConeGeometry(0.22, 0.22, 14), LAMP, [0, 1.47, 0]),
    part(new CylinderGeometry(0.05, 0.05, 0.08, 8), LAMP, [0, 1.6, 0]),
  );

  const glow = mergeColouredParts([
    part(new CylinderGeometry(0.36, 0.36, 0.03, 16), '#e89a52', [0, INCUBATOR_NEST_Y - 0.005, 0]),
    part(new SphereGeometry(0.075, 12, 10), '#f0b870', [0, 1.37, 0]),
  ]);

  return { body: mergeColouredParts(parts), glow };
}

/* ------------------------------------------------------------------------ */

/** A market stall under a striped awning. */
export function storeGeometry(): BufferGeometry {
  const stripe = STATION_COLOUR.shop;
  const parts: ColouredPart[] = [
    // Counter, with a lighter top and plank seams down the front.
    part(new BoxGeometry(1.8, 0.85, 0.55), WOOD, [0, 0.425, 0.3]),
    part(new BoxGeometry(1.92, 0.06, 0.66), WOOD_LIGHT, [0, 0.88, 0.3]),
    ...[-0.6, -0.2, 0.2, 0.6].map((x) =>
      part(new BoxGeometry(0.025, 0.78, 0.01), WOOD_DARK, [x, 0.43, 0.58]),
    ),
    // Back wall and two shelves.
    part(new BoxGeometry(1.8, 1.7, 0.06), WOOD_DARK, [0, 0.85, -0.5]),
    part(new BoxGeometry(1.8, 0.05, 0.28), WOOD_LIGHT, [0, 1.15, -0.36]),
    part(new BoxGeometry(1.8, 0.05, 0.28), WOOD_LIGHT, [0, 1.55, -0.36]),
  ];

  // Posts: taller at the back, so the awning slopes towards you.
  for (const x of [-0.92, 0.92]) {
    parts.push(
      part(new BoxGeometry(0.09, 2.0, 0.09), WOOD_DARK, [x, 1.0, 0.62]),
      part(new BoxGeometry(0.09, 2.3, 0.09), WOOD_DARK, [x, 1.15, -0.52]),
    );
  }

  // Goods on the shelves: seed packets, jars of berries, a whistle or two.
  const goods = ['#d9a441', '#8a4a8a', '#5a8a5a', '#c2382a', '#4c7ba8', '#e0c070'];
  for (let i = 0; i < 6; i++) {
    const x = -0.7 + i * 0.28;
    parts.push(
      part(new BoxGeometry(0.14, 0.2, 0.05), goods[i]!, [x, 1.28, -0.34], [0, (i - 2.5) * 0.08, 0]),
      part(new CylinderGeometry(0.06, 0.06, 0.16, 10), goods[(i + 3) % 6]!, [
        x + 0.05,
        1.66,
        -0.36,
      ]),
    );
  }
  // A few things out on the counter.
  parts.push(
    part(new SphereGeometry(0.07, 10, 8), '#c2382a', [-0.5, 0.96, 0.3]),
    part(new SphereGeometry(0.07, 10, 8), '#c2382a', [-0.4, 0.96, 0.38]),
    part(new SphereGeometry(0.07, 10, 8), '#8a4a8a', [-0.45, 1.02, 0.34]),
    part(new BoxGeometry(0.3, 0.12, 0.22), WOOD_LIGHT, [0.45, 0.97, 0.3]),
  );

  // The awning: stripes are what make a stall read as a stall at thirty metres.
  const stripes = 7;
  for (let i = 0; i < stripes; i++) {
    const x = -0.96 + (i + 0.5) * (1.92 / stripes);
    parts.push(
      part(
        new BoxGeometry(1.92 / stripes + 0.005, 0.035, 1.42),
        i % 2 === 0 ? stripe : CREAM,
        [x, 2.17, 0.06],
        [0.2, 0, 0],
      ),
      // Scalloped valance along the front edge.
      part(
        new CylinderGeometry(0.13, 0.13, 0.025, 12),
        i % 2 === 0 ? stripe : CREAM,
        [x, 2.0, 0.77],
        [Math.PI / 2 - 0.2, 0, 0],
      ),
    );
  }

  // A crate and a barrel out front, so it looks traded from.
  parts.push(
    part(new BoxGeometry(0.42, 0.42, 0.42), WOOD_LIGHT, [1.18, 0.21, 0.45], [0, 0.3, 0]),
    part(new BoxGeometry(0.44, 0.05, 0.44), WOOD_DARK, [1.18, 0.3, 0.45], [0, 0.3, 0]),
    part(new CylinderGeometry(0.22, 0.2, 0.56, 12), WOOD, [-1.18, 0.28, 0.4]),
    part(
      new TorusGeometry(0.215, 0.018, 5, 14),
      WOOD_DARK,
      [-1.18, 0.14, 0.4],
      [Math.PI / 2, 0, 0],
    ),
    part(
      new TorusGeometry(0.215, 0.018, 5, 14),
      WOOD_DARK,
      [-1.18, 0.44, 0.4],
      [Math.PI / 2, 0, 0],
    ),
  );

  return mergeColouredParts(parts);
}

/* ------------------------------------------------------------------------ */

/** A log cabin with a blue roof and an open book outside. */
export function guideGeometry(): BufferGeometry {
  const roof = STATION_COLOUR.guide;
  const wallTop = 1.42;
  const halfW = 0.85;
  const gableH = 0.74;
  const parts: ColouredPart[] = [
    part(new BoxGeometry(2.0, 0.12, 2.1), STONE_DARK, [0, 0.06, 0.1]),
    part(new BoxGeometry(halfW * 2, 1.3, 1.6), WOOD, [0, 0.77, 0]),
  ];

  // Logs: horizontal rounds on every face, which is the whole of "log cabin".
  for (let row = 0; row < 6; row++) {
    const y = 0.22 + row * 0.22;
    const tint = row % 2 === 0 ? WOOD_DARK : WOOD;
    for (const z of [-0.81, 0.81]) {
      parts.push(
        part(
          new CylinderGeometry(0.075, 0.075, halfW * 2 + 0.12, 8),
          tint,
          [0, y, z],
          [0, 0, Math.PI / 2],
        ),
      );
    }
    for (const x of [-halfW - 0.01, halfW + 0.01]) {
      parts.push(
        part(new CylinderGeometry(0.075, 0.075, 1.74, 8), tint, [x, y, 0], [Math.PI / 2, 0, 0]),
      );
    }
  }

  // Gable ends: a triangular prism, squashed to a friendly pitch.
  const r = halfW / Math.sin((Math.PI * 2) / 3);
  const squash = gableH / (1.5 * r);
  parts.push(
    part(
      new CylinderGeometry(r, r, 1.6, 3),
      WOOD,
      [0, wallTop + r * 0.5 * squash, 0],
      [-Math.PI / 2, 0, 0],
      [1, 1, squash],
    ),
  );

  // Roof slabs with an overhang, and a ridge cap.
  const pitch = Math.atan2(gableH, halfW);
  const slab = Math.hypot(gableH, halfW) + 0.26;
  for (const side of [-1, 1]) {
    parts.push(
      part(
        new BoxGeometry(slab, 0.09, 2.0),
        roof,
        [side * (halfW / 2 + 0.06), wallTop + gableH / 2 + 0.03, 0],
        [0, 0, -side * pitch],
      ),
    );
  }
  parts.push(part(new BoxGeometry(0.16, 0.1, 2.06), WOOD_DARK, [0, wallTop + gableH + 0.06, 0]));

  // Door, window, and a chimney for the silhouette.
  parts.push(
    part(new BoxGeometry(0.5, 0.86, 0.05), WOOD_DARK, [0, 0.55, 0.86]),
    part(new SphereGeometry(0.035, 8, 6), '#c8a24a', [0.16, 0.55, 0.9]),
    part(new BoxGeometry(0.42, 0.4, 0.04), CREAM, [0.56, 0.95, 0.86]),
    part(new BoxGeometry(0.32, 0.3, 0.05), '#3e4f5a', [0.56, 0.95, 0.87]),
    part(new BoxGeometry(0.34, 0.03, 0.06), CREAM, [0.56, 0.95, 0.9]),
    part(new BoxGeometry(0.26, 0.6, 0.26), STONE, [-0.48, wallTop + 0.62, -0.4]),
  );

  // The lectern and its open book: this is the Field Guide's sign.
  const lx = -0.62;
  const lz = 1.28;
  parts.push(
    part(new BoxGeometry(0.08, 0.8, 0.08), WOOD_DARK, [lx, 0.4, lz]),
    part(new BoxGeometry(0.34, 0.04, 0.22), WOOD_DARK, [lx, 0.02, lz]),
    part(new BoxGeometry(0.46, 0.04, 0.34), roof, [lx, 0.84, lz], [-0.45, 0, 0]),
    part(new BoxGeometry(0.2, 0.03, 0.3), CREAM, [lx - 0.105, 0.87, lz + 0.01], [-0.45, 0, 0.1]),
    part(new BoxGeometry(0.2, 0.03, 0.3), CREAM, [lx + 0.105, 0.87, lz + 0.01], [-0.45, 0, -0.1]),
  );

  return mergeColouredParts(parts);
}

/* ------------------------------------------------------------------------ */

/** A round whitewashed hut under a thatched cone. */
export function breedingGeometry(): BufferGeometry {
  const door = STATION_COLOUR.breeding;
  const parts: ColouredPart[] = [
    part(new CylinderGeometry(0.85, 0.9, 1.22, 18), PLASTER, [0, 0.61, 0]),
    part(new TorusGeometry(0.89, 0.045, 6, 22), WOOD_DARK, [0, 0.08, 0], [Math.PI / 2, 0, 0]),
    part(new TorusGeometry(0.86, 0.045, 6, 22), WOOD_DARK, [0, 1.2, 0], [Math.PI / 2, 0, 0]),
    // The thatch, heavy and shaggy, with a darker drip line and a top knot.
    part(rough(new ConeGeometry(1.28, 1.2, 18, 3), 61, 0.07), STRAW, [0, 1.8, 0]),
    part(
      rough(new TorusGeometry(1.14, 0.09, 6, 22), 62, 0.08),
      STRAW_DARK,
      [0, 1.25, 0],
      [Math.PI / 2, 0, 0],
    ),
    part(lumpy(0.13, 63, 0.2, 10, 8), STRAW_DARK, [0, 2.4, 0], [0, 0, 0], [1, 1.4, 1]),
    // Arched door: a slab and a disc of the same colour.
    part(new BoxGeometry(0.46, 0.66, 0.06), door, [0, 0.41, 0.87]),
    part(new CylinderGeometry(0.23, 0.23, 0.06, 16), door, [0, 0.74, 0.87], [Math.PI / 2, 0, 0]),
    part(new SphereGeometry(0.03, 8, 6), '#c8a24a', [0.14, 0.44, 0.91]),
  ];

  // Timber studs round the wall, skipping the doorway.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.4) continue;
    parts.push(
      part(
        new BoxGeometry(0.06, 1.1, 0.04),
        WOOD_DARK,
        [Math.sin(a) * 0.885, 0.64, Math.cos(a) * 0.885],
        [0, a, 0],
      ),
    );
  }

  // Flower pots either side of the door: somebody lives here.
  const flowers = ['#d9573a', '#e8c040', '#c86aa8'];
  for (const side of [-1, 1]) {
    const x = side * 0.55;
    parts.push(part(new CylinderGeometry(0.12, 0.09, 0.2, 10), TERRACOTTA, [x, 0.1, 0.92]));
    for (let f = 0; f < 3; f++) {
      const a = (f / 3) * Math.PI * 2 + side;
      parts.push(
        part(new SphereGeometry(0.055, 8, 6), GRASS_DARK, [
          x + Math.sin(a) * 0.05,
          0.24,
          0.92 + Math.cos(a) * 0.05,
        ]),
        part(new SphereGeometry(0.05, 8, 6), flowers[f]!, [
          x + Math.sin(a) * 0.06,
          0.3,
          0.92 + Math.cos(a) * 0.06,
        ]),
      );
    }
  }

  return mergeColouredParts(parts);
}

/* ------------------------------------------------------------------------ */

/** A running strip with striped hurdles and a chequered finish arch. */
export function trackGeometry(): BufferGeometry {
  const parts: ColouredPart[] = [
    part(new BoxGeometry(3.0, 0.03, 1.3), STATION_COLOUR.track, [0, 0.015, 0]),
    ...[-0.63, 0, 0.63].map((z) => part(new BoxGeometry(3.0, 0.034, 0.04), CREAM, [0, 0.017, z])),
    part(new BoxGeometry(0.07, 0.036, 1.3), CREAM, [-1.42, 0.018, 0]),
  ];

  for (const x of [-0.55, 0.45]) {
    for (const z of [-0.45, 0.45]) {
      parts.push(
        part(new BoxGeometry(0.06, 0.56, 0.06), CREAM, [x, 0.28, z]),
        part(new BoxGeometry(0.3, 0.05, 0.07), CREAM, [x, 0.025, z]),
      );
    }
    // The bar, striped: a hurdle is recognisable from its stripes alone.
    for (let s = 0; s < 4; s++) {
      parts.push(
        part(new BoxGeometry(0.07, 0.12, 0.24), s % 2 === 0 ? '#c2382a' : CREAM, [
          x,
          0.56,
          -0.36 + s * 0.24,
        ]),
      );
    }
  }

  // Finish arch with a chequered banner.
  const ax = 1.35;
  parts.push(
    part(new BoxGeometry(0.09, 1.75, 0.09), WOOD_DARK, [ax, 0.875, -0.66]),
    part(new BoxGeometry(0.09, 1.75, 0.09), WOOD_DARK, [ax, 0.875, 0.66]),
  );
  const cells = 8;
  for (let c = 0; c < cells; c++) {
    for (let row = 0; row < 2; row++) {
      parts.push(
        part(new BoxGeometry(0.05, 0.15, 1.32 / cells), (c + row) % 2 === 0 ? '#2a2622' : CREAM, [
          ax,
          1.5 + row * 0.15,
          -0.66 + (c + 0.5) * (1.32 / cells),
        ]),
      );
    }
  }

  return mergeColouredParts(parts);
}

/* ------------------------------------------------------------------------ */

const PEN_POSTS = 10;
export const PEN_RADIUS = 1.2;

/**
 * A pen: grass, a post-and-rail fence with a gap for a gate, a little shelter
 * and a water bowl. Shared by every habitat slot.
 *
 * An empty pen has to look like somewhere a creature would like to live,
 * because an empty pen is the reason to go out and fetch another egg.
 */
export function penGeometry(): BufferGeometry {
  const parts: ColouredPart[] = [
    part(
      new CylinderGeometry(PEN_RADIUS + 0.08, PEN_RADIUS + 0.12, 0.05, 22),
      GRASS,
      [0, 0.025, 0],
    ),
  ];

  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const d = 0.35 + (i % 3) * 0.25;
    parts.push(
      part(
        new ConeGeometry(0.06, 0.18, 5),
        GRASS_DARK,
        [Math.sin(a) * d, 0.12, Math.cos(a) * d],
        [0.15, a, 0],
      ),
    );
  }

  const posts: [number, number][] = [];
  for (let i = 0; i < PEN_POSTS; i++) {
    const a = (i / PEN_POSTS) * Math.PI * 2 + Math.PI / PEN_POSTS;
    posts.push([Math.sin(a) * PEN_RADIUS, Math.cos(a) * PEN_RADIUS]);
  }
  for (const [x, z] of posts) {
    parts.push(
      part(new CylinderGeometry(0.045, 0.05, 0.58, 7), WOOD, [x, 0.29, z]),
      part(new SphereGeometry(0.05, 7, 5), WOOD_DARK, [x, 0.59, z]),
    );
  }
  // Two rails between neighbouring posts, except across the front: the gate.
  for (let i = 0; i < PEN_POSTS; i++) {
    const [ax, az] = posts[i]!;
    const [bx, bz] = posts[(i + 1) % PEN_POSTS]!;
    if (i === PEN_POSTS - 1) continue;
    for (const y of [0.24, 0.46]) {
      parts.push(limb([ax, y, az], [bx, y, bz], 0.026, WOOD_LIGHT));
    }
  }

  /*
   * A hutch at the back, with a peaked roof and a round doorway. The first
   * version was a lean-to -- a slab on four legs -- and at any distance it
   * read as a picnic table.
   */
  const hz = -0.62;
  parts.push(
    part(new BoxGeometry(0.56, 0.36, 0.44), WOOD_LIGHT, [0, 0.23, hz]),
    part(
      new CylinderGeometry(0.1, 0.1, 0.02, 12),
      '#2e241a',
      [0, 0.2, hz + 0.225],
      [Math.PI / 2, 0, 0],
    ),
    part(new BoxGeometry(0.2, 0.1, 0.02), '#2e241a', [0, 0.13, hz + 0.225]),
    ...[-1, 1].map((side) =>
      part(
        new BoxGeometry(0.4, 0.04, 0.54),
        STATION_COLOUR.shop,
        [side * 0.15, 0.5, hz],
        [0, 0, -side * 0.62],
      ),
    ),
    part(new CylinderGeometry(0.17, 0.13, 0.08, 12), STONE, [0.62, 0.07, -0.25]),
    part(new CylinderGeometry(0.13, 0.13, 0.01, 12), WATER, [0.62, 0.11, -0.25]),
  );

  return mergeColouredParts(parts);
}
