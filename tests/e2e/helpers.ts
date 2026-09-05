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
      history: () => TestSample[];
      setVirtualInput: (patch: Partial<VirtualInput>) => void;
      ready: () => boolean;
      phase: () => string;
    };
  }
}

/** Load the game with the read-only test hook enabled and wait for a frame. */
export async function bootGame(page: Page): Promise<void> {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => window.__eggheist?.ready() === true, undefined, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => (window.__eggheist?.sample()?.frame ?? 0) > 5, undefined, {
    timeout: 60_000,
  });
}

export async function drive(
  page: Page,
  input: Partial<VirtualInput>,
  durationMs: number,
): Promise<void> {
  await page.evaluate((i) => window.__eggheist?.setVirtualInput(i), input);
  await page.waitForTimeout(durationMs);
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
