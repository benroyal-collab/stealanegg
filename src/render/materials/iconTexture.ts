/**
 * A station sign: the HUD's own icon, drawn onto a round wooden badge.
 *
 * The signs used to be a white disc with a glyph assembled from two or three
 * primitive meshes -- a ring for "coin", a rectangle for "book", three dots
 * for "breeding". At any distance they read as a white disc with a smudge on
 * it, and they bore no resemblance to the icons the HUD uses for the same
 * stations, so a child could not learn one from the other.
 *
 * Drawn at runtime from the same path data as `ui/Icon.tsx`, onto a canvas.
 * Generated, like everything else here, and one draw call per sign instead of
 * up to four.
 */

import { CanvasTexture, SRGBColorSpace } from 'three';
import { ICON_PATHS, type IconName } from '../../ui/iconPaths';

const SIZE = 256;
const cache = new Map<string, CanvasTexture>();

export function iconBadgeTexture(icon: IconName): CanvasTexture {
  const hit = cache.get(icon);
  if (hit !== undefined) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    const c = SIZE / 2;
    // Cream face in a dark wooden rim: high contrast against sky and canopy
    // alike, which is the whole job of a sign.
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.fillStyle = '#4a3626';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, c - 22, 0, Math.PI * 2);
    ctx.fillStyle = '#f0e6cc';
    ctx.fill();

    // The icon, on its 24-unit grid, scaled to sit inside the face.
    const scale = (SIZE - 76) / 24;
    ctx.save();
    ctx.translate(38, 38);
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#33291e';
    ctx.lineWidth = 2.3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(ICON_PATHS[icon]));
    ctx.restore();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(icon, texture);
  return texture;
}
