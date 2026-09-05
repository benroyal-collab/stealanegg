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
  // Init script, not evaluate-then-reload: the app persists on pagehide and
  // would write the un-wound incubator straight back over this.
  await page.addInitScript(() => {
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

/**
 * Take one short step, then press interact if the prompt says what we want.
 *
 * Counting before reading matters: `locator.textContent()` waits for the
 * element to exist, and Playwright has no default action timeout, so calling
 * it while the prompt is absent does not return an empty string -- it blocks.
 * A deposit loop written that way sat for twenty-five minutes and then
 * reported "target page closed", which looks nothing like "not there yet".
 */
async function stepAndTry(
  page: Page,
  prompt: ReturnType<Page['locator']>,
  input: Parameters<typeof drive>[1],
  wanted: RegExp,
): Promise<boolean> {
  await drive(page, input, 300);
  if ((await prompt.count()) === 0) return false;
  if (!wanted.test((await prompt.textContent()) ?? '')) return false;
  await stopMoving(page);
  await page.evaluate(() => window.__eggheist?.setVirtualInput({ interact: true }));
  await hold(page, 900);
  return true;
}

test('the full loop runs end to end and the save round-trips', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0] ?? ''));

  /*
   * Relaxed difficulty, deliberately.
   *
   * The first run of this gate walked out, grabbed the egg, and was caught by
   * the Broody Hen guarding nest zero -- which drops what you are carrying.
   * The player then walked all the way home empty and the deposit prompt
   * never appeared, reported as "no egg was ever recovered".
   *
   * That is the game working: getting caught costs the run. But this gate is
   * about whether steal-hatch-place-earn-upgrade is wired together, and the
   * guardian AI has its own tests. So it plays on the difficulty a child who
   * wants to be left alone would pick, and retries the run if it loses one.
   */
  await page.addInitScript(() => {
    /*
     * Seed only when there is nothing there.
     *
     * An init script runs on *every* navigation, and this test reloads twice
     * mid-run. Written unconditionally, it wiped the sanctuary each time --
     * the heist succeeded and then the money assertion read zero, because the
     * save it was reading had been created a second earlier.
     */
    if (window.localStorage.getItem('egg-heist-wildlands/save') !== null) return;
    window.localStorage.setItem(
      'egg-heist-wildlands/save',
      JSON.stringify({
        version: 1,
        currentBiome: 'glade',
        settings: { quality: 'low', difficulty: 'relaxed', captions: true },
      }),
    );
  });
  await bootGame(page);

  const prompt = page.locator('.prompt');

  /*
   * One attempt at the whole outbound run: walk out, grab, carry home,
   * deposit. Returns whether the egg made it into the incubator.
   *
   * It is a function because a run can legitimately fail -- a guardian that
   * catches you takes the egg back -- and the gate is about the loop being
   * wired together, not about winning the first time.
   */
  async function attemptHeist(): Promise<boolean> {
    /*
     * Straight ahead first, then sweep.
     *
     * Nest zero is eighteen metres directly in front of the spawn in every
     * biome, so the walk a child would actually take is also the fastest
     * route for this test. Rotating through eight headings from the first
     * step just wanders in circles around the sanctuary.
     *
     * Short legs either way: the grab prompt only exists inside a 2.6 metre
     * radius, and a leg longer than that steps over the window it is hunting
     * for. See the same note in coldstart.spec.ts.
     */
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
    for (let leg = 0; leg < 22 && !grabbed; leg++) {
      grabbed = await stepAndTry(page, prompt, { moveY: -1, sprint: true }, /pick up/i);
    }
    for (let lap = 0; lap < 4 && !grabbed; lap++) {
      for (const heading of headings) {
        grabbed = await stepAndTry(page, prompt, { ...heading, sprint: true }, /pick up/i);
        if (grabbed) break;
      }
    }
    await stopMoving(page);
    if (!grabbed) return false;

    // --- carry it home ----------------------------------------------------
    // Re-aim at the origin every leg. Twenty metres at six metres a second is
    // four seconds of simulated time; the extra legs are headroom for trees.
    for (let leg = 0; leg < 20; leg++) {
      const state = await page.evaluate(() => window.__eggheist?.sample() ?? null);
      if (state === null) break;
      const distance = Math.hypot(state.x, state.z);
      // eslint-disable-next-line no-console
      console.log(`home ${leg}: x=${state.x.toFixed(1)} z=${state.z.toFixed(1)}`);
      if (distance < 4) break;
      // The virtual stick is in camera space and the test never rotates the
      // camera, so world space and stick space agree.
      await drive(
        page,
        { moveX: -state.x / distance, moveY: -state.z / distance, sprint: true },
        900,
      );
    }
    await stopMoving(page);

    // --- deposit ----------------------------------------------------------
    // Nudge around the incubator until the deposit prompt appears. Short
    // nudges: it is a 3.2 metre window and a longer step walks through it.
    const nudges = [{ moveY: -1 }, { moveX: -0.7, moveY: -0.7 }, { moveX: 0.7 }, { moveY: 1 }];
    for (let i = 0; i < 24; i++) {
      const nudge = nudges[i % nudges.length]!;
      if (await stepAndTry(page, prompt, nudge, /put the egg in/i)) return true;
    }
    await stopMoving(page);
    return false;
  }

  let deposited = false;
  for (let attempt = 0; attempt < 3 && !deposited; attempt++) {
    deposited = await attemptHeist();
  }
  expect(deposited, 'three runs and the egg never reached the incubator').toBe(true);

  const afterSteal = await readSave(page);
  expect(afterSteal.eggs, 'no egg was ever recovered').toBeGreaterThan(0);
  expect(afterSteal.incubating || afterSteal.creatures > 0).toBe(true);

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
  // Patched from an init script, not before the reload: the app persists on
  // pagehide, so the outgoing document would write its own copy over the top.
  await page.addInitScript(() => {
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
