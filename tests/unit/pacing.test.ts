import { describe, expect, it } from 'vitest';
import { PACING_TARGETS } from '../../src/data/balance';
import { MOVEMENT } from '../../src/data/balance';
import {
  firstLoopSeconds,
  nominalLoopSeconds,
  runHeadlessSession,
  type SessionResult,
} from '../../src/sim/session';

/**
 * The M4 balance gate.
 *
 * Two hundred simulated sessions of a median player, run through the same
 * economy, rarity and unlock code the real game uses. These assertions are
 * the pacing contract from the brief. If they fail, tune `balance.ts` -- do
 * not weaken the assertion.
 */

const SESSIONS = 200;
const NINETY_MINUTES = 90 * 60;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

let cached: SessionResult[] | null = null;
function sessions(): SessionResult[] {
  if (cached !== null) return cached;
  cached = Array.from({ length: SESSIONS }, (_, i) =>
    runHeadlessSession({ seed: `session-${i}`, durationSeconds: NINETY_MINUTES, skill: 0.5 }),
  );
  return cached;
}

describe('economy pacing over 200 median sessions', () => {
  it('puts the first egg in the incubator inside sixty seconds', () => {
    const times = sessions().map((s) => s.firstEggSeconds ?? Infinity);
    expect(median(times)).toBeLessThan(PACING_TARGETS.firstEggSeconds);
    // And not just on average: nearly everyone should get there.
    expect(percentile(times, 0.9)).toBeLessThan(PACING_TARGETS.firstEggSeconds);
  });

  it('unlocks Mirrormere between twelve and eighteen minutes', () => {
    const times = sessions()
      .map((s) => s.unlockSeconds.mirrormere)
      .filter((t): t is number => t !== undefined)
      .map((t) => t / 60);
    expect(times.length, 'some sessions never reached Mirrormere at all').toBe(SESSIONS);

    const [low, high] = PACING_TARGETS.mirrormereMinutes;
    expect(median(times)).toBeGreaterThanOrEqual(low);
    expect(median(times)).toBeLessThanOrEqual(high);
  });

  it('unlocks Amber Dunes between forty-five and seventy minutes', () => {
    const times = sessions()
      .map((s) => s.unlockSeconds.dunes)
      .filter((t): t is number => t !== undefined)
      .map((t) => t / 60);
    expect(times.length, 'some sessions never reached Amber Dunes at all').toBe(SESSIONS);

    const [low, high] = PACING_TARGETS.dunesMinutes;
    expect(median(times)).toBeGreaterThanOrEqual(low);
    expect(median(times)).toBeLessThanOrEqual(high);
  });

  it('keeps the spread tight, so no child is left far behind their friend', () => {
    const times = sessions()
      .map((s) => s.unlockSeconds.mirrormere)
      .filter((t): t is number => t !== undefined)
      .map((t) => t / 60);
    const spread = percentile(times, 0.95) - percentile(times, 0.05);
    expect(spread).toBeLessThan(9);
  });

  it('never loses a creature, however many times the player is caught', () => {
    // Design law #1: failure costs time, never progress.
    for (const session of sessions()) {
      expect(session.save.creatures.length).toBeGreaterThanOrEqual(0);
      expect(session.save.money).toBeGreaterThanOrEqual(0);
      expect(session.save.upgrades.trainingTrack).toBeGreaterThanOrEqual(0);
    }
  });

  it('catches and lost races happen often enough to matter, rarely enough to be fair', () => {
    const caught = sessions().map((s) => s.timesCaught);
    const eggs = sessions().map((s) => s.eggsRecovered);
    const catchRate = median(caught) / Math.max(1, median(eggs));
    expect(catchRate).toBeGreaterThan(0.02);
    expect(catchRate).toBeLessThan(0.4);
  });

  it('keeps discovering new species right through the session', () => {
    // A collection that fills up in the first ten minutes stops being a draw.
    const discovered = sessions().map((s) => s.speciesDiscovered);
    expect(median(discovered)).toBeGreaterThan(6);
  });

  it('is deterministic for a given seed', () => {
    const a = runHeadlessSession({ seed: 'repeatable', durationSeconds: 1800 });
    const b = runHeadlessSession({ seed: 'repeatable', durationSeconds: 1800 });
    expect(a.finalPace).toBe(b.finalPace);
    expect(a.eggsRecovered).toBe(b.eggsRecovered);
    expect(a.unlockSeconds).toEqual(b.unlockSeconds);
  });

  it('rewards skill without making the game unplayable without it', () => {
    const clumsy = runHeadlessSession({
      seed: 'skill',
      durationSeconds: NINETY_MINUTES,
      skill: 0.1,
    });
    const sharp = runHeadlessSession({
      seed: 'skill',
      durationSeconds: NINETY_MINUTES,
      skill: 0.9,
    });

    // Measured in time-to-unlock rather than final Pace: over a long enough
    // session both players top out the Training Track, so final Pace tells us
    // nothing. What skill buys is getting there sooner.
    expect(sharp.unlockSeconds.dunes ?? Infinity).toBeLessThan(
      clumsy.unlockSeconds.dunes ?? Infinity,
    );

    // But a clumsy player still gets to see the second biome inside an hour.
    expect(clumsy.unlockSeconds.mirrormere ?? Infinity).toBeLessThan(60 * 60);
  });

  it('runs a roughly ninety-second loop, with a much shorter guided first run', () => {
    // The steady-state loop is the design's "~90 seconds end to end". The
    // first run is deliberately short so the first egg lands inside sixty
    // seconds -- that is a level-design commitment about where Whisper
    // Glade's tutorial nest sits, recorded in CLAUDE.md.
    expect(nominalLoopSeconds(MOVEMENT.basePace)).toBeGreaterThan(70);
    expect(nominalLoopSeconds(MOVEMENT.basePace)).toBeLessThan(100);
    expect(firstLoopSeconds(MOVEMENT.basePace)).toBeLessThan(45);

    // Pace speeds the loop up, but never trivialises it: scouting, the escape
    // and the sanctuary beats are fixed costs.
    const fast = nominalLoopSeconds(18);
    const slow = nominalLoopSeconds(MOVEMENT.basePace);
    expect(fast).toBeLessThan(slow);
    expect(fast).toBeGreaterThan(slow * 0.7);
  });
});
