import type { Page } from '@playwright/test';

export interface TestSample {
  x: number;
  y: number;
  z: number;
  speed: number;
  gait: string;
  stance: string;
  stamina: number;
  grounded: boolean;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraDistance: number;
  frame: number;
  drawCalls: number;
  triangles: number;
}

export interface VirtualInput {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  interact: boolean;
}

declare global {
  interface Window {
    __eggheist?: {
      enabled: true;
      sample: () => TestSample | null;
      frames: () => number;
      history: () => TestSample[];
      setVirtualInput: (patch: Partial<VirtualInput>) => void;
      ready: () => boolean;
      phase: () => string;
      incubatorSeconds: () => number | null;
    };
  }
}

/**
 * Press Play the way a child would.
 *
 * Deliberately goes through the real title screen rather than forcing the
 * phase: if the button ever stops working, every test that depends on
 * reaching the game should fail, not just the one that tests the button.
 */
export async function pressPlay(page: Page): Promise<void> {
  const play = page.getByRole('button', { name: /play|carry on/i });
  await play.waitFor({ state: 'visible', timeout: 30_000 });
  await play.click();
}

/** Load the game with the read-only test hook enabled and wait for a frame. */
export async function bootGame(page: Page): Promise<void> {
  await page.goto('/?e2e=1');
  await pressPlay(page);
  await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
    timeout: 120_000,
  });
  await page.waitForFunction(() => (window.__eggheist?.sample()?.frame ?? 0) > 5, undefined, {
    timeout: 120_000,
  });
}

/**
 * The solver clamps its timestep to 1/20s, so one rendered frame advances the
 * simulation by at most fifty milliseconds no matter how long it took to draw.
 */
const SIM_STEP_MS = 50;

/**
 * The most simulated time one `drive` call will wait for.
 *
 * CI renders this scene through a software rasteriser at between one and four
 * frames a second, so a wall-clock wait advances the game by almost nothing:
 * `waitForTimeout(2000)` used to buy two frames, which is a tenth of a second
 * of simulated movement. Every gameplay assertion downstream then measured a
 * player who had barely started walking.
 *
 * So these helpers count frames rather than milliseconds. The cap keeps a
 * single call bounded in wall time -- a second of simulation is twenty frames,
 * and twenty frames is already twenty seconds of CI.
 */
const MAX_SIM_FRAMES = 24;

function framesFor(durationMs: number): number {
  return Math.min(MAX_SIM_FRAMES, Math.max(2, Math.round(durationMs / SIM_STEP_MS)));
}

/** Wait for the renderer to produce `frames` more frames. */
export async function advance(page: Page, frames: number): Promise<void> {
  const start = (await page.evaluate(() => window.__eggheist?.frames() ?? 0)) as number;
  await page.waitForFunction(
    (target) => (window.__eggheist?.frames() ?? 0) >= target,
    start + frames,
    { timeout: 180_000, polling: 250 },
  );
}

/**
 * Hold an input for roughly `durationMs` of *simulated* time.
 *
 * The duration keeps its plain reading -- "sprint for two seconds" -- but it
 * is honoured in frames, so the assertion after it measures the same game
 * whether the frame took four milliseconds or four seconds.
 */
export async function drive(
  page: Page,
  input: Partial<VirtualInput>,
  durationMs: number,
): Promise<void> {
  await page.evaluate((i) => window.__eggheist?.setVirtualInput(i), input);
  await advance(page, framesFor(durationMs));
}

/** Let `durationMs` of simulated time pass without touching the input. */
export async function hold(page: Page, durationMs: number): Promise<void> {
  await advance(page, framesFor(durationMs));
}

export async function stopMoving(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.__eggheist?.setVirtualInput({
      moveX: 0,
      moveY: 0,
      lookX: 0,
      lookY: 0,
      sprint: false,
      crouch: false,
    }),
  );
}

export async function history(page: Page): Promise<TestSample[]> {
  return page.evaluate(() => window.__eggheist?.history() ?? []);
}

export async function sample(page: Page): Promise<TestSample | null> {
  return page.evaluate(() => window.__eggheist?.sample() ?? null);
}

/**
 * Wait until the renderer has produced enough frames that everything
 * one-shot has happened: the environment bake, the CSM material patch pass,
 * the shader compiles and the foliage upload. Screenshotting before this
 * captures a half-built scene.
 *
 * The count is low because CI renders through a software rasteriser at well
 * under one frame per second with the full pipeline on. Everything one-shot
 * lands inside the first handful of frames, so a dozen is plenty and a
 * hundred would simply time out.
 */
export async function settle(page: Page, frames = 14): Promise<void> {
  const start = (await page.evaluate(() => window.__eggheist?.frames() ?? 0)) as number;
  await page.waitForFunction(
    (target) => (window.__eggheist?.frames() ?? 0) > target,
    start + frames,
    { timeout: 180_000, polling: 500 },
  );
}

/** Load the game at a specific biome and quality preset. */
export async function bootBiome(page: Page, biome: string, quality: string): Promise<void> {
  await page.addInitScript(
    ({ b, q }) => {
      window.localStorage.setItem(
        'egg-heist-wildlands/save',
        JSON.stringify({
          version: 1,
          currentBiome: b,
          upgrades: { trainingTrack: 20 },
          settings: { quality: q, captions: true },
        }),
      );
    },
    { b: biome, q: quality },
  );
  await page.goto('/?e2e=1');
  await pressPlay(page);
  await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
    timeout: 180_000,
  });
  await settle(page);
}
