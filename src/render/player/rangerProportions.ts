/**
 * The ranger's skeleton, in metres.
 *
 * Separated from the mesh so it can be asserted rather than eyeballed. The
 * previous ranger was 1.45 m tall with a head a fifth of his own height --
 * five and a half heads, which is roughly a toddler's proportion and reads as
 * a toy. He also stood twenty centimetres shorter than the capsule the
 * movement solver was pushing around, so the collider and the character were
 * two different people.
 *
 * These numbers are a plain adult: seven and a half heads, hips at just over
 * half the total height, arms whose fingertips reach mid-thigh. `feetToCrown`
 * matches the physics capsule, which is what makes doorways, fences and
 * guardians the size they look.
 *
 * Everything below the shoulders is measured from the hip joint, and
 * everything in the arm from the shoulder joint, because that is how the
 * groups are nested.
 */
export const RANGER = {
  /** Hip joint height above the soles. */
  hipHeight: 0.89,

  /** Hip joint down to the knee. */
  thigh: 0.44,
  /** Knee down to the ankle. */
  shin: 0.38,
  /** Ankle down to the ground. */
  ankleHeight: 0.07,
  /** Half the distance between the two hip joints. */
  hipHalfWidth: 0.095,

  /** Hip joint up to the shoulder joint. */
  hipToShoulder: 0.46,
  /** Half the distance between the two shoulder joints. */
  shoulderHalfWidth: 0.19,
  /** Shoulder joint down to the elbow. */
  upperArm: 0.29,
  /** Elbow down to the wrist. */
  forearm: 0.26,
  /** Wrist to fingertip. */
  hand: 0.09,

  /** Hip joint up to the centre of the skull. */
  hipToHeadCentre: 0.69,
  /** Radius of the skull sphere. */
  skullRadius: 0.105,

  /**
   * How far the hips drop when crouching.
   *
   * The capsule shrinks from 0.95 to 0.5, and the character has to visibly
   * lose the same height or the collider and the picture disagree about
   * whether he fits under something.
   */
  crouchDrop: 0.34,
} as const;

/** Sole to the top of the skull. */
export function rangerHeight(): number {
  return RANGER.hipHeight + RANGER.hipToHeadCentre + RANGER.skullRadius;
}

/** Chin to crown, the unit classical proportion is counted in. */
export function rangerHeadHeight(): number {
  // The jaw hangs a little below the skull sphere.
  return RANGER.skullRadius * 2 + 0.025;
}
