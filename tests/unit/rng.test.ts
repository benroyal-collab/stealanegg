import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng('wildlands');
    const b = new Rng('wildlands');
    const seqA = Array.from({ length: 64 }, () => a.next());
    const seqB = Array.from({ length: 64 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = new Rng('one');
    const b = new Rng('two');
    expect(a.next()).not.toBe(b.next());
  });

  it('stays inside [0, 1)', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 20_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('respects weighted distributions within tolerance', () => {
    const rng = new Rng('weights');
    const counts = { a: 0, b: 0, c: 0 };
    const n = 60_000;
    for (let i = 0; i < n; i++) counts[rng.weighted({ a: 3, b: 1, c: 1 })] += 1;
    expect(counts.a / n).toBeCloseTo(0.6, 1);
    expect(counts.b / n).toBeCloseTo(0.2, 1);
    expect(counts.c / n).toBeCloseTo(0.2, 1);
  });

  it('int() is inclusive at both ends', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});
