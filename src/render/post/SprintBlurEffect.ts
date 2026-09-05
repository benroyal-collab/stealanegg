/**
 * Sprint-only directional blur.
 *
 * A radial smear from screen centre, strength driven by how fast the player
 * is moving. Capped at six pixels per the budget, which is enough to sell
 * speed and short of the range where it starts costing legibility -- and
 * legibility matters more than usual when the audience is eight.
 *
 * Off entirely during normal movement, and off entirely under reduced motion.
 * Six taps, so it costs roughly nothing.
 */

import { BlendFunction, Effect } from 'postprocessing';
import { Uniform, type Vector2 } from 'three';

const FRAGMENT = /* glsl */ `
uniform float uStrength;
uniform float uMaxPixels;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uStrength <= 0.001) {
    outputColor = inputColor;
    return;
  }

  vec2 centre = vec2(0.5);
  vec2 toCentre = uv - centre;

  // Leave the middle of the screen sharp. The player is there, and smearing
  // what someone is looking at is how motion blur earns its bad reputation.
  float radial = smoothstep(0.12, 0.75, length(toCentre));
  float pixels = uMaxPixels * uStrength * radial;
  vec2 step = normalize(toCentre + 1e-6) * pixels * texelSize;

  vec4 sum = inputColor;
  sum += texture2D(inputBuffer, uv - step * 0.25);
  sum += texture2D(inputBuffer, uv - step * 0.5);
  sum += texture2D(inputBuffer, uv - step * 0.75);
  sum += texture2D(inputBuffer, uv - step);
  sum += texture2D(inputBuffer, uv - step * 1.25);

  outputColor = sum / 6.0;
}
`;

export class SprintBlurEffect extends Effect {
  constructor(maxPixels = 6) {
    super('SprintBlurEffect', FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform<number | Vector2>>([
        ['uStrength', new Uniform(0)],
        ['uMaxPixels', new Uniform(maxPixels)],
      ]),
    });
  }

  /** 0 for standing still, 1 for full sprint. */
  set strength(value: number) {
    const uniform = this.uniforms.get('uStrength');
    if (uniform !== undefined) uniform.value = Math.max(0, Math.min(1, value));
  }

  get strength(): number {
    return (this.uniforms.get('uStrength')?.value as number) ?? 0;
  }
}
