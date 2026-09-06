/**
 * The ranger's geometry: one merged buffer per moving joint.
 *
 * A person needs a lot of small pieces -- a jaw, a brow, a rolled cuff, a boot
 * sole -- and each one written as its own `<mesh>` is its own draw call, paid
 * again for every shadow cascade. Built that way this character came to about
 * a hundred draw calls, which took the High preset to 446 against a budget of
 * 450. Four calls of headroom is not a budget, it is a coincidence.
 *
 * So the pieces are baked, exactly as the nests and the fences are, with one
 * addition: a per-vertex colour, so skin, cloth, leather and hair can share a
 * single material and therefore a single draw. Merging can only go as far as
 * the next thing that has to move independently, so there is one buffer per
 * joint -- hips, chest, head, and a thigh, shin, upper arm and forearm a side.
 * Twelve nodes for forty-nine pieces.
 *
 * Everything is in metres, measured from its own joint, and the proportions
 * come from `rangerProportions.ts` where they are asserted against the physics
 * capsule.
 */

import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeColouredParts, type ColouredPart } from '../entities/mergeParts';
import { RANGER } from './rangerProportions';

/* No pure black and no pure white anywhere. */
const SKIN = '#b98a68';
const HAIR = '#3b2a1d';
const SHIRT = '#5d7a5a';
const SHIRT_DARK = '#48604a';
/**
 * Dark enough to hold its value in full sun.
 *
 * A desaturated mid-tone is the first thing an exposed, tone-mapped highlight
 * eats: at #4a4436 the trousers matched the ranger's own forearms under a low
 * dawn sun and the whole lower body flattened into one shape.
 */
const TROUSER = '#332f27';
const BELT = '#4a3626';
const BUCKLE = '#a8925e';
const BOOT = '#2b2119';
const SOLE = '#1b1611';
const HAT = '#7a6a4a';
const HATBAND = '#4a3626';
const PACK = '#8a6a44';
const EYE_WHITE = '#e6ded2';
const IRIS = '#3d3122';
const MOUTH = '#8f5f4c';

/** Position, and optionally rotate, one primitive within its joint. */
function at(
  geometry: BufferGeometry,
  colour: string,
  x: number,
  y: number,
  z: number,
  rotation?: [number, number, number],
): ColouredPart {
  const matrix = new Matrix4();
  if (rotation !== undefined) {
    matrix.makeRotationFromEuler(new Euler(rotation[0], rotation[1], rotation[2]));
  }
  matrix.setPosition(new Vector3(x, y, z));
  return { geometry, colour, matrix };
}

/** Hip block: pelvis, belt, buckle. */
export function hipsGeometry(): BufferGeometry {
  return mergeColouredParts([
    at(new CapsuleGeometry(0.124, 0.1, 4, 12), TROUSER, 0, 0.03, 0),
    at(new CylinderGeometry(0.131, 0.131, 0.045, 14), BELT, 0, 0.11, 0),
    at(new BoxGeometry(0.05, 0.045, 0.016), BUCKLE, 0, 0.11, 0.127),
  ]);
}

/**
 * Chest: waist, ribcage, shoulder caps, collar.
 *
 * Two stacked tapers rather than one capsule. A person is narrow at the navel
 * and broad across the chest, and that change of width is what makes a torso
 * read as a ribcage rather than as a tube.
 */
export function chestGeometry(): BufferGeometry {
  const shoulder = RANGER.shoulderHalfWidth - 0.016;
  return mergeColouredParts([
    at(new CylinderGeometry(0.157, 0.127, 0.24, 14), SHIRT, 0, 0.2, 0),
    at(new CylinderGeometry(0.152, 0.163, 0.15, 14), SHIRT, 0, 0.38, 0),
    at(new SphereGeometry(0.062, 12, 10), SHIRT, -shoulder, RANGER.hipToShoulder, 0),
    at(new SphereGeometry(0.062, 12, 10), SHIRT, shoulder, RANGER.hipToShoulder, 0),
    // Open collar: two facets, enough to break the neckline.
    at(new BoxGeometry(0.15, 0.07, 0.012), SHIRT_DARK, 0, 0.47, 0.05, [0.35, 0, 0]),
    // Neck. Short, but a head straight on a torso is a snowman.
    at(new CylinderGeometry(0.049, 0.056, 0.1, 10), SKIN, 0, 0.545, -0.005),
  ]);
}

/** The satchel, so the silhouette reads from behind as well as in front. */
export function satchelGeometry(): BufferGeometry {
  return mergeColouredParts([
    at(new BoxGeometry(0.25, 0.27, 0.11), PACK, 0, 0.24, -0.19),
    at(new BoxGeometry(0.26, 0.055, 0.115), BELT, 0, 0.32, -0.19),
  ]);
}

/**
 * Skull, jaw, features, hair, hat.
 *
 * The features are two-millimetre details on a twenty-centimetre head and
 * would be indefensible as thirteen separate draws. Merged, they are free, and
 * they are most of what stops the head reading as a ball.
 */
export function headGeometry(): BufferGeometry {
  const r = RANGER.skullRadius;
  return mergeColouredParts([
    at(new SphereGeometry(r, 18, 16), SKIN, 0, 0, 0),
    // Jaw. A skull alone is a ball; the taper to a chin is the face.
    at(new CapsuleGeometry(r * 0.62, r * 0.32, 4, 12), SKIN, 0, -r * 0.62, 0.012),

    // Eyes: sclera, then an iris set into it. Never pure white.
    at(new SphereGeometry(0.021, 10, 8), EYE_WHITE, -0.038, 0.012, r * 0.86),
    at(new SphereGeometry(0.021, 10, 8), EYE_WHITE, 0.038, 0.012, r * 0.86),
    at(new SphereGeometry(0.012, 8, 8), IRIS, -0.038, 0.012, r * 0.86 + 0.012),
    at(new SphereGeometry(0.012, 8, 8), IRIS, 0.038, 0.012, r * 0.86 + 0.012),

    // Brows. Two small bars, and the face stops looking startled.
    at(new BoxGeometry(0.042, 0.011, 0.014), HAIR, -0.038, 0.042, r * 0.88, [0, 0, -0.12]),
    at(new BoxGeometry(0.042, 0.011, 0.014), HAIR, 0.038, 0.042, r * 0.88, [0, 0, 0.12]),

    // Nose and mouth: shallow, but they give the profile something to do.
    at(new CapsuleGeometry(0.016, 0.03, 3, 8), SKIN, 0, -0.022, r * 0.92, [0.35, 0, 0]),
    at(new BoxGeometry(0.036, 0.008, 0.01), MOUTH, 0, -0.068, r * 0.84),

    at(new CapsuleGeometry(0.017, 0.026, 3, 8), SKIN, -r * 0.94, -0.004, 0, [0, 0, 0.2]),
    at(new CapsuleGeometry(0.017, 0.026, 3, 8), SKIN, r * 0.94, -0.004, 0, [0, 0, -0.2]),

    // Hair at the back and sides, where the hat does not cover.
    at(
      new SphereGeometry(r * 1.03, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
      HAIR,
      0,
      -0.012,
      -0.016,
    ),
    at(new CapsuleGeometry(r * 0.6, 0.04, 4, 12), HAIR, 0, -0.05, -r * 0.5),

    // Ranger hat: the strongest single silhouette cue we have.
    at(new CylinderGeometry(0.098, 0.115, 0.115, 14), HAT, 0, 0.082, 0),
    at(new CylinderGeometry(0.118, 0.118, 0.026, 14), HATBAND, 0, 0.036, 0),
    at(new CylinderGeometry(0.215, 0.215, 0.02, 20), HAT, 0, 0.03, 0),
  ]);
}

/** Thigh, hanging from the hip joint. */
export function thighGeometry(): BufferGeometry {
  return mergeColouredParts([
    at(new CapsuleGeometry(0.077, RANGER.thigh - 0.13, 4, 10), TROUSER, 0, -RANGER.thigh / 2, 0),
  ]);
}

/** Shin, turn-up, ankle and boot, hanging from the knee. */
export function shinGeometry(): BufferGeometry {
  const { shin, ankleHeight } = RANGER;
  return mergeColouredParts([
    at(new CapsuleGeometry(0.063, shin - 0.16, 4, 10), TROUSER, 0, -shin / 2 + 0.02, 0),
    // Turn-up: where the trouser stops and the boot starts.
    at(new CylinderGeometry(0.077, 0.077, 0.05, 10), '#2a2620', 0, -shin + 0.09, 0),
    at(new CapsuleGeometry(0.062, 0.06, 4, 8), BOOT, 0, -shin + 0.04, 0),
    at(new BoxGeometry(0.105, 0.085, 0.225), BOOT, 0, -shin + ankleHeight * 0.5, 0.045),
    at(new BoxGeometry(0.112, 0.028, 0.235), SOLE, 0, -shin + 0.014, 0.045),
  ]);
}

/** Upper arm, hanging from the shoulder joint. */
export function upperArmGeometry(): BufferGeometry {
  return mergeColouredParts([
    at(new CapsuleGeometry(0.049, RANGER.upperArm - 0.1, 4, 8), SHIRT, 0, -RANGER.upperArm / 2, 0),
  ]);
}

/**
 * Rolled cuff, forearm and hand, hanging from the elbow.
 *
 * The sleeve stops at the elbow so the forearm is skin: that gives the arm two
 * values instead of one, which is most of what makes it read as an arm. The
 * hand is a flattened box rather than a sphere -- the flat reads as a palm
 * even at twenty metres, where a ball reads as a mitten.
 */
export function forearmGeometry(): BufferGeometry {
  const { forearm, hand } = RANGER;
  return mergeColouredParts([
    at(new CylinderGeometry(0.053, 0.048, 0.055, 10), SHIRT_DARK, 0, -0.03, 0),
    at(new CapsuleGeometry(0.041, forearm - 0.11, 4, 8), SKIN, 0, -forearm / 2 - 0.02, 0),
    at(new BoxGeometry(0.052, hand, 0.075), SKIN, 0, -forearm - hand * 0.42, 0.008),
  ]);
}
