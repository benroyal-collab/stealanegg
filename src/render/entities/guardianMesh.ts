/**
 * The guardians, each built as its own animal.
 *
 * They used to come out of the same parametric builder as the collectable
 * creatures -- a capsule, a ball for a head, a cone for a snout -- on the
 * theory that a guardian should read as a big cousin of the things you catch.
 * In practice the Broody Hen came out as an orange lozenge with a cream dome
 * on top and some shards sticking out of it, and because she is what fills
 * the middle of the frame during every chase, she was the single most-looked
 * at thing in the game and the least legible.
 *
 * A child has to know what is chasing them from the silhouette alone, at a
 * glance, over their shoulder. So each species gets the handful of shapes its
 * real animal is recognised by, and nothing else:
 *
 * - **Hen:** comb, wattle, beak, an upswept tail and a round breast.
 * - **Swan:** the S-curved neck, the black mask and orange bill, wings carried
 *   high over the back.
 * - **Scorpion:** pincers held forward and the tail curled over the back --
 *   ending in a round bulb rather than a sting, because nothing here hurts.
 *
 * Every one of them frowns. That is most of what "scarier" costs: a cross
 * face on something big, coming at you fast. None of them has teeth.
 *
 * Built the same way as the ranger -- small primitives baked into one
 * vertex-coloured buffer per moving joint -- so a guardian is six draw calls
 * however much detail it carries. The old builder was thirteen up close.
 *
 * Everything is in metres at scale 1, measured from each joint, facing +Z.
 */

import {
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
  type Material,
} from 'three';
import { roughen } from '../materials/roughen';
import { roughnessMap } from '../materials/proceduralTextures';
import { mergeColouredParts, type ColouredPart } from './mergeParts';

export type GuardianSpecies = 'hen' | 'swan' | 'scorpion';

/** How a guardian's limbs should be animated. */
export type Gait = 'stride' | 'scuttle';
export type ArmStyle = 'wing' | 'claw';

export interface GuardianRig {
  root: Group;
  /** Pitches forward and bobs under pursuit. */
  body: Group;
  bodyBaseY: number;
  /** The neck joint. Null for the scorpion, which has no neck to speak of. */
  head: Group | null;
  legs: Group[];
  gait: Gait;
  /** Wings or pincers, left then right. */
  arms: Group[];
  armStyle: ArmStyle;
  tail: Group | null;
  /** How far the body pitches forward at full charge, in radians. */
  lean: number;
  /**
   * Neck pitch at full charge. The hen keeps her face level and thrusts it
   * forward; the swan throws its whole neck out in front.
   */
  charge: number;
  /** How far the head joint slides forward at full charge, in metres. */
  thrust: number;
  headBaseZ: number;
  /** How wide the wings or pincers open at full charge, and how hard they beat. */
  armSpread: number;
  armBeat: number;
  /** Top of the head at scale 1, so the thought bubble clears it. */
  height: number;
  owned: (BufferGeometry | Material)[];
}

/* ------------------------------------------------------------------------ */
/* Placement helpers                                                         */
/* ------------------------------------------------------------------------ */

type V3 = readonly [number, number, number];

const scratchEuler = new Euler();
const scratchQuat = new Quaternion();
const scratchPos = new Vector3();
const scratchScale = new Vector3();

/**
 * Position, rotate and scale one primitive within its joint.
 *
 * Rotation is applied yaw-last ('YXZ'), so `[PI/2, yaw, 0]` means "lay it
 * along +Z, then turn it" -- which is what nearly every toe, finger and
 * feather here wants.
 */
function part(
  geometry: BufferGeometry,
  colour: string,
  position: V3,
  rotation: V3 = [0, 0, 0],
  scale: V3 = [1, 1, 1],
): ColouredPart {
  scratchEuler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
  scratchQuat.setFromEuler(scratchEuler);
  const matrix = new Matrix4().compose(
    scratchPos.set(position[0], position[1], position[2]),
    scratchQuat,
    scratchScale.set(scale[0], scale[1], scale[2]),
  );
  return { geometry, colour, matrix };
}

const UP = new Vector3(0, 1, 0);

/** A capsule from one point to another: a leg segment, a claw arm. */
function limb(from: V3, to: V3, radius: number, colour: string): ColouredPart {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const dir = b.clone().sub(a);
  const length = dir.length();
  const quat = new Quaternion().setFromUnitVectors(UP, dir.normalize());
  const matrix = new Matrix4().compose(a.add(b).multiplyScalar(0.5), quat, new Vector3(1, 1, 1));
  return {
    geometry: new CapsuleGeometry(radius, Math.max(0.001, length - radius), 3, 8),
    colour,
    matrix,
  };
}

/** A sphere with its surface broken up, so it reads as feathers or shell. */
function lumpy(radius: number, seed: number, amount: number, w = 16, h = 12): SphereGeometry {
  const geometry = new SphereGeometry(radius, w, h);
  roughen(geometry, seed, amount);
  return geometry;
}

/**
 * A tube that narrows along its length. A swan's neck is thick where it meets
 * the body and slender under the head, and a constant-radius tube reads as a
 * hosepipe.
 */
function taperedTube(points: readonly V3[], from: number, to: number): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
  const segments = 20;
  const radial = 10;
  const geometry = new TubeGeometry(curve, segments, 1, radial, false);
  const position = geometry.attributes.position as BufferAttribute;
  const centre = new Vector3();
  for (let i = 0; i < position.count; i++) {
    const t = Math.floor(i / (radial + 1)) / segments;
    curve.getPointAt(t, centre);
    const r = from + (to - from) * t;
    position.setXYZ(
      i,
      centre.x + (position.getX(i) - centre.x) * r,
      centre.y + (position.getY(i) - centre.y) * r,
      centre.z + (position.getZ(i) - centre.z) * r,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Two eyes with a frown over them.
 *
 * Big, set forward, with a catch of white around a dark pupil that looks
 * straight ahead -- at you. The brow is a small wedge angled down towards
 * the nose, and it is the difference between a bird that is patrolling and a
 * bird that is *cross with you*.
 */
function eyes(
  centre: V3,
  spread: number,
  eyeRadius: number,
  palette: { white: string; pupil: string; brow: string },
): ColouredPart[] {
  const parts: ColouredPart[] = [];
  for (const side of [-1, 1] as const) {
    const x = centre[0] + side * spread;
    const [, y, z] = centre;
    // Turned out a little, the way a bird's eyes sit, but the pupil points
    // forward so the stare lands on the player.
    const yaw = side * 0.5;
    parts.push(part(new SphereGeometry(eyeRadius, 12, 10), palette.white, [x, y, z]));
    parts.push(
      part(new SphereGeometry(eyeRadius * 0.56, 10, 8), palette.pupil, [
        x + side * eyeRadius * 0.12,
        y - eyeRadius * 0.05,
        z + eyeRadius * 0.58,
      ]),
    );
    parts.push(
      part(
        new CapsuleGeometry(eyeRadius * 0.28, eyeRadius * 1.5, 3, 8),
        palette.brow,
        [x - side * eyeRadius * 0.1, y + eyeRadius * 0.95, z + eyeRadius * 0.3],
        // Lay it sideways, drop the inner end, then turn it with the face.
        [0, yaw * 0.6, Math.PI / 2 - side * 0.42],
      ),
    );
  }
  return parts;
}

/** One mesh per joint, sharing the guardian's single material. */
function jointMesh(geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function joint(position: V3): Group {
  const group = new Group();
  group.position.set(position[0], position[1], position[2]);
  return group;
}

/* ------------------------------------------------------------------------ */
/* Broody Hen                                                                */
/* ------------------------------------------------------------------------ */

const HEN = {
  body: '#a3542a',
  bodyDark: '#83401f',
  breast: '#c98848',
  hackle: '#d39a4c',
  tail: '#35291f',
  tailSheen: '#2b302a',
  wingTip: '#5e321a',
  comb: '#c2382a',
  beak: '#e3aa3a',
  leg: '#d9a441',
  white: '#f1e7d0',
  pupil: '#1d1813',
  brow: '#4a2412',
} as const;

function buildHen(
  material: Material,
  owned: BufferGeometry[],
): Omit<GuardianRig, 'root' | 'owned'> {
  const bodyY = 0.74;

  /*
   * A round breast and a tail that sweeps up behind: the hen's whole
   * silhouette is a letter U with a head on one arm of it. The old mesh had
   * the head, but the U was a horizontal lozenge, and that is what made her
   * read as a blob rather than a bird.
   */
  const tailFeathers: ColouredPart[] = [];
  const tailAngles = [0.15, 0.36, 0.57, 0.78, 0.99, 1.2];
  tailAngles.forEach((angle, i) => {
    const length = i === 0 || i === tailAngles.length - 1 ? 0.36 : 0.46;
    const base: V3 = [0, 0.1, -0.36];
    const centre: V3 = [
      (i % 2 === 0 ? -1 : 1) * 0.03,
      base[1] + Math.cos(angle) * length * 0.5,
      base[2] - Math.sin(angle) * length * 0.5,
    ];
    tailFeathers.push(
      part(
        new CapsuleGeometry(0.085, length, 3, 8),
        i % 2 === 0 ? HEN.tail : HEN.tailSheen,
        centre,
        [-angle, 0, 0],
        [0.4, 1, 1],
      ),
    );
  });

  const bodyGeo = mergeColouredParts([
    part(lumpy(0.42, 71, 0.07, 18, 14), HEN.body, [0, 0, -0.02], [-0.18, 0, 0], [0.95, 0.88, 1.18]),
    part(lumpy(0.33, 72, 0.05), HEN.breast, [0, -0.03, 0.25], [0, 0, 0], [0.95, 1, 0.9]),
    // The fluffy rump under the tail. Hens are wider at the back than you
    // would guess, and this is what stops the tail looking stuck on.
    part(lumpy(0.26, 73, 0.08), HEN.bodyDark, [0, -0.12, -0.3], [0, 0, 0], [1.1, 0.9, 1]),
    // The root of the tail, so the feathers grow out of something solid
    // rather than reading as a bunch of separate sticks.
    part(lumpy(0.2, 77, 0.06), HEN.tail, [0, 0.16, -0.42], [-0.6, 0, 0], [0.45, 1.1, 0.8]),
    // Lower neck, leaning forward into the head joint.
    part(new CylinderGeometry(0.15, 0.25, 0.34, 14), HEN.hackle, [0, 0.27, 0.32], [0.4, 0, 0]),
    ...tailFeathers,
  ]);

  const headGeo = mergeColouredParts([
    part(new CylinderGeometry(0.12, 0.16, 0.2, 12), HEN.hackle, [0, 0, -0.02]),
    part(lumpy(0.165, 74, 0.04), HEN.hackle, [0, 0.14, 0.04], [0, 0, 0], [0.9, 1, 1.1]),
    // Beak, pointing forward and a touch down.
    part(
      new ConeGeometry(0.06, 0.17, 8),
      HEN.beak,
      [0, 0.1, 0.22],
      [Math.PI / 2 + 0.28, 0, 0],
      [1, 1, 0.8],
    ),
    // The comb: the one shape nobody mistakes for anything else.
    part(new SphereGeometry(0.07, 10, 8), HEN.comb, [0, 0.3, 0.12], [0, 0, 0], [0.42, 1.15, 1]),
    part(new SphereGeometry(0.08, 10, 8), HEN.comb, [0, 0.33, 0.04], [0, 0, 0], [0.42, 1.2, 1]),
    part(new SphereGeometry(0.075, 10, 8), HEN.comb, [0, 0.32, -0.04], [0, 0, 0], [0.42, 1.15, 1]),
    part(new SphereGeometry(0.06, 10, 8), HEN.comb, [0, 0.28, -0.1], [0, 0, 0], [0.42, 1.1, 1]),
    // Wattles.
    part(
      new SphereGeometry(0.045, 10, 8),
      HEN.comb,
      [-0.028, 0.01, 0.18],
      [0, 0, 0],
      [0.6, 1.4, 0.8],
    ),
    part(
      new SphereGeometry(0.045, 10, 8),
      HEN.comb,
      [0.028, 0.01, 0.18],
      [0, 0, 0],
      [0.6, 1.4, 0.8],
    ),
    ...eyes([0, 0.18, 0.13], 0.085, 0.052, HEN),
  ]);

  const wingGeo = (side: -1 | 1): BufferGeometry =>
    mergeColouredParts([
      part(
        lumpy(0.3, 75 + side, 0.06, 14, 10),
        HEN.bodyDark,
        [side * 0.03, -0.06, -0.14],
        [-0.12, 0, 0],
        [0.28, 0.62, 1.15],
      ),
      ...[0, 1, 2].map((i) =>
        part(
          new CapsuleGeometry(0.05, 0.26, 3, 8),
          HEN.wingTip,
          [side * 0.05, -0.08 - i * 0.05, -0.4 - i * 0.02],
          [-Math.PI / 2 + 0.2 + i * 0.12, 0, 0],
          [0.4, 1, 1],
        ),
      ),
    ]);

  const legGeo = mergeColouredParts([
    // Feathered trousers, then a bare yellow shank.
    part(lumpy(0.13, 76, 0.08), HEN.body, [0, 0.02, 0], [0, 0, 0], [0.9, 1.15, 1]),
    part(new CylinderGeometry(0.032, 0.038, 0.36, 8), HEN.leg, [0, -0.26, 0.02]),
    ...[-0.5, 0, 0.5].map((yaw) =>
      part(
        new CapsuleGeometry(0.024, 0.13, 3, 6),
        HEN.leg,
        [Math.sin(yaw) * 0.08, -0.43, 0.02 + Math.cos(yaw) * 0.08],
        [Math.PI / 2, yaw, 0],
      ),
    ),
    part(new CapsuleGeometry(0.022, 0.08, 3, 6), HEN.leg, [0, -0.43, -0.05], [Math.PI / 2, 0, 0]),
  ]);

  owned.push(bodyGeo, headGeo, legGeo);

  const body = joint([0, bodyY, 0]);
  body.add(jointMesh(bodyGeo, material));

  const head = joint([0, 0.46, 0.4]);
  head.add(jointMesh(headGeo, material));
  body.add(head);

  const arms = ([-1, 1] as const).map((side) => {
    const geo = wingGeo(side);
    owned.push(geo);
    const wing = joint([side * 0.34, 0.1, 0.1]);
    wing.add(jointMesh(geo, material));
    body.add(wing);
    return wing;
  });

  const legs = ([-1, 1] as const).map((side) => {
    const hip = joint([side * 0.15, 0.46, 0.02]);
    hip.add(jointMesh(legGeo, material));
    return hip;
  });

  return {
    body,
    bodyBaseY: bodyY,
    head,
    legs,
    gait: 'stride',
    arms,
    armStyle: 'wing',
    tail: null,
    lean: 0.3,
    charge: -0.18,
    thrust: 0.12,
    headBaseZ: head.position.z,
    armSpread: 0.8,
    armBeat: 0.35,
    height: bodyY + 0.46 + 0.42,
  };
}

/* ------------------------------------------------------------------------ */
/* Sentinel Swan                                                             */
/* ------------------------------------------------------------------------ */

/* Not pure white: the lake throws a lot of light and a #fff swan blooms. */
const SWAN = {
  body: '#e9ece8',
  shade: '#d2d8d6',
  wingTip: '#bfc7c9',
  beak: '#df7428',
  mask: '#25221f',
  leg: '#2c2926',
  white: '#f3efe3',
  pupil: '#1a1714',
  brow: '#25221f',
} as const;

function buildSwan(
  material: Material,
  owned: BufferGeometry[],
): Omit<GuardianRig, 'root' | 'owned'> {
  const bodyY = 0.7;

  const bodyGeo = mergeColouredParts([
    // Boat-shaped hull: long, low, and deeper at the chest than the stern.
    part(lumpy(0.5, 81, 0.045, 20, 14), SWAN.body, [0, 0, -0.04], [0, 0, 0], [0.8, 0.62, 1.4]),
    part(lumpy(0.36, 82, 0.04), SWAN.body, [0, 0.03, 0.44], [0, 0, 0], [0.9, 1, 0.9]),
    // Tail, cocked up at the back.
    part(
      new ConeGeometry(0.2, 0.42, 10),
      SWAN.shade,
      [0, 0.12, -0.74],
      [-Math.PI / 2 + 0.42, 0, 0],
      [1, 1, 0.55],
    ),
  ]);

  /*
   * The neck is the swan. An S-curve that leans back over the body and then
   * forward to the head, tapering as it goes -- and during a charge the
   * whole thing pitches forward from the base, which is exactly what an
   * angry swan does.
   */
  const neck: V3[] = [
    [0, -0.04, -0.04],
    [0, 0.2, 0.1],
    [0, 0.44, 0.08],
    [0, 0.63, -0.02],
    [0, 0.78, 0.03],
    [0, 0.85, 0.13],
  ];
  const headGeo = mergeColouredParts([
    { geometry: taperedTube(neck, 0.135, 0.068), colour: SWAN.body },
    part(lumpy(0.1, 83, 0.03), SWAN.body, [0, 0.86, 0.17], [0, 0, 0], [0.85, 0.9, 1.25]),
    // The black mask and knob, then the orange bill.
    part(new SphereGeometry(0.046, 10, 8), SWAN.mask, [0, 0.845, 0.27], [0, 0, 0], [1.2, 0.8, 1]),
    part(new SphereGeometry(0.03, 10, 8), SWAN.mask, [0, 0.885, 0.29]),
    part(
      new ConeGeometry(0.048, 0.2, 8),
      SWAN.beak,
      [0, 0.83, 0.36],
      [Math.PI / 2 + 0.36, 0, 0],
      [1, 1, 0.7],
    ),
    // Eyes on the white of the head, above and behind the mask. Set on the
    // black they read as a pair of spectacles.
    ...eyes([0, 0.905, 0.19], 0.064, 0.034, SWAN),
  ]);

  const wingGeo = (side: -1 | 1): BufferGeometry =>
    mergeColouredParts([
      part(
        lumpy(0.4, 84 + side, 0.05, 16, 10),
        SWAN.shade,
        [side * 0.02, 0.03, -0.28],
        [0.2, 0, 0],
        [0.26, 0.44, 1.3],
      ),
      // The rear of the wing cocked up over the back, the way a mute swan
      // carries it when it is cross. One solid lobe: separate feathers at
      // this size read as a wire handle.
      part(
        lumpy(0.26, 86 + side, 0.05, 14, 10),
        SWAN.wingTip,
        [side * 0.03, 0.16, -0.62],
        [0.75, 0, 0],
        [0.28, 0.5, 1.1],
      ),
    ]);

  const legGeo = mergeColouredParts([
    part(new CylinderGeometry(0.034, 0.042, 0.32, 8), SWAN.leg, [0, -0.18, 0]),
    // A webbed paddle: a three-sided cone, flattened.
    part(
      new ConeGeometry(0.14, 0.24, 3),
      SWAN.leg,
      [0, -0.345, 0.1],
      [Math.PI / 2, 0, 0],
      [1, 1, 0.16],
    ),
  ]);

  owned.push(bodyGeo, headGeo, legGeo);

  const body = joint([0, bodyY, 0]);
  body.add(jointMesh(bodyGeo, material));

  const head = joint([0, 0.2, 0.6]);
  head.add(jointMesh(headGeo, material));
  body.add(head);

  const arms = ([-1, 1] as const).map((side) => {
    const geo = wingGeo(side);
    owned.push(geo);
    const wing = joint([side * 0.3, 0.2, 0.22]);
    wing.add(jointMesh(geo, material));
    body.add(wing);
    return wing;
  });

  const legs = ([-1, 1] as const).map((side) => {
    const hip = joint([side * 0.17, 0.36, -0.04]);
    hip.add(jointMesh(legGeo, material));
    return hip;
  });

  return {
    body,
    bodyBaseY: bodyY,
    head,
    legs,
    gait: 'stride',
    arms,
    armStyle: 'wing',
    tail: null,
    lean: 0.2,
    charge: 0.42,
    thrust: 0.06,
    headBaseZ: head.position.z,
    armSpread: 0.42,
    armBeat: 0.12,
    height: bodyY + 0.2 + 0.95,
  };
}

/* ------------------------------------------------------------------------ */
/* Dune Scorpion                                                             */
/* ------------------------------------------------------------------------ */

const SCORPION = {
  shell: '#bf8246',
  band: '#8a582c',
  under: '#dab076',
  leg: '#6c4826',
  claw: '#a8683a',
  bulb: '#5a3a22',
  white: '#f2e8d4',
  pupil: '#1c1712',
  brow: '#3a2414',
} as const;

function buildScorpion(
  material: Material,
  owned: BufferGeometry[],
): Omit<GuardianRig, 'root' | 'owned'> {
  const bodyY = 0.42;

  const bodyGeo = mergeColouredParts([
    part(lumpy(0.36, 91, 0.05, 18, 12), SCORPION.shell, [0, 0, 0.2], [0, 0, 0], [1, 0.55, 1.05]),
    // Banded abdomen, each plate a shade apart so the segments read.
    ...[0, 1, 2, 3].map((i) =>
      part(
        lumpy(0.34 - i * 0.035, 92 + i, 0.04, 16, 10),
        i % 2 === 0 ? SCORPION.band : SCORPION.shell,
        [0, 0.02 - i * 0.01, -0.12 - i * 0.2],
        [0, 0, 0],
        [1, 0.55, 0.62],
      ),
    ),
    part(
      new SphereGeometry(0.3, 14, 10),
      SCORPION.under,
      [0, -0.09, -0.1],
      [0, 0, 0],
      [0.95, 0.35, 1.7],
    ),
    // Eyes up on top of the carapace, big and forward: this is the face.
    ...eyes([0, 0.19, 0.4], 0.12, 0.075, SCORPION),
  ]);

  /*
   * The tail arcs up and over, segment by segment, and ends in a round bulb.
   * A real scorpion's sting is the one thing on it a child already knows to
   * be afraid of, and this game does not get to borrow that fear.
   */
  const R = 0.32;
  const tailSegments: ColouredPart[] = [];
  const count = 7;
  for (let k = 0; k < count; k++) {
    const theta = 0.3 + (k / (count - 1)) * 3.25;
    const radius = 0.14 - k * 0.009;
    tailSegments.push(
      part(lumpy(radius, 100 + k, 0.05, 12, 10), k % 2 === 0 ? SCORPION.shell : SCORPION.band, [
        0,
        R - Math.cos(theta) * R,
        -Math.sin(theta) * R,
      ]),
    );
  }
  const tipTheta = 3.95;
  tailSegments.push(
    part(lumpy(0.12, 110, 0.04), SCORPION.bulb, [
      0,
      R - Math.cos(tipTheta) * R,
      -Math.sin(tipTheta) * R,
    ]),
  );
  const tailGeo = mergeColouredParts(tailSegments);

  const finger = (wrist: V3, side: -1 | 1, outer: 1 | -1, radius: number): ColouredPart[] => {
    const x = wrist[0] + side * outer * 0.06;
    const y = wrist[1] - (outer === 1 ? 0 : 0.015);
    const z = wrist[2] + 0.2;
    const knuckle: V3 = [x + side * outer * 0.04, y, z + 0.14];
    const tip: V3 = [x - side * outer * 0.03, y, z + 0.26];
    return [
      limb([x, y, z], knuckle, radius, SCORPION.claw),
      limb(knuckle, tip, radius * 0.8, SCORPION.bulb),
    ];
  };

  const clawGeo = (side: -1 | 1): BufferGeometry => {
    const elbow: V3 = [side * 0.2, 0.04, 0.22];
    const wrist: V3 = [side * 0.14, 0.06, 0.5];
    return mergeColouredParts([
      limb([0, 0, 0], elbow, 0.06, SCORPION.claw),
      limb(elbow, wrist, 0.055, SCORPION.claw),
      part(
        lumpy(0.17, 111 + side, 0.05),
        SCORPION.claw,
        [wrist[0], wrist[1], wrist[2] + 0.1],
        [0, 0, 0],
        [0.8, 0.62, 1.2],
      ),
      // Two fingers in an open V, hooked in at the ends and rounded off. A
      // pincer is recognisable from its shape; it does not need a point.
      ...finger(wrist, side, 1, 0.062),
      ...finger(wrist, side, -1, 0.052),
    ]);
  };

  /*
   * Eight legs in two sets of four, alternating -- left one, right two, left
   * three, right four -- which is how the real thing walks, and which keeps
   * eight legs to two draw calls.
   */
  const legSet = (phase: 0 | 1): BufferGeometry => {
    const parts: ColouredPart[] = [];
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1] as const) {
        const sideIndex = side === -1 ? 0 : 1;
        if ((i + sideIndex) % 2 !== phase) continue;
        // Front legs reach forward and back legs trail, so from the side
        // they read as legs rather than as a table.
        const splay = (1.5 - i) * 0.32;
        const hip: V3 = [side * 0.24, 0, 0.34 - i * 0.22];
        const knee: V3 = [side * 0.46, 0.18, hip[2] + splay * 0.6];
        const foot: V3 = [side * 0.64, -bodyY + 0.04, hip[2] + splay];
        parts.push(limb(hip, knee, 0.05, SCORPION.leg), limb(knee, foot, 0.042, SCORPION.leg));
      }
    }
    return mergeColouredParts(parts);
  };

  owned.push(bodyGeo, tailGeo);

  const body = joint([0, bodyY, 0]);
  body.add(jointMesh(bodyGeo, material));

  const tail = joint([0, 0.04, -0.78]);
  tail.add(jointMesh(tailGeo, material));
  body.add(tail);

  const arms = ([-1, 1] as const).map((side) => {
    const geo = clawGeo(side);
    owned.push(geo);
    const arm = joint([side * 0.22, -0.02, 0.44]);
    arm.add(jointMesh(geo, material));
    body.add(arm);
    return arm;
  });

  const legs = ([0, 1] as const).map((phase) => {
    const geo = legSet(phase);
    owned.push(geo);
    const set = joint([0, bodyY, 0]);
    set.add(jointMesh(geo, material));
    return set;
  });

  return {
    body,
    bodyBaseY: bodyY,
    head: null,
    legs,
    gait: 'scuttle',
    arms,
    armStyle: 'claw',
    tail,
    lean: 0.08,
    charge: 0,
    thrust: 0,
    headBaseZ: 0,
    armSpread: 0.14,
    armBeat: 0.08,
    height: bodyY + 0.04 + 2 * R + 0.14,
  };
}

/* ------------------------------------------------------------------------ */

const BUILDERS: Record<
  GuardianSpecies,
  (material: Material, owned: BufferGeometry[]) => Omit<GuardianRig, 'root' | 'owned'>
> = {
  hen: buildHen,
  swan: buildSwan,
  scorpion: buildScorpion,
};

export function buildGuardian(species: GuardianSpecies, scale = 1): GuardianRig {
  /*
   * One material for the whole animal; colour rides on the vertices. The
   * roughness map is a whisper, as on the ranger -- enough that feathers and
   * shell do not go plastic in a low sun.
   */
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: species === 'scorpion' ? 0.62 : 0.8,
    roughnessMap: roughnessMap(`guardian-${species}`, 0.8, 0.12, 128),
  });
  const geometries: BufferGeometry[] = [];
  const rig = BUILDERS[species](material, geometries);

  const root = new Group();
  root.scale.setScalar(scale);
  root.add(rig.body, ...rig.legs);

  return { ...rig, root, owned: [material, ...geometries] };
}

export function disposeGuardian(rig: GuardianRig): void {
  for (const item of rig.owned) item.dispose();
  rig.owned.length = 0;
}
