import { expect, test } from '@playwright/test';
import { pressPlay } from './helpers';

test.setTimeout(300_000);

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
  // Press Play: the 3D runtime and its WASM only load at that point, and
  // that is exactly where a stray request would most plausibly appear.
  await pressPlay(page);
  await page.waitForFunction(() => document.querySelector('canvas') !== null, undefined, {
    timeout: 120_000,
  });
  // Give the game a good while to do something it shouldn't.
  await page.waitForTimeout(20_000);

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

test('has no payment, analytics or account code in the shipped bundle', async ({
  request,
  baseURL,
}) => {
  /*
   * A source-level check on what actually shipped. The brief bans this code
   * from existing at all -- "not now, not stubbed, not later" -- so reading
   * the built output is a fair reading of the requirement.
   *
   * Fetched from Node through Playwright's request fixture rather than from
   * inside the page: the page is the thing under test, and asking it to fetch
   * its own scripts is both circular and awkward about relative URLs.
   */
  const banned = [
    'googletagmanager',
    'google-analytics',
    'gtag(',
    'fbq(',
    'mixpanel',
    'sentry.io',
    'js.stripe',
    'paypal.com',
    'checkout.session',
    'sendbeacon',
  ];

  const origin = baseURL ?? 'http://127.0.0.1:4173';
  const html = await (await request.get(`${origin}/`)).text();
  const sources = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1] ?? '');
  expect(sources.length, 'no scripts found in the built page').toBeGreaterThan(0);

  let bundle = '';
  for (const src of sources) {
    bundle += await (await request.get(new URL(src, origin).toString())).text();
  }

  for (const needle of banned) {
    expect(bundle.toLowerCase(), `bundle contains "${needle}"`).not.toContain(needle.toLowerCase());
  }
});
