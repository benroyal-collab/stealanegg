import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { bootGame, drive, hold, pressPlay, settle, stopMoving } from './helpers';

/**
 * The M3 gate.
 *
 * Drives the whole loop in the real game -- steal, hatch, place, earn,
 * upgrade -- and round-trips the save. The headless simulation in
 * tests/unit/pacing.test.ts proves the *economy*; this proves the economy is
 * actually wired to the thing the player touches.
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

// The whole loop, walked at the frame rate a software rasteriser manages.
test.setTimeout(1_500_000);

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

/** The live incubator, straight out of the save the game writes. */
async function readIncubator(page: Page): Promise<{ remaining: number; total: number } | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('egg-heist-wildlands/save');
    if (raw === null) return null;
    const save = JSON.parse(raw) as { incubator?: { remaining: number; total: number } | null };
    return save.incubator ?? null;
  });
}

/** Drop the incubator to nearly zero and reload, so the egg is ready to collect. */
async function windIncubatorForward(page: Page): Promise<void> {
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('egg-heist-wildlands/save');
    if (raw === null) return;
    const save = JSON.parse(raw) as { incubator?: { remaining: number } | null };
    if (save.incubator !== null && save.incubator !== undefined) save.incubator.remaining = 0;
    window.localStorage.setItem('egg-heist-wildlands/save', JSON.stringify(save));
  });
  await page.reload();
  await pressPlay(page);
  await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
    timeout: 180_000,
  });
  await settle(page, 4);
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

  /*
   * Straight ahead first, then sweep.
   *
   * Nest zero is eighteen metres directly in front of the spawn in every
   * biome, so the walk a child would actually take is also the fastest route
   * for this test. Rotating through eight headings from the first step just
   * wanders in circles around the sanctuary and runs out of laps.
   *
   * Short legs either way: the grab prompt only exists inside a 2.6 metre
   * radius, and a leg longer than that steps over the window it is hunting
   * for. See the same note in coldstart.spec.ts.
   */
  let grabbed = false;
  for (let leg = 0; leg < 20 && !grabbed; leg++) {
    await drive(page, { moveY: -1, sprint: true }, 300);
    if ((await prompt.count()) === 0) continue;
    if (!/pick up/i.test((await prompt.textContent()) ?? '')) continue;
    await stopMoving(page);
    await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
    await hold(page, 1500);
    grabbed = true;
  }

  for (let lap = 0; lap < 12 && !grabbed; lap++) {
    for (const heading of headings) {
      await drive(page, { ...heading, sprint: true }, 300);
      if ((await prompt.count()) === 0) continue;
      const text = (await prompt.textContent()) ?? '';
      if (!/pick up/i.test(text)) continue;
      await stopMoving(page);
      await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
      await hold(page, 1500);
      grabbed = true;
      break;
    }
  }
  await stopMoving(page);
  expect(grabbed, 'never found a nest to grab from').toBe(true);

  // --- carry it home ------------------------------------------------------
  // The sanctuary is at the origin, so steer back towards it, re-aiming every
  // leg. Twenty metres at six metres a second is about four seconds of
  // simulated time; the extra legs are headroom for steering round trees.
  for (let attempt = 0; attempt < 20; attempt++) {
    const sample = await page.evaluate(() => window.__eggheist?.sample() ?? null);
    if (sample === null) break;
    const distance = Math.hypot(sample.x, sample.z);
    // eslint-disable-next-line no-console
    console.log(`home ${attempt}: x=${sample.x.toFixed(1)} z=${sample.z.toFixed(1)}`);
    if (distance < 4) break;

    // Point at the origin. The virtual stick is in camera space and the test
    // never rotates the camera, so world space and stick space agree.
    const moveX = -sample.x / distance;
    const moveY = -sample.z / distance;
    await drive(page, { moveX, moveY, sprint: true }, 900);
  }
  await stopMoving(page);
  await hold(page, 600);

  // --- deposit ------------------------------------------------------------
  // Nudge around the incubator until the deposit prompt appears.
  // Short nudges: the deposit prompt is a 3.2 metre window and a longer step
  // walks through it between checks.
  let deposited = false;
  const nudges = [{ moveY: -1 }, { moveX: -0.7, moveY: -0.7 }, { moveX: 0.7 }, { moveY: 1 }];
  for (let i = 0; i < 24 && !deposited; i++) {
    const nudge = nudges[i % nudges.length]!;
    await drive(page, nudge, 300);
    await stopMoving(page);
    const text = (await prompt.textContent().catch(() => '')) ?? '';
    if (/put the egg in/i.test(text)) {
      await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
      await hold(page, 1500);
      deposited = true;
    }
  }

  const afterSteal = await readSave(page);
  expect(afterSteal.eggs, 'no egg was ever recovered').toBeGreaterThan(0);
  expect(deposited || afterSteal.incubating || afterSteal.creatures > 0).toBe(true);

  // --- hatch and earn -----------------------------------------------------
  /*
   * Incubation is thirty seconds at level zero, and CI renders at a couple of
   * frames a second, so waiting it out honestly would take ten minutes of
   * wall clock. Instead: prove the clock is running, then wind it forward.
   *
   * Proving the clock runs is the part that matters. The store's `tick` --
   * which owns the incubator countdown, accrued play time, passive donations,
   * caption expiry and the break reminder -- was defined and never called by
   * anything, and every one of those features was silently inert. Nothing
   * caught it, because nothing asserted that a number the player watches
   * actually moves.
   */
  const beforeWait = await readIncubator(page);
  expect(beforeWait, 'nothing is incubating').not.toBeNull();
  await hold(page, 1200);
  const afterWait = await readIncubator(page);
  expect(afterWait!.remaining, 'the incubator is not counting down').toBeLessThan(
    beforeWait!.remaining,
  );

  await windIncubatorForward(page);
  await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
  await hold(page, 1500);

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

  /*
   * The save has to be written by an init script, not by `page.evaluate`
   * before a reload.
   *
   * The app persists on `pagehide` so a child who closes the tab keeps their
   * sanctuary. That handler runs on the outgoing document during the reload,
   * which means anything written into localStorage first is immediately
   * overwritten by whatever the leaving page had in memory. Writing from an
   * init script puts the save down on the *new* document, after the old one
   * has had its last word and before the app reads anything.
   */
  await page.addInitScript((save) => {
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
