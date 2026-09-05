import { describe, expect, it } from 'vitest';
import { PERFORMANCE_BUDGET } from '../../src/data/balance';
import { QUALITY_PRESETS } from '../../src/render/quality';

/**
 * A static reading of the draw-call budget.
 *
 * The live measurement is in `tests/e2e/perf.spec.ts`; this is the cheap
 * check that keeps the presets coherent with each other, and it runs in
 * milliseconds rather than minutes.
 */

describe('quality presets', () => {
  it('gets strictly more expensive as the preset rises', () => {
    const order = ['low', 'medium', 'high', 'ultra'] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = QUALITY_PRESETS[order[i - 1]!];
      const higher = QUALITY_PRESETS[order[i]!];
      expect(higher.shadowMapSize).toBeGreaterThanOrEqual(lower.shadowMapSize);
      expect(higher.shadowCascades).toBeGreaterThanOrEqual(lower.shadowCascades);
      expect(higher.shadowDistance).toBeGreaterThanOrEqual(lower.shadowDistance);
      expect(higher.foliageDensity).toBeGreaterThanOrEqual(lower.foliageDensity);
      expect(higher.foliageDrawDistance).toBeGreaterThanOrEqual(lower.foliageDrawDistance);
      expect(higher.envResolution).toBeGreaterThanOrEqual(lower.envResolution);
    }
  });

  it('gives ambient occlusion the normal pass it cannot run without', () => {
    /*
     * SSAO does not degrade without a normal pass -- it refuses to run and
     * logs an error. So a preset that asks for AO must also pay for the pass,
     * and a preset that does not want the pass must turn AO off honestly
     * rather than leaving a setting on that does nothing.
     */
    for (const preset of Object.values(QUALITY_PRESETS)) {
      expect(preset.aoNormalPass, `${preset.level} normal pass`).toBe(preset.ambientOcclusion);
    }
    expect(QUALITY_PRESETS.low.ambientOcclusion).toBe(false);
  });

  it('keeps god rays on the top preset only', () => {
    // God rays render the scene a second time into an occlusion buffer, and
    // unlike the AO normal pass nothing else depends on them, so they are the
    // pass that gets cut when the budget is tight.
    expect(QUALITY_PRESETS.low.godRays).toBe(false);
    expect(QUALITY_PRESETS.medium.godRays).toBe(false);
    expect(QUALITY_PRESETS.high.godRays).toBe(false);
    expect(QUALITY_PRESETS.ultra.godRays).toBe(true);
  });

  it('turns everything motion-related off on the low preset', () => {
    const low = QUALITY_PRESETS.low;
    expect(low.motionBlur).toBe(false);
    expect(low.grain).toBe(false);
    expect(low.chromaticAberration).toBe(false);
    expect(low.heatHaze).toBe(false);
    expect(low.particles).toBe(false);
  });

  it('states a budget the presets are actually measured against', () => {
    expect(PERFORMANCE_BUDGET.drawCalls).toBe(450);
    expect(PERFORMANCE_BUDGET.triangles).toBe(1_200_000);
  });
});
