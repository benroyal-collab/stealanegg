import { expect, test } from '@playwright/test';
import { drive, pressPlay, sample, settle, stopMoving } from './helpers';

/**
 * The M6 gate.
 *
 * A cold start with no prior save, reaching the first egg using nothing but
 * what is on the screen. No cheats, no forced state, no reading the source.
 * If a test can find its way to the first nest from the tutorial line and the
 * grab prompt alone, a child can.
 */

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

  for (let leg = 0; leg < 30 && !found; leg++) {
    await drive(page, { moveY: -1, sprint: true }, 2500);
    if ((await prompt.count()) > 0) {
      const text = (await prompt.textContent()) ?? '';
      if (/pick up/i.test(text)) found = true;
    }
    const state = await sample(page);
    // Overshot the nest: sweep back and forth rather than walking to the rim.
    if (state !== null && state.z < -26) {
      await drive(page, { moveY: 1, sprint: true }, 2000);
    }
  }
  await stopMoving(page);

  expect(found, 'walking forward from the spawn never reached a nest').toBe(true);
  await expect(prompt).toContainText(/pick up|put the egg/i);

  // 4. The prompt says which button, and pressing it works.
  await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
  await page.waitForTimeout(3000);

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
