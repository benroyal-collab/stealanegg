import { expect, test } from '@playwright/test';
import { pressPlay, settle } from './helpers';

/**
 * A budget probe, not a frame-rate test.
 *
 * Frame *rate* cannot be measured here: CI renders through a software
 * rasteriser, and asserting fps against it would measure the rasteriser. What
 * can be measured, and what the budget is actually written in, is how much
 * work the renderer is asking for: draw calls and triangles on screen.
 *
 * Those numbers are hardware-independent, so this gate is meaningful in CI
 * and on a real machine alike.
 */

test.setTimeout(600_000);

const BUDGET = { drawCalls: 450, triangles: 1_200_000 };

for (const preset of ['low', 'high'] as const) {
  test(`stays inside the draw-call and triangle budget at ${preset}`, async ({ page }) => {
    await page.addInitScript((quality) => {
      window.localStorage.setItem(
        'egg-heist-wildlands/save',
        JSON.stringify({ version: 1, currentBiome: 'glade', settings: { quality } }),
      );
    }, preset);

    await page.goto('/?e2e=1');
    await pressPlay(page);
    await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
      timeout: 180_000,
    });
    await settle(page, 6);

    const sample = await page.evaluate(() => window.__eggheist?.sample() ?? null);
    expect(sample).not.toBeNull();

    // eslint-disable-next-line no-console
    console.log(
      `BUDGET ${preset}: draws=${sample!.drawCalls} tris=${sample!.triangles} frames=${sample!.frame}`,
    );

    expect(sample!.drawCalls, `${preset} exceeds the draw-call budget`).toBeLessThanOrEqual(
      BUDGET.drawCalls,
    );
    expect(sample!.triangles, `${preset} exceeds the triangle budget`).toBeLessThanOrEqual(
      BUDGET.triangles,
    );
  });
}
