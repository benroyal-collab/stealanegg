import { expect, test } from '@playwright/test';
import { bootGame, drive, hold, history, sample, stopMoving, type TestSample } from './helpers';

/**
 * The M1 gate.
 *
 * Drives a thirty-second movement loop through every mechanic in the gym and
 * asserts the three things that would make the controller unshippable: a NaN
 * anywhere in the state, the player leaving the world through a wall or the
 * floor, and the camera clipping into geometry or flying off the arm.
 */

// Three hundred simulated frames at the couple of frames a second a software
// rasteriser manages is several minutes of wall clock. The default two-minute
// test timeout is a statement about CI's speed, not about the controller.
test.setTimeout(600_000);

/*
 * A small viewport, deliberately.
 *
 * This gate is about the simulation, not the picture: CI rasterises in
 * software, and 1920x1080 costs roughly nine times as many pixels as
 * 640x360 for frames nobody looks at. The screenshot gate is where the
 * full resolution matters, and it runs at 1080p.
 */
test.use({ viewport: { width: 640, height: 360 } });

const ARENA_HALF = 40;

/**
 * Note on frame counts: CI renders through a software rasteriser at single
 * digit frames per second, so this asserts that frames happened and that
 * every one of them was sane -- not that they were fast. Frame *rate* is not
 * measurable in this environment and is not what this gate is for.
 */
function assertHealthy(samples: TestSample[]): void {
  expect(samples.length, 'the recorder captured no frames').toBeGreaterThan(100);

  for (const s of samples) {
    for (const [key, value] of Object.entries(s)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), `${key} was ${value} at frame ${s.frame}`).toBe(true);
      }
    }

    // Tunnelling: through the floor, or out through a wall.
    expect(s.y, `fell through the floor at frame ${s.frame}`).toBeGreaterThan(-4);
    expect(s.y, `launched out of the world at frame ${s.frame}`).toBeLessThan(30);
    expect(Math.abs(s.x), `escaped through a wall on x at frame ${s.frame}`).toBeLessThan(
      ARENA_HALF,
    );
    expect(Math.abs(s.z), `escaped through a wall on z at frame ${s.frame}`).toBeLessThan(
      ARENA_HALF,
    );

    // Camera arm: never inside the character, never further than the arm plus
    // the sprint FOV allowance.
    expect(s.cameraDistance, `camera clipped into the player at frame ${s.frame}`).toBeGreaterThan(
      0.9,
    );
    expect(s.cameraDistance, `camera arm ran away at frame ${s.frame}`).toBeLessThan(9);
  }
}

test('a thirty-second movement loop stays healthy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await bootGame(page);

  // Sprint forward, then a hard turn -- the "run a circle" test.
  await drive(page, { moveY: -1, sprint: true }, 2500);
  await drive(page, { moveY: -1, moveX: 0.8, sprint: true, lookX: 2 }, 3000);
  await drive(page, { moveY: -1, moveX: -0.8, sprint: true, lookX: -2 }, 3000);
  await stopMoving(page);
  await hold(page, 600);

  // Jump and land repeatedly.
  for (let i = 0; i < 5; i++) {
    await drive(page, { moveY: -1, jump: true }, 700);
  }
  await stopMoving(page);

  // Crouch-walk, then a sprint into a slide.
  await drive(page, { moveY: -1, crouch: true }, 2000);
  await stopMoving(page);
  await drive(page, { moveY: -1, sprint: true }, 1800);
  await drive(page, { moveY: -1, sprint: true, crouch: true }, 1500);
  await stopMoving(page);

  // Run at the vault ledges from several angles.
  await drive(page, { moveX: -1, moveY: -0.6, sprint: true, jump: true }, 2500);
  await drive(page, { moveX: -1, moveY: -0.2, jump: true }, 2000);
  await stopMoving(page);

  // Into the water, and up the ramps.
  await drive(page, { moveX: 1, moveY: 0.7, sprint: true }, 3000);
  await drive(page, { moveX: 0.5, moveY: -1, sprint: true }, 3000);
  await stopMoving(page);

  // Look straight up and straight down while moving, to stress the arm.
  await drive(page, { moveY: -1, lookY: 6 }, 1500);
  await drive(page, { moveY: -1, lookY: -6 }, 1500);
  await stopMoving(page);
  await hold(page, 500);

  assertHealthy(await history(page));
  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});

test('sprinting reaches full Pace and the player comes to rest', async ({ page }) => {
  await bootGame(page);

  await drive(page, { moveY: -1, sprint: true }, 2000);
  const running = await sample(page);
  expect(running).not.toBeNull();
  // Base Pace is 6.0 m/s. Anything under 5.5 means the solver is being
  // throttled by collision response somewhere it shouldn't be.
  expect(running!.speed).toBeGreaterThan(5.5);
  expect(running!.gait).toBe('sprint');

  await stopMoving(page);
  // Generous, because a software rasteriser gives us only a handful of frames
  // per second and the decel curve is measured in frames, not milliseconds.
  await hold(page, 2500);
  const stopped = await sample(page);
  expect(stopped!.speed).toBeLessThan(0.2);
  expect(stopped!.gait).toBe('idle');
});

test('the player stays on the ground while running over flat terrain', async ({ page }) => {
  await bootGame(page);
  await drive(page, { moveY: -1, sprint: true }, 500);
  const before = await history(page);
  const start = before.length;

  await drive(page, { moveY: -1, sprint: true }, 2000);
  await stopMoving(page);

  const samples = (await history(page)).slice(start);
  const airborne = samples.filter((s) => !s.grounded).length;
  // A few frames of air on a bump is fine; a controller that skips across
  // flat ground is not.
  expect(airborne / samples.length).toBeLessThan(0.2);
});
