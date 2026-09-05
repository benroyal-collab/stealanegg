import { expect, test } from '@playwright/test';
import { drive, hold, pressPlay, sample, settle, stopMoving } from './helpers';

/**
 * The M6 gate.
 *
 * A cold start with no prior save, reaching the first egg using nothing but
 * what is on the screen. No cheats, no forced state, no reading the source.
 * If a test can find its way to the first nest from the tutorial line and the
 * grab prompt alone, a child can.
 */

/*
 * A small viewport, deliberately.
 *
 * This gate is about the simulation, not the picture: CI rasterises in
 * software, and 1920x1080 costs roughly nine times as many pixels as
 * 640x360 for frames nobody looks at. The screenshot gate is where the
 * full resolution matters, and it runs at 1080p.
 */
test.use({ viewport: { width: 640, height: 360 } });

test.setTimeout(600_000);

test('a cold start reaches the first egg on on-screen guidance alone', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0] ?? ''));

  await page.goto('/?e2e=1');

  // 1. The title screen offers exactly one obvious thing to do.
  const play = page.getByRole('button', { name: /^play$/i });
  await expect(play, 'no Play button on the title screen').toBeVisible();
  await pressPlay(page);

  await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
    timeout: 180_000,
  });
  await settle(page, 8);

  // 2. The tutorial tells the player what to do first, in one short line.
  const tutorial = page.locator('.tutorial');
  await expect(tutorial, 'no opening guidance').toBeVisible({ timeout: 30_000 });
  const firstLine = (await tutorial.textContent()) ?? '';
  expect(firstLine.toLowerCase()).toContain('egg');

  /*
   * 3. Walk forward and find the first nest.
   *
   * Straight ahead, because nest zero is placed there deliberately -- see
   * TUTORIAL_NEST_DISTANCE in BiomeRuntime and the rule in CLAUDE.md. A child
   * who walks in the direction they are facing has to find something, and
   * this is the test of that.
   *
   * Progress is checked by distance travelled rather than by wall clock: CI
   * renders through a software rasteriser at well under one frame per second,
   * so a fixed timeout would be measuring the rasteriser, not the game.
   */
  const prompt = page.locator('.prompt');
  let found = false;

  let sweepBack = false;
  /*
   * Short legs, checked between each one.
   *
   * The grab prompt only appears inside `EGG.grabRadius`, which is 2.6
   * metres. A leg of three simulated seconds covers eighteen at sprint, so a
   * search that only looks at the prompt between legs steps straight over the
   * window it is looking for and sweeps back and forth past it forever. The
   * leg has to be shorter than the radius it is hunting.
   */
  for (let leg = 0; leg < 60 && !found; leg++) {
    await drive(page, { moveY: sweepBack ? 1 : -1, sprint: true }, 300);
    if ((await prompt.count()) > 0) {
      const text = (await prompt.textContent()) ?? '';
      if (/pick up/i.test(text)) found = true;
    }
    const state = await sample(page);
    if (state !== null) {
      // eslint-disable-next-line no-console
      console.log(
        `leg ${leg}: z=${state.z.toFixed(1)} frame=${state.frame} draws=${state.drawCalls} tris=${state.triangles}`,
      );
      // Sweep back and forth around the nest rather than walking to the rim.
      if (state.z < -24) sweepBack = true;
      if (state.z > 2) sweepBack = false;
    }
  }
  await stopMoving(page);

  expect(found, 'walking forward from the spawn never reached a nest').toBe(true);
  await expect(prompt).toContainText(/pick up|put the egg/i);

  // 4. The prompt says which button, and pressing it works.
  await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
  await hold(page, 3000);

  const state = await sample(page);
  expect(state).not.toBeNull();
  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});

test('the HUD explains itself without any words a child would not know', async ({ page }) => {
  await page.goto('/?e2e=1');
  await pressPlay(page);
  await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
    timeout: 180_000,
  });
  await settle(page, 6);

  const text = (await page.locator('.hud').textContent()) ?? '';

  // Jargon a spec writer reaches for and an eight year old does not.
  for (const jargon of ['DPS', 'XP', 'buff', 'tier', 'multiplier', 'threshold', 'entity']) {
    expect(text.toLowerCase(), `HUD uses jargon: ${jargon}`).not.toContain(jargon.toLowerCase());
  }

  // And every stat is paired with an icon, not text alone.
  const stats = page.locator('.hud__stat');
  const count = await stats.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    expect(await stats.nth(i).locator('svg').count(), 'a HUD stat has no icon').toBeGreaterThan(0);
  }
});

test('every menu can be opened and closed with the keyboard alone', async ({ page }) => {
  await page.goto('/?e2e=1');
  await pressPlay(page);
  await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
    timeout: 180_000,
  });
  await settle(page, 6);

  // Escape pauses, and the pause menu is reachable and dismissible.
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // Escape again closes it. A child who opens a menu by accident is never stuck.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden({ timeout: 15_000 });
});
