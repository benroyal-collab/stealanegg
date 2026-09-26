import { expect, test } from '@playwright/test';
import { advance, bootGame, drive, hold, stopMoving } from './helpers';

test.use({ viewport: { width: 640, height: 360 } });
test.setTimeout(900_000);

/**
 * The chase gate.
 *
 * A child playtesting this reported that "once I'd grabbed an egg I could
 * literally walk back", and they were right: taking an egg alerted nobody, and
 * Whisper Glade's guardian pursued at 4.2 m/s against a 6.0 m/s sprint. Every
 * unit test in the suite passed throughout.
 *
 * `tests/unit/chase.test.ts` proves the arithmetic. This proves it is wired to
 * the thing the player touches: rob a nest in the real game and something
 * comes.
 */
test('grabbing an egg starts a real chase', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0] ?? ''));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().split('\n')[0] ?? '');
  });
  await page.addInitScript(() => {
    if (window.localStorage.getItem('egg-heist-wildlands/save') !== null) return;
    window.localStorage.setItem(
      'egg-heist-wildlands/save',
      JSON.stringify({
        version: 1,
        currentBiome: 'glade',
        settings: { quality: 'low', difficulty: 'standard', captions: true },
      }),
    );
  });
  await bootGame(page);

  const prompt = page.locator('.prompt');
  let grabbed = false;
  for (let leg = 0; leg < 60 && !grabbed; leg++) {
    await drive(page, { moveY: -1, sprint: true }, 300);
    if ((await prompt.count()) === 0) continue;
    if (!/pick up/i.test((await prompt.textContent()) ?? '')) continue;
    await stopMoving(page);
    await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
    await hold(page, 400);
    grabbed = true;
  }
  expect(grabbed, 'never reached a nest').toBe(true);

  /*
   * Stand still for a moment. Something should be coming.
   *
   * Every caption shown over those frames is collected, not just whatever
   * is on screen at the end: the track holds two lines, and a guardian that
   * arrives quickly knocks the player over and pushes "chasing you" off the
   * top before a single end-of-wait read would see it.
   */
  const captions = page.locator('.captions');
  let caption = '';
  for (let frame = 0; frame < 12; frame++) {
    await advance(page, 1);
    if ((await captions.count()) === 0) continue;
    caption += ` ${(await captions.textContent()) ?? ''}`;
  }
  // eslint-disable-next-line no-console
  console.log(`captions after the snatch: ${caption.replace(/\s+/g, ' ').trim()}`);
  expect(caption, 'nothing reacted to the theft').toMatch(/chasing/i);
  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});
