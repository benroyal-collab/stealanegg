/**
 * The night grade and the dread vignette, in one pass.
 *
 * **The grade** is the horror-film split tone: cold blue-teal in the
 * shadows, warm where the torch and the sanctuary lanterns land, and blacks
 * lifted a hair off zero the way film stock never quite reaches black. It is
 * what makes the frame read as a night shoot rather than a daytime scene with
 * the lights turned down.
 *
 * **The vignette** closes in as danger does. It reads `pursuitPressure` --
 * the same one number that drives the camera pull-back and the wind -- so as
 * a guardian closes, the edges of the screen darken and drain of colour and
 * the world narrows to the path in front of you. Under pursuit it also beats,
 * gently, like a pulse: a slow swell of the edges, never a flash, well under
 * the 3Hz ceiling, confined to the periphery and switched off entirely under
 * reduced motion.
 */

import { BlendFunction, Effect } from 'postprocessing';
import { Uniform, Vector3 } from 'three';

const FRAGMENT = /* glsl */ `
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uVignette;
uniform float uDread;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));

  // Split tone: cold in the shadows, warm in the light.
  vec3 tint = mix(uShadowTint, uHighlightTint, smoothstep(0.02, 0.5, l));
  c *= tint;

  // Lifted, cold blacks.
  c += vec3(0.0035, 0.005, 0.009);

  // The vignette, tightening as the danger closes.
  vec2 d = uv - 0.5;
  d.x *= 1.3;
  float r = length(d);
  float inner = mix(0.6, 0.34, uDread);
  float edge = smoothstep(inner, inner + 0.5, r);
  c *= 1.0 - edge * clamp(uVignette + uDread * 0.5, 0.0, 0.92);

  // Colour drains from the edges under pursuit.
  float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(grey), edge * uDread * 0.65);

  outputColor = vec4(c, inputColor.a);
}
`;

/** Heart rate at the height of a chase, in beats per second. Under 3Hz, always. */
const MAX_BEAT_HZ = 1.9;

export class NightGradeEffect extends Effect {
  private time = 0;
  private pressure = 0;
  private pulse = true;

  constructor() {
    super('NightGradeEffect', FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform<number | Vector3>>([
        ['uShadowTint', new Uniform(new Vector3(0.8, 0.93, 1.14))],
        ['uHighlightTint', new Uniform(new Vector3(1.1, 1.0, 0.86))],
        ['uVignette', new Uniform(0.42)],
        ['uDread', new Uniform(0)],
      ]),
    });
  }

  /** 0..1, from the player runtime. */
  setPressure(pressure: number, pulse: boolean): void {
    this.pressure = pressure;
    this.pulse = pulse;
  }

  set vignette(value: number) {
    const uniform = this.uniforms.get('uVignette');
    if (uniform !== undefined) uniform.value = value;
  }

  override update(_renderer: unknown, _input: unknown, deltaTime?: number): void {
    this.time += deltaTime ?? 0.016;
    // The pulse quickens as the guardian closes: resting pulse at the edge of
    // danger, racing when it is on your heels.
    const hz = 1.1 + (MAX_BEAT_HZ - 1.1) * this.pressure;
    const beat = this.pulse ? Math.pow(Math.max(0, Math.sin(this.time * Math.PI * 2 * hz)), 6) : 0;
    const dread = this.pressure * (0.85 + 0.15 * beat);
    const uniform = this.uniforms.get('uDread');
    if (uniform !== undefined) uniform.value = dread;
  }
}
