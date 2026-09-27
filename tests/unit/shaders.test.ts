import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Shader rules that only real hardware enforces.
 *
 * The first night build went to a playtest and the sky and every dark
 * surface rendered cream-white on an Apple GPU, while every screenshot the
 * gates took looked right. The tests render through software rasterisers,
 * and software rasterisers are forgiving about maths the GLSL spec leaves
 * undefined. A real GPU is not, and it disagrees with them.
 *
 * These two checks read the source for the traps that caused it, because no
 * renderer available to CI will ever fail on them.
 */

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const SRC = sources(join(__dirname, '../../src'));

describe('shaders', () => {
  it('never call smoothstep with falling edges', () => {
    // GLSL leaves smoothstep(e0, e1, x) undefined when e0 >= e1. Write
    // 1.0 - smoothstep(e1, e0, x) instead.
    const literal = /smoothstep\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,/g;
    for (const file of SRC) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(literal)) {
        const e0 = Number(match[1]);
        const e1 = Number(match[2]);
        expect(e0, `${file}: ${match[0]}`).toBeLessThan(e1);
      }
    }
  });

  it('never hand a negative colour to the tone mapper', () => {
    /*
     * The sRGB encode after tone mapping takes a pow of the colour, and pow
     * of a negative number is undefined. The stock BrightnessContrast effect
     * pivots about 0.5 in linear light and drives every dark pixel negative,
     * which at night is most of the frame. It must not come back, and the
     * grade -- the last effect in the chain -- must clamp what it outputs.
     */
    const chain = readFileSync(join(__dirname, '../../src/render/post/PostChain.tsx'), 'utf8');
    expect(chain).not.toMatch(/<BrightnessContrast/);

    const grade = readFileSync(
      join(__dirname, '../../src/render/post/NightGradeEffect.ts'),
      'utf8',
    );
    expect(grade).toMatch(/outputColor = vec4\(clamp\(c, 0\.0,/);

    // And it really is last, so nothing runs between its clamp and the
    // tone mapper.
    const effects = [...chain.matchAll(/<(primitive object=\{(\w+)\}|[A-Z]\w+)[\s/>]/g)].map(
      (m) => m[2] ?? m[1],
    );
    const inComposer = effects.slice(effects.indexOf('EffectComposer') + 1);
    expect(inComposer.at(-1)).toBe('grade');
  });
});
