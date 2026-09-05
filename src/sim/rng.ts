/**
 * Deterministic RNG. Every roll in the game goes through one of these so
 * that a seeded economy test produces the same session twice, and so that a
 * save can reproduce its own nest layout without storing it.
 *
 * sfc32 -- small, fast, and good enough that a 200-session Monte Carlo over
 * it is trustworthy.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | string) {
    const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.a = s ^ 0x9e3779b9;
    this.b = s ^ 0x243f6a88;
    this.c = s ^ 0xb7e15162;
    this.d = 1;
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on an empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /**
   * Weighted pick over a record of key -> relative weight. Weights need not
   * sum to one; they are normalised here.
   */
  weighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as [K, number][];
    let total = 0;
    for (const [, w] of entries) total += w;
    let roll = this.next() * total;
    for (const [key, w] of entries) {
      roll -= w;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1]![0];
  }
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
