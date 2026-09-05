import { expect, test } from '@playwright/test';

test('the app boots and renders a WebGL canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  // The title screen comes first, and it is the only thing a child sees until
  // they press Play.
  const play = page.getByRole('button', { name: /play|carry on/i });
  await expect(play).toBeVisible();
  await play.click();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // A canvas that never produced a frame is not a passing smoke test.
  await expect
    .poll(async () => page.evaluate(() => document.querySelectorAll('canvas').length), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});
