import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../../src/data/balance';
import { RANGER, rangerHeadHeight, rangerHeight } from '../../src/render/player/rangerProportions';

/**
 * The ranger is a person, asserted rather than eyeballed.
 *
 * The first version was 1.45 m tall with a head a fifth of his own height and
 * stood twenty centimetres shorter than the capsule the solver pushed around.
 * Neither of those is visible in a screenshot taken from ten metres away, and
 * both of them are the reason he read as a toy.
 */

/** Sole to crown of the physics capsule the movement solver actually uses. */
const CAPSULE_HEIGHT = MOVEMENT.capsuleHeight + MOVEMENT.capsuleRadius * 2;

describe('the ranger', () => {
  it('is the same height as the capsule the solver pushes around', () => {
    // Within a hat's brim. Any further apart and the collider and the picture
    // disagree about what fits under a branch.
    expect(Math.abs(rangerHeight() - CAPSULE_HEIGHT)).toBeLessThan(0.1);
  });

  it('is between seven and eight heads tall', () => {
    const heads = rangerHeight() / rangerHeadHeight();
    expect(heads).toBeGreaterThan(7);
    expect(heads).toBeLessThan(8);
  });

  it('stands with its feet on the ground', () => {
    // Hip joint, thigh, shin and ankle have to add back up to the hip height,
    // or the ranger hovers or sinks -- and the solver reports the feet at the
    // root, so there is nothing else to absorb the error.
    const legToSole = RANGER.thigh + RANGER.shin + RANGER.ankleHeight;
    expect(legToSole, 'the leg does not reach the ground').toBeCloseTo(RANGER.hipHeight, 2);
  });

  it('has arms whose fingertips reach mid-thigh', () => {
    const shoulderHeight = RANGER.hipHeight + RANGER.hipToShoulder;
    const fingertip = shoulderHeight - (RANGER.upperArm + RANGER.forearm + RANGER.hand);
    const knee = RANGER.hipHeight - RANGER.thigh;
    expect(fingertip, 'arms too short').toBeLessThan(RANGER.hipHeight);
    expect(fingertip, 'arms hang past the knee').toBeGreaterThan(knee);
  });

  it('loses as much height crouching as the capsule does', () => {
    const capsuleDrop = MOVEMENT.capsuleHeight - MOVEMENT.crouchCapsuleHeight;
    // The legs fold as well as the hips dropping, so the mesh does not have to
    // find all of it in one number -- but it has to find most of it.
    expect(RANGER.crouchDrop).toBeGreaterThan(capsuleDrop * 0.6);
    expect(RANGER.crouchDrop).toBeLessThan(capsuleDrop);
  });
});
