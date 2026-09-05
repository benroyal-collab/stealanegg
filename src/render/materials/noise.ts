/**
 * Noise, in two places at once.
 *
 * The TypeScript functions here generate terrain heights and scatter points
 * on the CPU. `NOISE_GLSL` is the same algorithm for the GPU, so a shader
 * that samples the terrain agrees with the collider the player is standing
 * on. Keeping one implementation in two languages is a maintenance cost, but
 * a mismatch between them is a player falling through the floor.
 */

/** 2D value noise with smooth interpolation. Deterministic for a given seed. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const u = smoothstep(xf);
  const v = smoothstep(yf);

  const a = hash2D(xi, yi, seed);
  const b = hash2D(xi + 1, yi, seed);
  const c = hash2D(xi, yi + 1, seed);
  const d = hash2D(xi + 1, yi + 1, seed);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Fractal Brownian motion. `octaves` layers at halving amplitude. */
export function fbm2D(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  lacunarity = 2.03,
  gain = 0.5,
): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * frequency, y * frequency, seed + i * 97) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

/**
 * Ridged fBm. Folding the noise around its midpoint produces sharp crests,
 * which is what makes the dunes read as wind-carved rather than lumpy.
 */
export function ridged2D(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2D(x * frequency, y * frequency, seed + i * 131) * 2 - 1);
    sum += n * n * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }
  return norm === 0 ? 0 : sum / norm;
}

export function hash2D(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The same noise in GLSL, injected into terrain, foliage and water shaders.
 * Kept as a single exported chunk so there is one copy to keep in step.
 */
export const NOISE_GLSL = /* glsl */ `
float ehHash(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float ehValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = ehHash(i);
  float b = ehHash(i + vec2(1.0, 0.0));
  float c = ehHash(i + vec2(0.0, 1.0));
  float d = ehHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float ehFbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += ehValueNoise(p) * amp;
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
`;
