/**
 * Procedural PBR textures.
 *
 * Everything is generated into a DataTexture at load. No image is fetched,
 * which is what makes the zero-third-party-network guarantee provable rather
 * than aspirational -- and it means a texture costs a few milliseconds of CPU
 * instead of a few hundred kilobytes of transfer.
 *
 * These are cached by key: three biomes share a grass normal map, and
 * generating it three times would be wasteful.
 */

import {
  DataTexture,
  LinearMipmapLinearFilter,
  LinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { fbm2D, hash2D, valueNoise2D } from './noise';

const cache = new Map<string, DataTexture>();

function cached(key: string, build: () => DataTexture): DataTexture {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = build();
  cache.set(key, made);
  return made;
}

/** Free every generated texture. Called when tearing a biome down. */
export function disposeTextureCache(): void {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}

function makeTexture(size: number, data: Uint8Array, srgb: boolean): DataTexture {
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tangent-space normal map from a height function.
 *
 * Sobel over the height field, packed to RGB. `strength` is the bump depth;
 * anything over about 3 starts to look like corrugated iron.
 */
export function normalMapFrom(
  key: string,
  size: number,
  strength: number,
  height: (x: number, y: number) => number,
): DataTexture {
  return cached(`normal:${key}:${size}:${strength}`, () => {
    const data = new Uint8Array(size * size * 4);
    const at = (x: number, y: number): number =>
      height(((x % size) + size) % size, ((y % size) + size) % size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        let nx = -dx;
        let ny = -dy;
        const nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        const i = (y * size + x) * 4;
        data[i] = Math.round((nx * 0.5 + 0.5) * 255);
        data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round((nz / len) * 0.5 * 255 + 127.5);
        data[i + 3] = 255;
      }
    }
    return makeTexture(size, data, false);
  });
}

/** Fine surface detail, tiled hard so it reads as micro-relief up close. */
export function microNormal(size = 256): DataTexture {
  return normalMapFrom('micro', size, 2.2, (x, y) => {
    const s = 1 / 16;
    return fbm2D(x * s, y * s, 7717, 4) * 0.6 + valueNoise2D(x * 0.5, y * 0.5, 991) * 0.4;
  });
}

/** Grain for wood, bark and planks. */
export function barkNormal(size = 256): DataTexture {
  return normalMapFrom('bark', size, 2.6, (x, y) => {
    const rings = Math.sin((x * 0.22 + fbm2D(x * 0.02, y * 0.09, 313, 3) * 5) * Math.PI);
    return rings * 0.5 + fbm2D(x * 0.16, y * 0.03, 44, 3) * 0.5;
  });
}

/** Crystalline facets for the Frosted mutation. */
export function iceNormal(size = 256): DataTexture {
  return normalMapFrom('ice', size, 3.4, (x, y) => {
    // Cheap Worley: distance to the nearest of a few jittered cell points.
    const cell = 32;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    let best = 1e9;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const px = (cx + i + hash2D(cx + i, cy + j, 5)) * cell;
        const py = (cy + j + hash2D(cx + i, cy + j, 9)) * cell;
        best = Math.min(best, Math.hypot(px - x, py - y));
      }
    }
    return 1 - Math.min(1, best / cell);
  });
}

/** Brushed streaks for the Golden mutation. */
export function brushedNormal(size = 256): DataTexture {
  return normalMapFrom('brushed', size, 1.4, (x, y) => valueNoise2D(x * 1.6, y * 0.05, 71));
}

/**
 * A ground albedo tile.
 *
 * Two colours mottled by fBm plus a scatter of darker flecks. No pure black
 * and no pure white anywhere -- real ground never has either, and putting
 * them in an albedo is the fastest way to make PBR look wrong.
 */
export function groundAlbedo(
  key: string,
  lowColour: string,
  highColour: string,
  size = 256,
): DataTexture {
  return cached(`ground:${key}:${size}`, () => {
    const lo = hexToRgb(lowColour);
    const hi = hexToRgb(highColour);
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm2D(x * 0.035, y * 0.035, 1201, 4);
        const detail = valueNoise2D(x * 0.31, y * 0.31, 88) * 0.22;
        const t = clamp01(n * 1.15 + detail - 0.12);
        const fleck = hash2D(x, y, 4242) > 0.985 ? -0.22 : 0;
        const i = (y * size + x) * 4;
        data[i] = clampByte(lerp(lo.r, hi.r, t) * (1 + fleck));
        data[i + 1] = clampByte(lerp(lo.g, hi.g, t) * (1 + fleck));
        data[i + 2] = clampByte(lerp(lo.b, hi.b, t) * (1 + fleck));
        data[i + 3] = 255;
      }
    }
    return makeTexture(size, data, true);
  });
}

/**
 * Roughness map.
 *
 * Flat roughness is the single most common thing that makes a real-time scene
 * look like a toy: every surface catches the light identically. Breaking it up
 * with noise costs one texture read and buys most of the realism.
 */
export function roughnessMap(key: string, base: number, variance: number, size = 256): DataTexture {
  return cached(`rough:${key}:${base}:${variance}:${size}`, () => {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm2D(x * 0.05, y * 0.05, 909, 3) - 0.5;
        const v = clamp(base + n * variance * 2, 0.04, 0.99);
        const i = (y * size + x) * 4;
        const byte = Math.round(v * 255);
        data[i] = byte;
        data[i + 1] = byte;
        data[i + 2] = byte;
        data[i + 3] = 255;
      }
    }
    return makeTexture(size, data, false);
  });
}

/**
 * An egg shell pattern, as an albedo tile.
 *
 * Each of the five patterns is a different function of the same noise field,
 * so a Mossling egg and a Sunscarab egg are recognisably different objects
 * before you read a single word of UI.
 */
export type ShellPattern = 'speckle' | 'band' | 'swirl' | 'plain' | 'star';

export function shellAlbedo(
  pattern: ShellPattern,
  baseColour: string,
  markColour: string,
  size = 128,
): DataTexture {
  return cached(`shell:${pattern}:${baseColour}:${markColour}:${size}`, () => {
    const base = hexToRgb(baseColour);
    const mark = hexToRgb(markColour);
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        let t: number;

        switch (pattern) {
          case 'speckle': {
            const n = fbm2D(x * 0.14, y * 0.14, 21, 4);
            t = n > 0.58 ? 0.85 : 0;
            break;
          }
          case 'band': {
            const wobble = fbm2D(x * 0.05, y * 0.02, 33, 3) * 0.16;
            t = Math.abs(Math.sin((v * 5 + wobble) * Math.PI)) > 0.78 ? 1 : 0;
            break;
          }
          case 'swirl': {
            const cx = u - 0.5;
            const cy = v - 0.5;
            const angle = Math.atan2(cy, cx);
            const radius = Math.hypot(cx, cy);
            t = Math.sin(angle * 3 + radius * 22) > 0.4 ? 0.9 : 0;
            break;
          }
          case 'plain': {
            t = fbm2D(x * 0.03, y * 0.03, 5, 3) * 0.35;
            break;
          }
          case 'star': {
            const cx = u - 0.5;
            const cy = v - 0.5;
            const angle = Math.atan2(cy, cx);
            const radius = Math.hypot(cx, cy) * 2;
            const points = 5;
            const star = 0.55 + 0.35 * Math.cos(angle * points);
            t = radius < star ? 1 : 0;
            break;
          }
          default:
            t = 0;
            break;
        }

        // Always a little mottling underneath, so nothing is a flat fill.
        const mottle = (fbm2D(x * 0.09, y * 0.09, 707, 3) - 0.5) * 0.12;
        const i = (y * size + x) * 4;
        data[i] = clampByte(lerp(base.r, mark.r, t) * (1 + mottle));
        data[i + 1] = clampByte(lerp(base.g, mark.g, t) * (1 + mottle));
        data[i + 2] = clampByte(lerp(base.b, mark.b, t) * (1 + mottle));
        data[i + 3] = 255;
      }
    }
    return makeTexture(size, data, true);
  });
}

/**
 * Alpha-cutout texture for a leafy foliage card.
 *
 * Without this, every grass quad renders as a solid rectangle and a meadow
 * looks like scattered paper. The alpha channel carves the quad into a few
 * tapered blades; the RGB channel carries a root-to-tip gradient so the base
 * of a clump sits darker than the tips, which is most of what sells depth in
 * a grass field.
 */
export function foliageAlpha(kind: 'grass' | 'fern' | 'reed', size = 128): DataTexture {
  return cached(`foliage-alpha:${kind}:${size}`, () => {
    const data = new Uint8Array(size * size * 4);

    interface Blade {
      base: number;
      lean: number;
      width: number;
      top: number;
    }

    const blades: Blade[] = [];
    const count = kind === 'grass' ? 6 : kind === 'fern' ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      blades.push({
        base: t + (hash2D(i, 3, 17) - 0.5) * (0.7 / count),
        // Blades lean away from the centre of the clump, more at the tips.
        lean: (t - 0.5) * (kind === 'reed' ? 0.12 : 0.42) + (hash2D(i, 7, 23) - 0.5) * 0.16,
        width:
          (kind === 'reed' ? 0.055 : kind === 'fern' ? 0.075 : 0.05) *
          (0.7 + hash2D(i, 11, 29) * 0.6),
        top: kind === 'reed' ? 0.98 : 0.55 + hash2D(i, 13, 31) * 0.45,
      });
    }

    for (let y = 0; y < size; y++) {
      // v is 0 at the root, 1 at the top of the quad.
      const v = y / (size - 1);
      for (let x = 0; x < size; x++) {
        const u = x / (size - 1);
        let alpha = 0;
        let shade = 0;

        for (const blade of blades) {
          if (v > blade.top) continue;
          const along = v / blade.top;
          // Quadratic lean, so a blade curves rather than tilting rigidly.
          const centre = blade.base + blade.lean * along * along;
          const halfWidth = blade.width * (1 - along * 0.88);
          const distance = Math.abs(u - centre);
          if (distance > halfWidth) continue;
          // Soften the very edge so alpha testing does not produce a staircase.
          const edge = 1 - Math.min(1, distance / Math.max(halfWidth, 0.001));
          alpha = Math.max(alpha, Math.min(1, edge * 6));
          shade = Math.max(shade, along);
        }

        // Ferns get a mid-rib so they do not read as plain strips.
        if (kind === 'fern' && alpha > 0 && Math.abs(u - 0.5) < 0.012) shade *= 0.65;

        const i = (y * size + x) * 4;
        // Root darker than tip: cheap ambient occlusion baked into the card.
        const luminance = 0.55 + shade * 0.45;
        data[i] = clampByte(255 * luminance);
        data[i + 1] = clampByte(255 * luminance);
        data[i + 2] = clampByte(255 * luminance * 0.96);
        data[i + 3] = Math.round(alpha * 255);
      }
    }
    return makeTexture(size, data, true);
  });
}

// --- helpers ---------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/**
 * Clamp to a byte, but never to pure black or pure white.
 *
 * Real albedo has no 0 and no 255. Letting them through is what makes a
 * physically-based render look like a cartoon of one.
 */
function clampByte(v: number): number {
  return Math.round(clamp(v, 12, 243));
}
