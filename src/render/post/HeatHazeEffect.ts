/**
 * Amber Dunes heat haze.
 *
 * A screen-space warp that rises from the bottom of the frame, strongest near
 * the horizon line and absent overhead -- which is where you actually see
 * shimmer over hot sand. Two sine layers at incommensurate frequencies so it
 * never pulses.
 *
 * Amplitude is deliberately tiny. Anything you can consciously see is too
 * much, and a warp large enough to notice is also large enough to make a
 * child feel seasick.
 */

import { BlendFunction, Effect } from 'postprocessing';
import { Uniform } from 'three';

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uStrength;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uStrength <= 0.0001) {
    outputColor = inputColor;
    return;
  }

  // Strongest just below the horizon, gone by the top of the frame.
  float band = smoothstep(0.85, 0.35, uv.y) * smoothstep(0.0, 0.18, uv.y);

  float wobble = sin(uv.y * 190.0 + uTime * 2.6) * 0.5
               + sin(uv.y * 91.0 - uTime * 1.7) * 0.5;
  float drift = sin(uv.x * 37.0 + uTime * 0.9) * 0.35;

  vec2 offset = vec2((wobble + drift) * uStrength * band, 0.0);
  outputColor = texture2D(inputBuffer, uv + offset);
}
`;

export class HeatHazeEffect extends Effect {
  constructor() {
    super('HeatHazeEffect', FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform<number>>([
        ['uTime', new Uniform(0)],
        ['uStrength', new Uniform(0)],
      ]),
    });
  }

  override update(): void {
    const time = this.uniforms.get('uTime');
    if (time !== undefined) time.value = (time.value as number) + 0.016;
  }

  set strength(value: number) {
    const uniform = this.uniforms.get('uStrength');
    if (uniform !== undefined) uniform.value = value;
  }
}
