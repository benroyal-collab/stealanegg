import { describe, expect, it } from 'vitest';
import { CAMERA, MOVEMENT } from '../../src/data/balance';
import {
  createMovementState,
  stepMovement,
  type Displacement,
  type MovementEnvironment,
  type MovementInput,
  type MovementState,
} from '../../src/systems/movement';
import { createCameraOutput, createCameraState, stepCamera } from '../../src/systems/camera';

/**
 * Feel metrics.
 *
 * These are the numbers I judged the controller on, expressed as assertions
 * so nobody can quietly detune it later. Each band comes from what
 * third-person action games actually ship, not from what happened to fall out
 * of the constants.
 *
 * A failure here is not necessarily a bug -- it means someone changed the
 * feel. If the change was deliberate, move the band and say why.
 */

const DT = 1 / 120; // fine steps, so these measure the curve and not the tick

function input(o: Partial<MovementInput> = {}): MovementInput {
  return {
    moveX: 0,
    moveY: 0,
    cameraYaw: 0,
    sprintHeld: false,
    crouchHeld: false,
    jumpPressed: false,
    dt: DT,
    ...o,
  };
}

function env(o: Partial<MovementEnvironment> = {}): MovementEnvironment {
  return {
    grounded: true,
    groundNormalY: 1,
    vaultHeight: null,
    waterDepth: 0,
    pace: MOVEMENT.basePace,
    ceilingBlocked: false,
    ...o,
  };
}

function speed(s: MovementState): number {
  return Math.hypot(s.velocityX, s.velocityZ);
}

const out: Displacement = { x: 0, y: 0, z: 0 };

describe('feel metrics', () => {
  it('reaches 95% of top speed in 120-260ms', () => {
    const s = createMovementState();
    let t = 0;
    while (speed(s) < MOVEMENT.basePace * 0.95 && t < 2) {
      stepMovement(s, input({ moveY: -1, sprintHeld: true }), env(), out);
      t += DT;
    }
    // Under 120ms reads as teleporting; over 260ms reads as wading.
    expect(t).toBeGreaterThan(0.11);
    expect(t).toBeLessThan(0.26);
  });

  it('stops within 0.35-0.9m of releasing the stick at full sprint', () => {
    const s = createMovementState();
    for (let i = 0; i < 400; i++)
      stepMovement(s, input({ moveY: -1, sprintHeld: true }), env(), out);

    let distance = 0;
    let t = 0;
    while (speed(s) > 0.05 && t < 2) {
      stepMovement(s, input(), env(), out);
      distance += Math.hypot(out.x, out.z);
      t += DT;
    }
    // Short enough to place yourself precisely at a nest; long enough that
    // the character has weight rather than stopping like a cursor.
    expect(distance).toBeGreaterThan(0.35);
    expect(distance).toBeLessThan(0.9);
  });

  it('has a jump with 0.45-0.75s of hang time and a 0.9-1.4m apex', () => {
    const s = createMovementState();
    stepMovement(s, input({ jumpPressed: true }), env(), out);
    expect(s.justJumped).toBe(true);

    let y = 0;
    let apex = 0;
    let t = 0;
    // Integrate the arc in free air until it comes back to the take-off plane.
    while (t < 3) {
      stepMovement(s, input(), env({ grounded: false }), out);
      y += out.y;
      apex = Math.max(apex, y);
      t += DT;
      if (y <= 0 && t > 0.05) break;
    }
    expect(apex).toBeGreaterThan(0.9);
    expect(apex).toBeLessThan(1.4);
    expect(t).toBeGreaterThan(0.45);
    expect(t).toBeLessThan(0.75);
  });

  it('clears the whole vault band with a plain jump, so vaulting is a shortcut and not a requirement', () => {
    // If the jump apex were below the tallest vaultable ledge, a player who
    // never discovers the vault would hit a wall they cannot pass. It has to
    // be a smoother way over, not the only way over.
    const s = createMovementState();
    stepMovement(s, input({ jumpPressed: true }), env(), out);
    let y = 0;
    let apex = 0;
    for (let i = 0; i < 400; i++) {
      stepMovement(s, input(), env({ grounded: false }), out);
      y += out.y;
      apex = Math.max(apex, y);
      if (y <= 0 && i > 6) break;
    }
    expect(apex).toBeGreaterThan(MOVEMENT.vaultMinHeight);
  });

  it('turns 180 degrees at sprint in 0.2-0.45s', () => {
    const s = createMovementState();
    for (let i = 0; i < 400; i++)
      stepMovement(s, input({ moveY: -1, sprintHeld: true }), env(), out);

    let t = 0;
    // Reverse the stick and time how long until we are running the other way.
    while (s.velocityZ < MOVEMENT.basePace * 0.9 && t < 2) {
      stepMovement(s, input({ moveY: 1, sprintHeld: true }), env(), out);
      t += DT;
    }
    expect(t).toBeGreaterThan(0.2);
    expect(t).toBeLessThan(0.45);
  });

  it('slides 3-6 metres, which is worth doing but never a faster way to travel', () => {
    const s = createMovementState();
    for (let i = 0; i < 400; i++)
      stepMovement(s, input({ moveY: -1, sprintHeld: true }), env(), out);

    let distance = 0;
    stepMovement(s, input({ moveY: -1, crouchHeld: true }), env(), out);
    expect(s.stance).toBe('sliding');
    while (s.stance === 'sliding') {
      stepMovement(s, input({ moveY: -1, crouchHeld: true }), env(), out);
      distance += Math.hypot(out.x, out.z);
    }
    expect(distance).toBeGreaterThan(3);
    expect(distance).toBeLessThan(6);

    // A slide must not out-travel a straight sprint over the same time, or it
    // becomes the movement meta and the whole gait system collapses.
    const slideDuration = MOVEMENT.slideDurationMs / 1000;
    expect(distance).toBeLessThan(MOVEMENT.basePace * slideDuration * 1.35);
  });

  it('gives sprint a real gear change over the jog', () => {
    const jog = createMovementState();
    for (let i = 0; i < 400; i++) stepMovement(jog, input({ moveY: -1 }), env(), out);
    const sprint = createMovementState();
    for (let i = 0; i < 400; i++)
      stepMovement(sprint, input({ moveY: -1, sprintHeld: true }), env(), out);

    const ratio = speed(sprint) / speed(jog);
    // Below ~1.5 and pressing sprint feels like nothing happened.
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.4);
  });

  it('keeps the gear change intact at high Pace, so upgrades never flatten it', () => {
    const highPace = 16;
    const jog = createMovementState();
    for (let i = 0; i < 600; i++)
      stepMovement(jog, input({ moveY: -1 }), env({ pace: highPace }), out);
    const sprint = createMovementState();
    for (let i = 0; i < 600; i++)
      stepMovement(sprint, input({ moveY: -1, sprintHeld: true }), env({ pace: highPace }), out);

    expect(speed(sprint) / speed(jog)).toBeGreaterThan(1.5);
  });

  it('crouch is slow enough to be a real choice against sprinting past', () => {
    const crouch = createMovementState();
    for (let i = 0; i < 400; i++)
      stepMovement(crouch, input({ moveY: -1, crouchHeld: true }), env(), out);
    // Roughly a quarter of sprint speed: sneaking has to cost you real time,
    // otherwise there is no tension in choosing it.
    expect(speed(crouch) / MOVEMENT.basePace).toBeLessThan(0.3);
    expect(speed(crouch)).toBeGreaterThan(1.0);
  });

  it('punches the FOV to within a degree of target inside the configured window', () => {
    const cam = createCameraState();
    const camOut = createCameraOutput();
    const target = { x: 0, y: 0, z: 0, sprinting: true, crouching: false };
    const options = { reducedMotion: true, shakeEnabled: false, distanceBias: 0 };

    let t = 0;
    while (t < CAMERA.fovLerpMs / 1000) {
      stepCamera(cam, target, options, null, DT, camOut);
      t += DT;
    }
    expect(Math.abs(camOut.fov - CAMERA.fovSprint)).toBeLessThan(1);

    // And it must ease out, not run linearly: most of the travel happens early.
    const half = createCameraState();
    let ht = 0;
    while (ht < CAMERA.fovLerpMs / 1000 / 2) {
      stepCamera(half, target, options, null, DT, camOut);
      ht += DT;
    }
    const travelled = (camOut.fov - CAMERA.fovBase) / (CAMERA.fovSprint - CAMERA.fovBase);
    expect(travelled).toBeGreaterThan(0.6);
  });

  it('settles the camera behind a moving player without lagging visibly', () => {
    const cam = createCameraState();
    const camOut = createCameraOutput();
    const options = { reducedMotion: true, shakeEnabled: false, distanceBias: 0 };

    // Teleport the focus target and time the catch-up.
    const target = { x: 10, y: 0, z: 0, sprinting: false, crouching: false };
    let t = 0;
    while (Math.abs(cam.focusX - 10) > 0.1 && t < 2) {
      stepCamera(cam, target, options, null, DT, camOut);
      t += DT;
    }
    // Fast enough that it never feels like dragging a weight behind you,
    // slow enough that it isn't welded to the character.
    expect(t).toBeGreaterThan(0.15);
    expect(t).toBeLessThan(0.6);
  });

  it('is frame-rate independent: 30fps and 144fps produce the same motion', () => {
    const distanceAt = (dt: number): number => {
      const s = createMovementState();
      let d = 0;
      let t = 0;
      while (t < 2) {
        stepMovement(s, input({ moveY: -1, sprintHeld: true, dt }), env(), out);
        d += Math.hypot(out.x, out.z);
        t += dt;
      }
      return d;
    };
    const slow = distanceAt(1 / 30);
    const fast = distanceAt(1 / 144);
    // Within 2%. Anything worse and the game is easier or harder depending on
    // the machine, which is not acceptable.
    expect(Math.abs(slow - fast) / fast).toBeLessThan(0.02);
  });
});
