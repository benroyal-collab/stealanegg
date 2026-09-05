/**
 * The kinematic movement solver.
 *
 * This is the most important file in the game. If holding the stick down and
 * running a circle doesn't feel good, nothing else matters.
 *
 * The split with Rapier: this module owns acceleration curves, gravity,
 * coyote time, input buffering, slide friction and vault arcs, and produces a
 * *desired displacement* for the frame. Rapier's character controller owns
 * turning that desired displacement into a legal one (collide-and-slide,
 * step-up, slope limits). Every feel target lives above the collision layer,
 * so nothing is lost by not hand-rolling the shapecasts.
 *
 * Deliberately allocation-free: `step()` writes into the state object and a
 * caller-owned output vector. This runs every frame.
 */

import { MOVEMENT, STAMINA } from '../data/balance';

export type Gait = 'idle' | 'crouch' | 'walk' | 'sprint';
export type Stance = 'upright' | 'crouched' | 'sliding' | 'vaulting' | 'tumbling';

export interface MovementInput {
  /** Stick vector in camera space, already deadzoned. -1..1 each axis. */
  moveX: number;
  moveY: number;
  /** Camera yaw in radians; the stick is rotated into world space by this. */
  cameraYaw: number;
  sprintHeld: boolean;
  crouchHeld: boolean;
  /** True on the frame the jump button went down. */
  jumpPressed: boolean;
  dt: number;
}

export interface MovementEnvironment {
  /** Did last frame's collision solve leave us standing on something? */
  grounded: boolean;
  /** Y component of the ground normal; 1 is flat. */
  groundNormalY: number;
  /** Height of a vaultable ledge directly ahead, or null. */
  vaultHeight: number | null;
  /** Are we wading? Water drags at the legs -- Mirrormere's signature. */
  waterDepth: number;
  /** Current Pace in m/s, already including the carry penalty. */
  pace: number;
  /** True while a headroom check says we cannot stand up. */
  ceilingBlocked: boolean;
}

export interface MovementState {
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  /** Facing, in radians. Turns towards travel at MOVEMENT.turnRate. */
  facing: number;
  stance: Stance;
  gait: Gait;
  grounded: boolean;
  /** Seconds since we were last grounded. Drives coyote time. */
  airborneFor: number;
  /** Seconds since jump was pressed, or Infinity. Drives the input buffer. */
  jumpBufferedFor: number;
  stamina: number;
  /** Seconds since sprint stopped draining. Gates stamina regen. */
  staminaIdleFor: number;
  /** True while a sprint is in progress, so the start threshold isn't reapplied. */
  sprinting: boolean;
  /** Latched when the bar empties; blocks sprint until it has recovered. */
  exhausted: boolean;
  slideFor: number;
  vaultFor: number;
  vaultStartY: number;
  vaultTargetY: number;
  tumbleFor: number;
  /** Set for one frame when the player lands, so audio and VFX can react. */
  justLanded: boolean;
  justJumped: boolean;
  justVaulted: boolean;
  justSlid: boolean;
  /** Impact speed of the most recent landing, for footstep weighting. */
  landingSpeed: number;
}

export interface Displacement {
  x: number;
  y: number;
  z: number;
}

export function createMovementState(): MovementState {
  return {
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    facing: 0,
    stance: 'upright',
    gait: 'idle',
    grounded: false,
    airborneFor: Infinity,
    jumpBufferedFor: Infinity,
    stamina: STAMINA.maxSeconds,
    staminaIdleFor: Infinity,
    sprinting: false,
    exhausted: false,
    slideFor: 0,
    vaultFor: 0,
    vaultStartY: 0,
    vaultTargetY: 0,
    tumbleFor: 0,
    justLanded: false,
    justJumped: false,
    justVaulted: false,
    justSlid: false,
    landingSpeed: 0,
  };
}

const COYOTE = MOVEMENT.coyoteTimeMs / 1000;
const BUFFER = MOVEMENT.inputBufferMs / 1000;
const VAULT_DURATION = MOVEMENT.vaultDurationMs / 1000;
const SLIDE_DURATION = MOVEMENT.slideDurationMs / 1000;
const MAX_SLOPE_NORMAL_Y = Math.cos((MOVEMENT.maxSlopeDegrees * Math.PI) / 180);

/**
 * Advance one frame. Mutates `state` and writes the frame's desired
 * displacement into `out`.
 */
export function stepMovement(
  state: MovementState,
  input: MovementInput,
  env: MovementEnvironment,
  out: Displacement,
): void {
  const dt = clamp(input.dt, 0, 1 / 20); // never integrate a hitch

  state.justLanded = false;
  state.justJumped = false;
  state.justVaulted = false;
  state.justSlid = false;

  // --- ground bookkeeping, coyote time and the input buffer ----------------
  const wasAirborne = !state.grounded;
  const standable = env.grounded && env.groundNormalY >= MAX_SLOPE_NORMAL_Y;
  state.grounded = standable;

  if (standable) {
    if (wasAirborne) {
      state.justLanded = true;
      state.landingSpeed = Math.abs(state.velocityY);
    }
    state.airborneFor = 0;
  } else {
    state.airborneFor += dt;
  }

  state.jumpBufferedFor = input.jumpPressed ? 0 : state.jumpBufferedFor + dt;

  // --- tumbling: a comic stumble, then straight back up --------------------
  if (state.stance === 'tumbling') {
    state.tumbleFor -= dt;
    decayHorizontal(state, MOVEMENT.deceleration * 2.2, dt);
    applyGravity(state, env, dt);
    if (state.tumbleFor <= 0) state.stance = 'upright';
    writeDisplacement(state, out, dt);
    state.gait = 'idle';
    return;
  }

  // --- vaulting: a scripted arc that ignores input while it plays ----------
  if (state.stance === 'vaulting') {
    state.vaultFor += dt;
    const t = clamp(state.vaultFor / VAULT_DURATION, 0, 1);
    // Ease-out over the lift, so it reads as effort then release.
    const eased = 1 - (1 - t) * (1 - t);
    const targetY = state.vaultStartY + (state.vaultTargetY - state.vaultStartY) * eased;
    out.y =
      targetY -
      (state.vaultStartY + (state.vaultTargetY - state.vaultStartY) * easedPrev(state, dt));
    // Carry forward momentum through the vault so it never feels like a stop.
    out.x = state.velocityX * dt;
    out.z = state.velocityZ * dt;
    if (t >= 1) {
      state.stance = 'upright';
      state.velocityY = 0;
      state.vaultFor = 0;
    }
    state.gait = 'walk';
    return;
  }

  // --- desired direction in world space ------------------------------------
  const sin = Math.sin(input.cameraYaw);
  const cos = Math.cos(input.cameraYaw);
  let wishX = input.moveX * cos - input.moveY * sin;
  let wishZ = input.moveX * sin + input.moveY * cos;
  const wishLength = Math.hypot(wishX, wishZ);
  const hasInput = wishLength > 0.001;
  if (hasInput) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }
  const throttle = clamp(wishLength, 0, 1);

  // --- stance transitions ---------------------------------------------------
  const horizontalSpeed = Math.hypot(state.velocityX, state.velocityZ);
  // The minimum only gates *starting* a sprint. Once you are running, you get
  // to run the bar all the way down -- being cut off at 0.6s remaining would
  // feel like the game changing its mind mid-stride.
  const staminaAllowsSprint =
    !state.exhausted && (state.sprinting ? state.stamina > 0 : state.stamina > STAMINA.minToStart);
  const wantsSprint =
    input.sprintHeld && hasInput && staminaAllowsSprint && state.stance !== 'sliding';

  if (state.stance === 'sliding') {
    state.slideFor += dt;
    const expired = state.slideFor >= SLIDE_DURATION;
    const tooSlow = horizontalSpeed < MOVEMENT.crouchSpeed;
    if ((expired || tooSlow) && !env.ceilingBlocked) {
      state.stance = input.crouchHeld ? 'crouched' : 'upright';
      state.slideFor = 0;
    } else if (expired || tooSlow) {
      state.stance = 'crouched';
      state.slideFor = 0;
    }
  } else if (
    input.crouchHeld &&
    state.grounded &&
    horizontalSpeed >= MOVEMENT.slideMinEntrySpeed &&
    state.stance !== 'crouched'
  ) {
    // Entering a slide converts speed into a burst, then bleeds it off.
    state.stance = 'sliding';
    state.slideFor = 0;
    state.justSlid = true;
    const boost = MOVEMENT.slideBoost;
    state.velocityX *= boost;
    state.velocityZ *= boost;
  } else if (input.crouchHeld) {
    state.stance = 'crouched';
  } else if (state.stance === 'crouched' && !env.ceilingBlocked) {
    state.stance = 'upright';
  }

  // --- vault offer ----------------------------------------------------------
  const canVault =
    env.vaultHeight !== null &&
    env.vaultHeight >= MOVEMENT.vaultMinHeight &&
    env.vaultHeight <= MOVEMENT.vaultMaxHeight &&
    hasInput &&
    state.stance !== 'sliding';

  const jumpAvailable = state.jumpBufferedFor <= BUFFER;
  const coyoteAvailable = state.grounded || state.airborneFor <= COYOTE;

  if (jumpAvailable && canVault) {
    state.stance = 'vaulting';
    state.vaultFor = 0;
    state.vaultStartY = 0;
    state.vaultTargetY = env.vaultHeight! + 0.08;
    state.velocityY = 0;
    state.jumpBufferedFor = Infinity;
    state.justVaulted = true;
    // Keep a little forward push so we clear the ledge rather than hugging it.
    const carry = Math.max(horizontalSpeed, MOVEMENT.walkSpeed);
    state.velocityX = wishX * carry;
    state.velocityZ = wishZ * carry;
    out.x = state.velocityX * dt;
    out.y = 0;
    out.z = state.velocityZ * dt;
    state.gait = 'walk';
    return;
  }

  if (jumpAvailable && coyoteAvailable && state.stance !== 'sliding') {
    state.velocityY = MOVEMENT.jumpVelocity;
    state.grounded = false;
    state.airborneFor = COYOTE + 1; // consume the coyote window
    state.jumpBufferedFor = Infinity;
    state.justJumped = true;
  }

  // --- target speed ---------------------------------------------------------
  let targetSpeed: number;
  if (state.stance === 'sliding') {
    targetSpeed = horizontalSpeed; // a slide is unpowered; friction handles it
  } else if (state.stance === 'crouched') {
    targetSpeed = MOVEMENT.crouchSpeed;
  } else if (wantsSprint) {
    targetSpeed = env.pace;
  } else if (hasInput) {
    // Jogging scales with Pace so the sprint gear change stays constant, with
    // a floor at walk speed so a very low Pace never crawls.
    targetSpeed = Math.max(MOVEMENT.walkSpeed, env.pace * MOVEMENT.jogFraction);
  } else {
    targetSpeed = 0;
  }
  targetSpeed *= throttle > 0 ? throttle : 1;
  targetSpeed *= waterDrag(env.waterDepth);

  // --- stamina --------------------------------------------------------------
  const sprinting = wantsSprint && state.stance === 'upright' && horizontalSpeed > 0.5;
  state.sprinting = sprinting;
  if (sprinting) {
    state.stamina = Math.max(0, state.stamina - dt);
    state.staminaIdleFor = 0;
    if (state.stamina <= 0) state.exhausted = true;
  } else {
    state.staminaIdleFor += dt;
    if (state.staminaIdleFor >= STAMINA.regenDelaySeconds) {
      const rate = STAMINA.maxSeconds / STAMINA.refillSeconds;
      state.stamina = Math.min(STAMINA.maxSeconds, state.stamina + rate * dt);
    }
  }
  if (state.exhausted && state.stamina >= STAMINA.maxSeconds * STAMINA.exhaustRecoverFraction) {
    state.exhausted = false;
  }

  // --- acceleration ---------------------------------------------------------
  if (state.stance === 'sliding') {
    decayHorizontal(state, MOVEMENT.slideFriction, dt);
  } else {
    const accel = state.grounded
      ? hasInput
        ? MOVEMENT.acceleration
        : MOVEMENT.deceleration
      : MOVEMENT.airAcceleration;
    const desiredX = wishX * targetSpeed;
    const desiredZ = wishZ * targetSpeed;
    state.velocityX = approach(state.velocityX, desiredX, accel * dt);
    state.velocityZ = approach(state.velocityZ, desiredZ, accel * dt);
  }

  applyGravity(state, env, dt);

  // --- facing ---------------------------------------------------------------
  const travelSpeed = Math.hypot(state.velocityX, state.velocityZ);
  if (travelSpeed > 0.35) {
    const targetFacing = Math.atan2(state.velocityX, state.velocityZ);
    const maxTurn = (MOVEMENT.turnRate * Math.PI) / 180 / (1 / dt === 0 ? 1 : 1);
    state.facing = turnTowards(state.facing, targetFacing, maxTurn * dt);
  }

  // --- gait, for animation and for how much noise we make -------------------
  state.gait = classifyGait(state, travelSpeed, sprinting);

  writeDisplacement(state, out, dt);
}

function classifyGait(state: MovementState, speed: number, sprinting: boolean): Gait {
  if (state.stance === 'crouched' || state.stance === 'sliding') return 'crouch';
  if (speed < 0.4) return 'idle';
  if (sprinting) return 'sprint';
  return 'walk';
}

function applyGravity(state: MovementState, env: MovementEnvironment, dt: number): void {
  if (state.grounded && state.velocityY <= 0) {
    // A small downward bias keeps us glued to slopes and stairs instead of
    // skipping off the top of every ramp.
    state.velocityY = -2;
  } else {
    state.velocityY += MOVEMENT.gravity * dt;
    // Terminal velocity: falling faster than this only produces tunnelling.
    if (state.velocityY < -55) state.velocityY = -55;
  }
  if (env.waterDepth > 0.9) {
    // Buoyancy in deep water. You wade, you don't sink and you don't swim.
    state.velocityY = Math.max(state.velocityY, -0.6);
  }
}

function writeDisplacement(state: MovementState, out: Displacement, dt: number): void {
  out.x = state.velocityX * dt;
  out.y = state.velocityY * dt;
  out.z = state.velocityZ * dt;
}

function decayHorizontal(state: MovementState, friction: number, dt: number): void {
  const speed = Math.hypot(state.velocityX, state.velocityZ);
  if (speed < 0.0001) {
    state.velocityX = 0;
    state.velocityZ = 0;
    return;
  }
  const next = Math.max(0, speed - friction * dt);
  const scale = next / speed;
  state.velocityX *= scale;
  state.velocityZ *= scale;
}

/** Water above the knee costs you speed. Below it, you splash but keep pace. */
export function waterDrag(depth: number): number {
  if (depth <= 0.15) return 1;
  return clamp(1 - (depth - 0.15) * 0.75, 0.35, 1);
}

/** Begin a tumble. Called when a guardian catches the player. */
export function beginTumble(state: MovementState, seconds: number): void {
  state.stance = 'tumbling';
  state.tumbleFor = seconds;
  state.velocityX *= -0.35;
  state.velocityZ *= -0.35;
  state.velocityY = Math.max(state.velocityY, 2.4);
}

export function isBusy(state: MovementState): boolean {
  return state.stance === 'tumbling' || state.stance === 'vaulting';
}

/** Fraction of the stamina bar remaining, for the HUD ring. */
export function staminaFraction(state: MovementState): number {
  return clamp(state.stamina / STAMINA.maxSeconds, 0, 1);
}

// --- small maths -----------------------------------------------------------

function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

function turnTowards(current: number, target: number, maxDelta: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

function easedPrev(state: MovementState, dt: number): number {
  const t = clamp((state.vaultFor - dt) / VAULT_DURATION, 0, 1);
  return 1 - (1 - t) * (1 - t);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
