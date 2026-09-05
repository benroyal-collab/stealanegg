import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { bootBiome, drive, sample, settle, stopMoving } from './helpers';

/**
 * The M2 gate: screenshots of Whisper Glade at all four presets, plus one of
 * each biome for the M5 silhouette-and-palette comparison.
 *
 * These are committed to docs/shots/ and are meant to be looked at, not
 * diffed. A pixel-exact visual regression test across a software rasteriser
 * would fail on driver noise and teach us nothing.
 */

const SHOTS = 'docs/shots';

// Software rasterisation of the full pipeline at 1080p runs at well under one
// frame per second here. The shots are the deliverable, so they stay at
// 1080p and the clock gets moved instead.
test.setTimeout(600_000);

test.beforeAll(() => {
  if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
});

/*
 * Console errors are part of this gate, not an afterthought.
 *
 * A shader that fails to compile still produces a screenshot -- just one with
 * the geometry missing. That is exactly how a CSM bug survived several rounds
 * of looking at pictures: it only appeared above one cascade, so the Low
 * preset looked fine and the byte-size check passed. It is also how an
 * ambient-occlusion pass sat switched off for a whole preset tier, doing
 * nothing but logging about it.
 *
 * Neither of those is visible in a screenshot unless you already know to look.
 * A clean console is.
 */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0] ?? ''));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().split('\n')[0] ?? '');
  });
  return errors;
}

for (const preset of ['low', 'medium', 'high', 'ultra'] as const) {
  test(`whisper glade at ${preset}`, async ({ page }) => {
    const errors = watchConsole(page);

    await bootBiome(page, 'glade', preset);
    // Turn the camera towards the low sun so the shot shows what the biome is
    // actually for: dawn light raking through the birches.
    await drive(page, { lookX: -30 }, 400);
    await stopMoving(page);
    await settle(page, 10);

    const buffer = await page.screenshot({ path: `${SHOTS}/glade-${preset}.png` });
    const s = await sample(page);
    // eslint-disable-next-line no-console
    console.log(
      `${preset}: bytes=${buffer.length} player=${s?.x.toFixed(1)},${s?.y.toFixed(1)},${s?.z.toFixed(1)} cam=${s?.cameraX.toFixed(1)},${s?.cameraY.toFixed(1)},${s?.cameraZ.toFixed(1)}`,
    );
    // A blank or nearly-blank frame compresses to almost nothing.
    expect(buffer.length, 'the frame looks empty').toBeGreaterThan(60_000);
    expect(errors, `console errors at ${preset}: ${errors.join(' | ')}`).toEqual([]);
  });
}

for (const biome of ['glade', 'mirrormere', 'dunes'] as const) {
  test(`${biome} at high`, async ({ page }) => {
    // Mirrormere is the only biome with a water surface, and the Dunes are
    // the only one with heat haze. Neither appears in the Glade shots, so
    // this loop is where those two shaders get checked at all.
    const errors = watchConsole(page);

    await bootBiome(page, biome, 'high');
    await drive(page, { lookX: -30 }, 400);
    await stopMoving(page);
    await settle(page, 10);

    const buffer = await page.screenshot({ path: `${SHOTS}/biome-${biome}.png` });
    expect(buffer.length, 'the frame looks empty').toBeGreaterThan(60_000);
    expect(errors, `console errors in ${biome}: ${errors.join(' | ')}`).toEqual([]);
  });
}
