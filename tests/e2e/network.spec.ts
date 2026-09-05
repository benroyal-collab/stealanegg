import { expect, test } from '@playwright/test';

/**
 * The child-safety gate.
 *
 * "No accounts, no PII, no analytics, no telemetry. Zero runtime network
 * calls beyond serving static assets." This is where that stops being a
 * promise in a README.
 *
 * Every request the page makes is intercepted and its origin checked. Any
 * request that leaves the origin fails the build -- there is no allowlist and
 * no exception, because the moment there is one, there is a second one.
 */

test('makes no request to any third-party domain', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin;
  const offsite: string[] = [];

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const sameOrigin = url.startsWith(origin);
    const inert = url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank';
    if (!sameOrigin && !inert) offsite.push(`${route.request().method()} ${url}`);
    await route.continue();
  });

  // Also catch anything that slips past routing -- a beacon, a preconnect,
  // a WebSocket, a service worker fetch.
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return;
    offsite.push(`(event) ${request.method()} ${url}`);
  });

  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('canvas') !== null, undefined, {
    timeout: 60_000,
  });
  // Give the game a good while to do something it shouldn't.
  await page.waitForTimeout(15_000);

  expect(offsite, `third-party requests: ${offsite.join(' | ')}`).toEqual([]);
});

test('stores nothing anywhere except a single local save key', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(6000);

  const storage = await page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
    cookies: document.cookie,
  }));

  // One key, and it is the save. No identifiers, no analytics IDs, no cookies.
  for (const key of storage.local) {
    expect(key, `unexpected localStorage key: ${key}`).toBe('egg-heist-wildlands/save');
  }
  expect(storage.session).toEqual([]);
  expect(storage.cookies).toBe('');
});

test('ships no console errors on a cold load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0] ?? ''));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().split('\n')[0] ?? '');
  });

  await page.goto('/');
  await page.waitForTimeout(12_000);
  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
});

test('has no payment, analytics or account code in the shipped bundle', async ({ page }) => {
  /*
   * A source-level check on what actually shipped. The brief bans this code
   * from existing at all -- "not now, not stubbed, not later" -- so grepping
   * the built output is a fair reading of the requirement.
   */
  const banned = [
    'googletagmanager',
    'google-analytics',
    'gtag(',
    'fbq(',
    'mixpanel',
    'amplitude',
    'sentry.io',
    'stripe',
    'paypal',
    'checkout.',
    'navigator.sendBeacon',
  ];

  const scripts = await page.evaluate(async () => {
    const response = await fetch('/');
    const html = await response.text();
    const sources = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1] ?? '');
    const bodies = await Promise.all(sources.map(async (src) => (await fetch(src)).text()));
    return bodies.join('\n');
  });

  for (const needle of banned) {
    expect(scripts.toLowerCase(), `bundle contains "${needle}"`).not.toContain(
      needle.toLowerCase(),
    );
  }
});
