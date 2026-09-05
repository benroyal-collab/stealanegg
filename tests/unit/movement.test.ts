import { beforeEach, describe, expect, it } from 'vitest';
import { MOVEMENT, STAMINA } from '../../src/data/balance';
import {
  beginTumble,
  createMovementState,
  stepMovement,
  waterDrag,
  type Displacement,
  type MovementEnvironment,
  type MovementInput,
  type MovementState,
} from '../../src/systems/movement';

const DT = 1 / 60;

function input(overrides: Partial<MovementInput> = {}): MovementInput {
  return {
    moveX: 0,
    moveY: 0,
    cameraYaw: 0,
    sprintHeld: false,
    crouchHeld: false,
    jumpPressed: false,
    dt: DT,
    ...overrides,
  };
}

function env(overrides: Partial<MovementEnvironment> = {}): MovementEnvironment {
  return {
    grounded: true,
    groundNormalY: 1,
    vaultHeight: null,
    waterDepth: 0,
    pace: MOVEMENT.basePace,
    ceilingBlocked: false,
    ...overrides,
  };
}

/** Run n frames, returning the total displacement travelled. */
function run(
  state: MovementState,
  frames: number,
  i: MovementInput | ((f: number) => MovementInput),
  e: MovementEnvironment | ((f: number, s: MovementState) => MovementEnvironment),
): Displacement {
  const out: Displacement = { x: 0, y: 0, z: 0 };
  const total: Displacement = { x: 0, y: 0, z: 0 };
  for (let f = 0; f < frames; f++) {
    const fi = typeof i === 'function' ? i(f) : i;
    const fe = typeof e === 'function' ? e(f, state) : e;
    stepMovement(state, fi, fe, out);
    total.x += out.x;
    total.y += out.y;
    total.z += out.z;
  }
  return total;
}

function speed(s: MovementState): number {
  return Math.hypot(s.velocityX, s.velocityZ);
}

describe('movement solver', () => {
  let state: MovementState;
  beforeEach(() => {
    state = createMovementState();
  });

  it('never produces NaN over a long randomised session', () => {
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const out: Displacement = { x: 0, y: 0, z: 0 };
    for (let f = 0; f < 60 * 60 * 5; f++) {
      stepMovement(
        state,
        input({
          moveX: rand() * 2 - 1,
          moveY: rand() * 2 - 1,
          cameraYaw: rand() * Math.PI * 4 - Math.PI * 2,
          sprintHeld: rand() > 0.5,
          crouchHeld: rand() > 0.7,
          jumpPressed: rand() > 0.95,
          dt: 0.004 + rand() * 0.06,
        }),
        env({
          grounded: rand() > 0.25,
          groundNormalY: 0.5 + rand() * 0.5,
          vaultHeight: rand() > 0.9 ? rand() * 2 : null,
          waterDepth: rand() > 0.8 ? rand() * 1.5 : 0,
          pace: 6 + rand() * 14,
          ceilingBlocked: rand() > 0.9,
        }),
        out,
      );
      expect(Number.isFinite(out.x)).toBe(true);
      expect(Number.isFinite(out.y)).toBe(true);
      expect(Number.isFinite(out.z)).toBe(true);
      expect(Number.isFinite(state.velocityX)).toBe(true);
      expect(Number.isFinite(state.velocityY)).toBe(true);
      expect(Number.isFinite(state.facing)).toBe(true);
      expect(Number.isFinite(state.stamina)).toBe(true);
    }
  });

  it('reaches full Pace when sprinting and holds it', () => {
    run(state, 60, input({ moveY: -1, sprintHeld: true }), env());
    expect(speed(state)).toBeCloseTo(MOVEMENT.basePace, 1);
    expect(state.gait).toBe('sprint');
  });

  it('accelerates to full speed within a quarter of a second', () => {
    // 6.0 m/s at 42 m/s^2 is ~143ms. Anything much slower feels mushy.
    run(state, 15, input({ moveY: -1, sprintHeld: true }), env());
    expect(speed(state)).toBeGreaterThan(MOVEMENT.basePace * 0.95);
  });

  it('comes to a complete stop when input is released', () => {
    run(state, 60, input({ moveY: -1, sprintHeld: true }), env());
    run(state, 30, input(), env());
    expect(speed(state)).toBeLessThan(0.01);
    expect(state.gait).toBe('idle');
  });

  it('clamps the displacement of a huge frame hitch', () => {
    // A 2-second tab-switch must not teleport the player through a wall.
    const out: Displacement = { x: 0, y: 0, z: 0 };
    state.velocityX = 20;
    stepMovement(state, input({ dt: 2 }), env(), out);
    expect(Math.abs(out.x)).toBeLessThan(20 / 20 + 0.001);
  });

  describe('coyote time', () => {
    it('allows a jump within 120ms of leaving the ground', () => {
      run(state, 10, input(), env());
      run(state, 6, input(), env({ grounded: false })); // 100ms airborne
      const out: Displacement = { x: 0, y: 0, z: 0 };
      stepMovement(state, input({ jumpPressed: true }), env({ grounded: false }), out);
      expect(state.justJumped).toBe(true);
    });

    it('refuses a jump after the coyote window closes', () => {
      run(state, 10, input(), env());
      run(state, 12, input(), env({ grounded: false })); // 200ms airborne
      const out: Displacement = { x: 0, y: 0, z: 0 };
      stepMovement(state, input({ jumpPressed: true }), env({ grounded: false }), out);
      expect(state.justJumped).toBe(false);
    });
  });

  describe('input buffer', () => {
    it('fires a jump pressed up to 150ms before landing', () => {
      run(state, 10, input(), env({ grounded: false }));
      // Press while still airborne, then land 8 frames (133ms) later.
      const out: Displacement = { x: 0, y: 0, z: 0 };
      stepMovement(state, input({ jumpPressed: true }), env({ grounded: false }), out);
      expect(state.justJumped).toBe(false);
      run(state, 7, input(), env({ grounded: false }));
      stepMovement(state, input(), env({ grounded: true }), out);
      expect(state.justJumped).toBe(true);
    });

    it('drops a jump pressed longer than the buffer before landing', () => {
      run(state, 10, input(), env({ grounded: false }));
      const out: Displacement = { x: 0, y: 0, z: 0 };
      stepMovement(state, input({ jumpPressed: true }), env({ grounded: false }), out);
      run(state, 14, input(), env({ grounded: false })); // 233ms
      stepMovement(state, input(), env({ grounded: true }), out);
      expect(state.justJumped).toBe(false);
    });
  });

  describe('stamina', () => {
    it('drains over exactly the configured sprint duration', () => {
      run(
        state,
        Math.round(STAMINA.maxSeconds * 60),
        input({ moveY: -1, sprintHeld: true }),
        env(),
      );
      expect(state.stamina).toBeLessThan(0.05);
    });

    it('refuses to start a sprint below the minimum, then allows it once regen catches up', () => {
      state.stamina = 0.1;
      run(state, 10, input({ moveY: -1, sprintHeld: true }), env());
      expect(state.gait).toBe('walk');
      // Regen runs the whole time, so once the bar clears the threshold the
      // sprint becomes available again without the player doing anything.
      run(state, 30, input({ moveY: -1, sprintHeld: true }), env());
      expect(state.gait).toBe('sprint');
    });

    it('does not stutter between sprint and walk once the bar is empty', () => {
      // Hold sprint continuously through exhaustion and well into recovery.
      // Every transition back into a sprint is a visible hitch, so there
      // should be exactly one: the initial run, and then nothing until the
      // bar has genuinely recovered.
      const out: Displacement = { x: 0, y: 0, z: 0 };
      let entries = 0;
      let wasSprinting = false;
      for (let f = 0; f < 60 * 12; f++) {
        stepMovement(state, input({ moveY: -1, sprintHeld: true }), env(), out);
        const now = state.gait === 'sprint';
        if (now && !wasSprinting) entries += 1;
        wasSprinting = now;
      }
      // 12 seconds: one 6s sprint, ~1s delay, then recovery past 55% at ~3.3s
      // permits exactly one more entry. Three or more would be the stutter.
      expect(entries).toBeLessThanOrEqual(2);
    });

    it('waits out the regen delay, then refills in four seconds', () => {
      // Drain it by actually sprinting, so the regen delay timer is armed the
      // way it would be in play. Stop the instant it empties so the delay
      // window is measured from a known zero.
      const out: Displacement = { x: 0, y: 0, z: 0 };
      for (let f = 0; f < 60 * 20 && state.stamina > 0; f++) {
        stepMovement(state, input({ moveY: -1, sprintHeld: true }), env(), out);
      }
      expect(state.stamina).toBe(0);

      run(state, Math.round(STAMINA.regenDelaySeconds * 60) - 4, input(), env());
      expect(state.stamina).toBe(0);

      run(state, Math.round(STAMINA.refillSeconds * 60) + 8, input(), env());
      expect(state.stamina).toBeCloseTo(STAMINA.maxSeconds, 1);
    });

    it('lets a sprint already underway run the bar all the way to zero', () => {
      run(
        state,
        Math.round(STAMINA.maxSeconds * 60) + 30,
        input({ moveY: -1, sprintHeld: true }),
        env(),
      );
      expect(state.stamina).toBe(0);
      expect(state.gait).not.toBe('sprint');
    });
  });

  describe('slide', () => {
    it('boosts speed on entry from a sprint', () => {
      run(state, 60, input({ moveY: -1, sprintHeld: true }), env());
      const before = speed(state);
      run(state, 1, input({ moveY: -1, sprintHeld: true, crouchHeld: true }), env());
      expect(speed(state)).toBeGreaterThan(before * 1.2);
      expect(state.stance).toBe('sliding');
    });

    it('refuses to start below the minimum entry speed', () => {
      run(state, 6, input({ moveY: -1 }), env());
      expect(speed(state)).toBeLessThan(MOVEMENT.slideMinEntrySpeed);
      run(state, 1, input({ moveY: -1, crouchHeld: true }), env());
      expect(state.stance).toBe('crouched');
    });

    it('bleeds off and resolves to a crouch or a stand', () => {
      run(state, 60, input({ moveY: -1, sprintHeld: true }), env());
      run(state, 1, input({ moveY: -1, crouchHeld: true }), env());
      run(state, 90, input({ moveY: -1 }), env());
      expect(state.stance).not.toBe('sliding');
    });
  });

  describe('vault', () => {
    it('triggers on a ledge inside the vaultable band', () => {
      run(state, 30, input({ moveY: -1 }), env());
      const out: Displacement = { x: 0, y: 0, z: 0 };
      stepMovement(state, input({ moveY: -1, jumpPressed: true }), env({ vaultHeight: 1.0 }), out);
      expect(state.stance).toBe('vaulting');
      expect(state.justVaulted).toBe(true);
    });

    it('ignores a ledge that is too tall to climb', () => {
      run(state, 30, input({ moveY: -1 }), env());
      const out: Displacement = { x: 0, y: 0, z: 0 };
      stepMovement(state, input({ moveY: -1, jumpPressed: true }), env({ vaultHeight: 3.5 }), out);
      expect(state.stance).not.toBe('vaulting');
      expect(state.justJumped).toBe(true);
    });

    it('completes and hands control back', () => {
      run(state, 30, input({ moveY: -1 }), env());
      const out: Displacement = { x: 0, y: 0, z: 0 };
      stepMovement(state, input({ moveY: -1, jumpPressed: true }), env({ vaultHeight: 1.0 }), out);
      run(
        state,
        Math.ceil((MOVEMENT.vaultDurationMs / 1000) * 60) + 2,
        input({ moveY: -1 }),
        env(),
      );
      expect(state.stance).toBe('upright');
    });
  });

  describe('crouch', () => {
    it('caps speed at the crouch speed', () => {
      run(state, 90, input({ moveY: -1, sprintHeld: true, crouchHeld: true }), env());
      expect(speed(state)).toBeLessThanOrEqual(MOVEMENT.crouchSpeed + 0.01);
      expect(state.gait).toBe('crouch');
    });

    it('refuses to stand up under a low ceiling', () => {
      run(state, 30, input({ crouchHeld: true }), env());
      run(state, 30, input(), env({ ceilingBlocked: true }));
      expect(state.stance).toBe('crouched');
    });
  });

  describe('slopes and water', () => {
    it('treats a slope past the limit as not standable', () => {
      run(state, 10, input(), env({ groundNormalY: 0.3 }));
      expect(state.grounded).toBe(false);
    });

    it('drags on speed in deep water but never stops the player dead', () => {
      expect(waterDrag(0)).toBe(1);
      expect(waterDrag(0.1)).toBe(1);
      expect(waterDrag(0.8)).toBeLessThan(1);
      expect(waterDrag(5)).toBeGreaterThanOrEqual(0.35);
    });
  });

  describe('tumble', () => {
    it('locks input for its duration and then recovers', () => {
      run(state, 60, input({ moveY: -1, sprintHeld: true }), env());
      beginTumble(state, MOVEMENT.hitstopMs / 1000 + 3);
      run(state, 30, input({ moveY: -1, sprintHeld: true }), env());
      expect(state.stance).toBe('tumbling');
      run(state, 60 * 4, input({ moveY: -1, sprintHeld: true }), env());
      expect(state.stance).toBe('upright');
    });

    it('reverses momentum on the catch so it reads as a stumble', () => {
      run(state, 60, input({ moveY: -1, sprintHeld: true }), env());
      const forward = state.velocityZ;
      beginTumble(state, 3);
      expect(Math.sign(state.velocityZ)).toBe(-Math.sign(forward));
    });
  });
});
