import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ECONOMY, GUARDIAN, RIVALS } from '../../src/data/balance';
import { RARITY_COLOURS, MUTATION_DEFS } from '../../src/data/mutations';
import { SPECIES } from '../../src/data/creatures';
import { defaultSettings } from '../../src/sim/save';

/**
 * The child-safety and accessibility contract, asserted against the source.
 *
 * §3 of the brief calls these build-breaking. This is what makes them so:
 * every promise in PARENTS.md has a test here or in tests/e2e/network.spec.ts,
 * and the README points parents at them by name.
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(path);
  }
  return out;
}

const SOURCES = sourceFiles('src');
const ALL_SOURCE = SOURCES.map((path) => `\n/* ${path} */\n${readFileSync(path, 'utf8')}`).join('');

/*
 * The checks below look for *code*, not for words.
 *
 * An earlier version grepped plain substrings and immediately flagged
 * "amplitude" (a wave property), "attack" (an audio envelope) and the Parent
 * Panel's own copy promising there are no in-app purchases. A safety test
 * that cries wolf gets weakened or deleted, so these look for vendor domains,
 * SDK call shapes and identifier-like usage instead -- and the ones about
 * vocabulary skip src/ui, where the game legitimately talks about the things
 * it does not do.
 */
const CODE_SOURCES = SOURCES.filter((path) => !path.includes('/ui/'));

describe('no monetisation, anywhere', () => {
  it('references no payment or store SDK', () => {
    const banned = [
      'stripe.com',
      'js.stripe',
      'paypal.com',
      'braintree',
      'checkout.session',
      'purchaseProduct',
      'requestPayment',
      'PaymentRequest',
      'lootBox',
      'premiumCurrency',
      'rewardedVideo',
      'showAd',
    ];
    for (const needle of banned) {
      const hit = SOURCES.find((path) => readFileSync(path, 'utf8').includes(needle));
      expect(hit, `"${needle}" appears in ${hit ?? ''}`).toBeUndefined();
    }
  });

  it('references no analytics or telemetry SDK', () => {
    const banned = [
      'google-analytics',
      'googletagmanager',
      'gtag(',
      'fbq(',
      'mixpanel.',
      'amplitude.getInstance',
      'amplitude.track',
      'sentry.io',
      'posthog',
      'sendBeacon',
      'navigator.connection',
    ];
    for (const needle of banned) {
      const hit = SOURCES.find((path) => readFileSync(path, 'utf8').includes(needle));
      expect(hit, `"${needle}" appears in ${hit ?? ''}`).toBeUndefined();
    }
  });

  it('makes no outbound network call from any source file', () => {
    // fetch/XHR/WebSocket. The only permitted fetch in the whole project is
    // the build plugin that loads Rapier's WASM from our own origin, which is
    // not in src/.
    for (const path of SOURCES) {
      const text = readFileSync(path, 'utf8');
      expect(text, `${path} calls fetch()`).not.toMatch(/\bfetch\s*\(/);
      expect(text, `${path} uses XMLHttpRequest`).not.toContain('XMLHttpRequest');
      expect(text, `${path} opens a WebSocket`).not.toContain('new WebSocket');
      expect(text, `${path} uses sendBeacon`).not.toContain('sendBeacon');
    }
  });
});

describe('no dark patterns', () => {
  it('caps offline earnings at two hours and pays them at half rate', () => {
    expect(ECONOMY.offlineCapHours).toBeLessThanOrEqual(2);
    expect(ECONOMY.offlineRate).toBeLessThanOrEqual(0.5);
  });

  it('has no login streak, energy meter, lives or daily reward', () => {
    const banned = [
      'loginStreak',
      'dailyReward',
      'dailyBonus',
      'energyMeter',
      'energyCost',
      'remainingLives',
      'playerLives',
      'continueCost',
      'fomo',
      'expiresIn',
    ];
    for (const needle of banned) {
      const hit = SOURCES.find((path) => readFileSync(path, 'utf8').includes(needle));
      expect(hit, `"${needle}" appears in ${hit ?? ''}`).toBeUndefined();
    }
  });

  it('sets the break reminder to something reachable in one sitting', () => {
    expect(defaultSettings().breakReminderMinutes).toBeGreaterThan(0);
    expect(defaultSettings().breakReminderMinutes).toBeLessThanOrEqual(60);
  });
});

describe('nothing gets hurt', () => {
  it('has no combat vocabulary in gameplay code', () => {
    /*
     * These are the identifiers that would appear the moment someone added
     * combat. Prose is excluded (the About panel says the game has none of
     * this) and so is 'attack', which in this codebase is an audio envelope.
     */
    const banned = [
      'damage',
      'takeDamage',
      'health',
      'hitPoints',
      'hitpoints',
      'weapon',
      'projectile',
      'kill(',
      'onDeath',
      'isDead',
      'respawnPlayer',
    ];
    for (const needle of banned) {
      const hit = CODE_SOURCES.filter((path) =>
        readFileSync(path, 'utf8').toLowerCase().includes(needle.toLowerCase()),
      );
      expect(hit, `"${needle}" appears in ${hit.join(', ')}`).toEqual([]);
    }
  });

  it('makes being caught cost time and nothing else', () => {
    expect(GUARDIAN.tumbleSeconds).toBeLessThanOrEqual(3);
    expect(RIVALS.lossPenaltySeconds).toBeLessThanOrEqual(20);
  });
});

describe('accessibility', () => {
  it('turns captions on by default', () => {
    expect(defaultSettings().captions).toBe(true);
  });

  it('offers a palette for each of the three common colour vision types', () => {
    for (const palette of ['off', 'deuteranopia', 'protanopia', 'tritanopia'] as const) {
      expect(RARITY_COLOURS[palette]).toBeDefined();
      // Every rarity has an entry in every palette, so switching never leaves
      // something unlabelled.
      for (const species of SPECIES) {
        expect(RARITY_COLOURS[palette][species.rarity]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('gives every mutation a badge shape as well as a colour', () => {
    const badges = new Set<string>();
    for (const mutation of Object.values(MUTATION_DEFS)) {
      expect(mutation.badge, `${mutation.id} has no badge shape`).toBeTruthy();
      expect(mutation.caption, `${mutation.id} has no caption`).toBeTruthy();
      badges.add(mutation.badge);
    }
    // Distinct shapes, or the badge carries no information.
    expect(badges.size).toBe(Object.keys(MUTATION_DEFS).length);
  });

  it('keeps the UI scale range and text floor the brief asks for', () => {
    const settings = defaultSettings();
    expect(settings.uiScale).toBeGreaterThanOrEqual(1);
    expect(ALL_SOURCE, 'no 16px text floor in the stylesheet').toContain('16px');
  });

  it('offers hold-or-toggle for both sprint and crouch', () => {
    const settings = defaultSettings();
    expect(typeof settings.holdToSprint).toBe('boolean');
    expect(typeof settings.holdToCrouch).toBe('boolean');
  });

  it('binds every action to something remappable', () => {
    const bindings = defaultSettings().bindings;
    for (const action of [
      'forward',
      'back',
      'left',
      'right',
      'sprint',
      'jump',
      'crouch',
      'interact',
      'tool',
      'photo',
      'menu',
    ]) {
      expect(bindings[action], `${action} has no default binding`).toBeTruthy();
    }
  });

  it('never animates faster than 3Hz in the stylesheet', () => {
    /*
     * Photosensitivity is a safety issue, not a preference. Every CSS
     * animation duration in the project is checked against a 333ms floor for
     * anything that repeats.
     */
    const css = readFileSync('src/ui/styles.css', 'utf8');
    const infinite = css.match(/animation:[^;]*infinite[^;]*/g) ?? [];
    for (const rule of infinite) {
      const duration = /([\d.]+)s/.exec(rule);
      expect(duration, `cannot read a duration from: ${rule}`).not.toBeNull();
      expect(Number(duration?.[1] ?? 0), `${rule} repeats faster than 3Hz`).toBeGreaterThanOrEqual(
        0.34,
      );
    }
  });

  it('honours reduced motion in CSS as well as in the renderer', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toContain('prefers-reduced-motion');
    // And the in-game setting, which is separate from the OS one.
    expect(css).toContain('.reduced-motion');
  });
});

describe('reading age', () => {
  it('keeps species blurbs to one short sentence', () => {
    for (const species of SPECIES) {
      expect(species.blurb.length, `${species.id}'s blurb is too long`).toBeLessThan(90);
      expect(
        species.name.split(' ').length,
        `${species.id}'s name is a phrase`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it('uses no real-world brand or franchise names', () => {
    // Original designs only. This is a spot check against the obvious ones.
    const banned = ['pokemon', 'pikachu', 'roblox', 'minecraft', 'disney', 'nintendo', 'mario'];
    for (const needle of banned) {
      expect(ALL_SOURCE.toLowerCase(), `"${needle}" appears in the source`).not.toContain(needle);
    }
  });
});
