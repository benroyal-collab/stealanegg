/**
 * Third-person spring-arm camera.
 *
 * Kept free of three.js types so the smoothing maths can be unit-tested. The
 * r3f layer feeds it a raycast callback for arm collision and applies the
 * result to the real camera.
 *
 * Feel notes baked in here: exponential smoothing by half-life (frame-rate
 * independent, unlike a raw lerp factor), an ease-out FOV punch on sprint,
 * and a very small handheld noise so a stationary camera never looks locked
 * to a tripod. All of the motion terms respect reduced-motion.
 */

import { CAMERA } from '../data/balance';
import { clamp } from './movement';

export interface CameraState {
  yaw: number;
  pitch: number;
  /** Smoothed focus point, trailing the player. */
  focusX: number;
  focusY: number;
  focusZ: number;
  fov: number;
  /** Remaining shake energy, 0..1. */
  shake: number;
  /** Seconds accumulated, drives the handheld noise. */
  time: number;
  distance: number;
}

export interface CameraTarget {
  x: number;
  y: number;
  z: number;
  /** True while sprinting, for the FOV punch. */
  sprinting: boolean;
  /** Crouching lowers the focus point so the player still fills the frame. */
  crouching: boolean;
  /**
   * How close the nearest pursuer is, 0..1.
   *
   * Widens the lens and pulls the arm back, so the thing chasing you is
   * actually in shot. The whole scare depends on being able to see it.
   */
  pursuitPressure: number;
}

export interface CameraOptions {
  reducedMotion: boolean;
  shakeEnabled: boolean;
  /** Extra distance added by Photo Mode or a wide-angle preference. */
  distanceBias: number;
}

export interface CameraOutput {
  posX: number;
  posY: number;
  posZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  fov: number;
}

export function createCameraState(): CameraState {
  return {
    yaw: 0,
    pitch: 0.18,
    focusX: 0,
    focusY: 0,
    focusZ: 0,
    fov: CAMERA.fovBase,
    shake: 0,
    time: 0,
    distance: CAMERA.distance,
  };
}

/**
 * Frame-rate independent exponential smoothing.
 *
 * `halfLife` is the time for the remaining error to halve, which is a much
 * more stable thing to tune against than a per-frame lerp constant: at 30fps
 * and at 144fps this produces the same motion.
 */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(2, -dt / halfLife);
}

export function dampAngle(current: number, target: number, halfLife: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.pow(2, -dt / halfLife));
}

export function applyLook(state: CameraState, lookX: number, lookY: number): void {
  state.yaw -= lookX;
  state.pitch = clamp(
    state.pitch + lookY,
    (CAMERA.pitchMin * Math.PI) / 180,
    (CAMERA.pitchMax * Math.PI) / 180,
  );
  // Keep yaw bounded so it never loses float precision in a long session.
  if (state.yaw > Math.PI * 4) state.yaw -= Math.PI * 4;
  if (state.yaw < -Math.PI * 4) state.yaw += Math.PI * 4;
}

export function addShake(state: CameraState, amount: number): void {
  state.shake = clamp(state.shake + amount, 0, 1);
}

/** Trace callback: return the fraction of `maxDistance` that is unobstructed. */
export type ArmTrace = (
  fromX: number,
  fromY: number,
  fromZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number,
) => number;

/**
 * The FOV punch is specified as "55 to 68 over 220ms with ease-out".
 * Exponential damping never truly arrives, so pick the half-life that leaves
 * 5% of the travel at the 220ms mark -- about two thirds of a degree, which
 * is below what anyone can see. 2^(-t/h) = 0.05  =>  h = t / log2(20).
 */
const FOV_SETTLE_FRACTION = 0.05;
const FOV_HALF_LIFE = CAMERA.fovLerpMs / 1000 / Math.log2(1 / FOV_SETTLE_FRACTION);

/**
 * Advance the camera and write the result into `out`.
 *
 * Allocation-free: this runs every frame and the output object is owned by
 * the caller.
 */
export function stepCamera(
  state: CameraState,
  target: CameraTarget,
  options: CameraOptions,
  trace: ArmTrace | null,
  dt: number,
  out: CameraOutput,
): void {
  state.time += dt;

  const focusHeight = CAMERA.height * (target.crouching ? 0.72 : 1);
  state.focusX = damp(state.focusX, target.x, CAMERA.positionHalfLife, dt);
  state.focusY = damp(state.focusY, target.y + focusHeight, CAMERA.positionHalfLife * 1.6, dt);
  state.focusZ = damp(state.focusZ, target.z, CAMERA.positionHalfLife, dt);

  const pressure = clamp(target.pursuitPressure, 0, 1);
  const wantFov =
    (target.sprinting ? CAMERA.fovSprint : CAMERA.fovBase) + CAMERA.fovChase * pressure;
  state.fov = damp(state.fov, wantFov, FOV_HALF_LIFE, dt);

  // Arm direction, from the focus point backwards along yaw/pitch.
  const cp = Math.cos(state.pitch);
  const dirX = Math.sin(state.yaw) * cp;
  const dirY = Math.sin(state.pitch);
  const dirZ = Math.cos(state.yaw) * cp;

  const wantDistance = CAMERA.distance + options.distanceBias + CAMERA.chasePullback * pressure;
  let allowed = wantDistance;
  if (trace !== null) {
    const hit = trace(state.focusX, state.focusY, state.focusZ, dirX, dirY, dirZ, wantDistance);
    allowed = Math.max(1.1, hit - CAMERA.collisionRadius);
  }
  // Pull in instantly when something blocks, ease back out when it clears --
  // a camera that eases *into* a wall clips through it.
  state.distance = allowed < state.distance ? allowed : damp(state.distance, allowed, 0.22, dt);

  const shoulder = CAMERA.shoulderOffset;
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);

  let posX = state.focusX + dirX * state.distance + rightX * shoulder;
  let posY = state.focusY + dirY * state.distance;
  let posZ = state.focusZ + dirZ * state.distance + rightZ * shoulder;

  if (!options.reducedMotion) {
    // Handheld noise. Two incommensurate sine pairs so it never visibly loops.
    const t = state.time * CAMERA.handheldFrequency;
    const amp = CAMERA.handheldAmplitude * state.distance;
    posX += (Math.sin(t * 1.0) + Math.sin(t * 2.31)) * amp;
    posY += (Math.sin(t * 1.37) + Math.sin(t * 0.71)) * amp * 1.4;
  }

  /*
   * Chase rumble, on top of whatever impact shake is decaying.
   *
   * Continuous rather than a one-off hit, because the fright should track how
   * close the guardian actually is -- a single sting at the start of a chase
   * says the same thing whether it is two metres behind you or twenty.
   */
  const rumble = options.shakeEnabled && !options.reducedMotion ? CAMERA.chaseShake * pressure : 0;
  const shakeEnergy = Math.max(state.shake, rumble);
  if (options.shakeEnabled && !options.reducedMotion && shakeEnergy > 0.001) {
    const s = shakeEnergy * shakeEnergy * 0.28;
    const t = state.time * 42;
    posX += Math.sin(t * 1.7) * s;
    posY += Math.sin(t * 2.3 + 1.1) * s;
    posZ += Math.sin(t * 1.3 + 2.2) * s;
  }
  state.shake = Math.max(0, state.shake - CAMERA.shakeDecay * dt * state.shake);

  out.posX = posX;
  out.posY = posY;
  out.posZ = posZ;
  out.lookX = state.focusX + rightX * shoulder * 0.5;
  out.lookY = state.focusY;
  out.lookZ = state.focusZ + rightZ * shoulder * 0.5;
  out.fov = state.fov;
}

export function createCameraOutput(): CameraOutput {
  return { posX: 0, posY: 2, posZ: 5, lookX: 0, lookY: 1, lookZ: 0, fov: CAMERA.fovBase };
}
