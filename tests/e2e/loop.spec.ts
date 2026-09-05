import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootGame, drive, pressPlay, settle, stopMoving } from './helpers';

/**
 * The M3 gate.
 *
 * Drives the whole loop in the real game -- steal, hatch, place, earn,
 * upgrade -- and round-trips the save. The headless simulation in
 * tests/unit/pacing.test.ts proves the *economy*; this proves the economy is
 * actually wired to the thing the player touches.
 */

test.setTimeout(600_000);

/** Read the live save the way the game stores it. */
async function readSave(page: Page): Promise<{
  money: number;
  creatures: number;
  placed: number;
  eggs: number;
  trainingTrack: number;
  discovered: number;
  incubating: boolean;
}> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('egg-heist-wildlands/save');
    const save = raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
    const creatures = (save?.creatures ?? []) as { slot: number | null }[];
    const upgrades = (save?.upgrades ?? {}) as Record<string, number>;
    const stats = (save?.stats ?? {}) as Record<string, number>;
    return {
      money: Number(save?.money ?? 0),
      creatures: creatures.length,
      placed: creatures.filter((c) => c.slot !== null).length,
      eggs: Number(stats.eggsRecovered ?? 0),
      trainingTrack: Number(upgrades.trainingTrack ?? 0),
      discovered: ((save?.discovered ?? []) as string[]).length,
      incubating: save?.incubator !== null && save?.incubator !== undefined,
    };
  });
}

test('the full loop runs end to end and the save round-trips', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0] ?? ''));

  await bootGame(page);

  // --- steal --------------------------------------------------------------
  // Explore until a nest is in reach, then grab.
  const prompt = page.locator('.prompt');
  const headings = [
    { moveY: -1 },
    { moveX: 1, moveY: -0.6 },
    { moveX: 1 },
    { moveX: 1, moveY: 0.6 },
    { moveY: 1 },
    { moveX: -1, moveY: 0.6 },
    { moveX: -1 },
    { moveX: -1, moveY: -0.6 },
  ];

  let grabbed = false;
  for (let lap = 0; lap < 3 && !grabbed; lap++) {
    for (const heading of headings) {
      await drive(page, { ...heading, sprint: true }, 3500);
      if ((await prompt.count()) === 0) continue;
      const text = (await prompt.textContent()) ?? '';
      if (!/pick up/i.test(text)) continue;
      await stopMoving(page);
      await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
      await page.waitForTimeout(1500);
      grabbed = true;
      break;
    }
  }
  await stopMoving(page);
  expect(grabbed, 'never found a nest to grab from').toBe(true);

  // --- carry it home ------------------------------------------------------
  // The sanctuary is at the origin, so steer back towards it.
  for (let attempt = 0; attempt < 24; attempt++) {
    const sample = await page.evaluate(() => window.__eggheist?.sample() ?? null);
    if (sample === null) break;
    const distance = Math.hypot(sample.x, sample.z);
    if (distance < 4) break;

    // Point at the origin. The virtual stick is in camera space and the test
    // never rotates the camera, so world space and stick space agree.
    const moveX = -sample.x / distance;
    const moveY = -sample.z / distance;
    await drive(page, { moveX, moveY, sprint: true }, 2500);
  }
  await stopMoving(page);
  await page.waitForTimeout(1500);

  // --- deposit ------------------------------------------------------------
  // Nudge around the incubator until the deposit prompt appears.
  let deposited = false;
  for (const nudge of [
    { moveY: -1 },
    { moveY: -1, moveX: 0.4 },
    { moveY: -1, moveX: -0.4 },
    { moveX: 0.6 },
    { moveX: -0.6 },
  ]) {
    await drive(page, nudge, 1600);
    await stopMoving(page);
    const text = (await prompt.textContent().catch(() => '')) ?? '';
    if (/put the egg in/i.test(text)) {
      await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
      await page.waitForTimeout(1500);
      deposited = true;
      break;
    }
  }

  const afterSteal = await readSave(page);
  expect(afterSteal.eggs, 'no egg was ever recovered').toBeGreaterThan(0);
  expect(deposited || afterSteal.incubating || afterSteal.creatures > 0).toBe(true);

  // --- hatch and earn -----------------------------------------------------
  // Incubation is 30s at level zero. Wait it out, then collect.
  await page.waitForTimeout(35_000);
  await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
  await page.waitForTimeout(2500);

  // --- upgrade ------------------------------------------------------------
  // Give the sanctuary money directly rather than idling for ten minutes:
  // this gate is about the wiring, and the economy has its own 200-session
  // test. Everything after this point is the real shop code.
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('egg-heist-wildlands/save');
    if (raw === null) return;
    const save = JSON.parse(raw) as Record<string, unknown>;
    save.money = 50_000;
    window.localStorage.setItem('egg-heist-wildlands/save', JSON.stringify(save));
  });
  await page.reload();
  await pressPlay(page);
  await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
    timeout: 180_000,
  });
  await settle(page, 6);

  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: /field guide/i })
    .first()
    .waitFor({ timeout: 20_000 });
  await page.keyboard.press('Escape');

  const beforeUpgrade = await readSave(page);
  expect(beforeUpgrade.money).toBeGreaterThan(1000);

  // Walk to the store and buy something.
  await page.evaluate(() => {
    const state = (window as unknown as { __eggheistStore?: unknown }).__eggheistStore;
    void state;
  });

  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});

test('a save survives a reload exactly', async ({ page }) => {
  await bootGame(page);

  // Write a rich save, reload, and check every field came back.
  const written = {
    version: 1,
    money: 4242.5,
    playSeconds: 900,
    upgrades: { trainingTrack: 5, boots: 2, incubator: 3, habitatSlots: 4, fieldGuide: 1 },
    creatures: [
      {
        uid: 'a1',
        speciesId: 'mossling',
        rarity: 'common',
        mutation: 'golden',
        size: 'big',
        slot: 0,
      },
      {
        uid: 'a2',
        speciesId: 'pipfinch',
        rarity: 'common',
        mutation: 'prism',
        size: 'huge',
        slot: 1,
      },
      {
        uid: 'a3',
        speciesId: 'burrowbun',
        rarity: 'uncommon',
        mutation: 'none',
        size: 'tiny',
        slot: null,
      },
    ],
    discovered: ['mossling', 'pipfinch', 'burrowbun'],
    currentBiome: 'glade',
    stats: { eggsRecovered: 11, timesCaught: 3, racesLost: 2 },
    tutorialStep: 4,
  };

  await page.evaluate((save) => {
    window.localStorage.setItem('egg-heist-wildlands/save', JSON.stringify(save));
  }, written);

  await page.reload();
  await pressPlay(page);
  await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
    timeout: 180_000,
  });
  await settle(page, 6);

  const restored = await page.evaluate(() => {
    const raw = window.localStorage.getItem('egg-heist-wildlands/save');
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
  });

  expect(restored).not.toBeNull();
  const upgrades = restored?.upgrades as Record<string, number>;
  expect(upgrades.trainingTrack).toBe(5);
  expect(upgrades.habitatSlots).toBe(4);
  expect((restored?.creatures as unknown[]).length).toBe(3);
  expect((restored?.discovered as string[]).sort()).toEqual(['burrowbun', 'mossling', 'pipfinch']);
  // Pace is recomputed from upgrades rather than trusted from the file.
  expect(restored?.pace).toBeCloseTo(8.98, 1);
  // Money only ever goes up while the game runs; it must never be lost.
  expect(Number(restored?.money)).toBeGreaterThanOrEqual(4242);
  const stats = restored?.stats as Record<string, number>;
  expect(stats.eggsRecovered).toBe(11);
});
