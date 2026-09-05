/**
 * Quality presets and auto-detection.
 *
 * Every expensive thing in the renderer reads its settings from here rather
 * than deciding for itself, so "does this hold the frame budget?" has one
 * answer per preset instead of one per feature.
 *
 * The budget wins the argument: if something cannot hold 60fps at High on
 * integrated graphics, it belongs on Ultra or it does not ship.
 */

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  readonly level: QualityLevel;
  /** Device pixel ratio ceiling. */
  readonly maxDpr: number;
  readonly shadowMapSize: number;
  readonly shadowCascades: number;
  readonly shadowDistance: number;
  readonly envResolution: number;
  readonly ambientOcclusion: boolean;
  readonly aoSamples: number;
  /**
   * Render a dedicated normal pass for ambient occlusion.
   *
   * A normal pass is a second full render of the scene, and it measured at
   * roughly 150 draw calls -- the difference between holding the 450 budget
   * at High and missing it. Without it, AO derives its normals from the depth
   * buffer instead: slightly softer around thin geometry, and free.
   */
  readonly aoNormalPass: boolean;
  readonly bloom: boolean;
  readonly godRays: boolean;
  readonly godRaySamples: number;
  readonly antialias: 'none' | 'fxaa' | 'smaa';
  readonly grain: boolean;
  readonly chromaticAberration: boolean;
  readonly vignette: boolean;
  readonly motionBlur: boolean;
  readonly waterReflections: boolean;
  /** Multiplier on every foliage layer's instance count. */
  readonly foliageDensity: number;
  readonly foliageDrawDistance: number;
  readonly terrainDetailSampler: boolean;
  readonly heatHaze: boolean;
  readonly particles: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    level: 'low',
    maxDpr: 1,
    shadowMapSize: 1024,
    shadowCascades: 1,
    shadowDistance: 45,
    envResolution: 64,
    ambientOcclusion: false,
    aoSamples: 0,
    aoNormalPass: false,
    bloom: false,
    godRays: false,
    godRaySamples: 0,
    antialias: 'fxaa',
    grain: false,
    chromaticAberration: false,
    vignette: true,
    motionBlur: false,
    waterReflections: false,
    foliageDensity: 0.45,
    foliageDrawDistance: 60,
    terrainDetailSampler: false,
    heatHaze: false,
    particles: false,
  },
  medium: {
    level: 'medium',
    maxDpr: 1.25,
    shadowMapSize: 2048,
    shadowCascades: 2,
    shadowDistance: 70,
    envResolution: 128,
    ambientOcclusion: true,
    aoSamples: 9,
    aoNormalPass: false,
    bloom: true,
    godRays: false,
    godRaySamples: 0,
    antialias: 'smaa',
    grain: true,
    chromaticAberration: false,
    vignette: true,
    motionBlur: false,
    waterReflections: false,
    foliageDensity: 0.7,
    foliageDrawDistance: 85,
    terrainDetailSampler: true,
    heatHaze: true,
    particles: true,
  },
  high: {
    level: 'high',
    maxDpr: 1.5,
    shadowMapSize: 2048,
    /*
     * Two cascades at High, three only at Ultra.
     *
     * Every shadow-casting object is drawn once per cascade, and the measured
     * draw count at three cascades was 665 against a 450 budget. The budget
     * wins the argument: the third cascade goes to Ultra, where the extra
     * far-distance shadow crispness is what the preset is for.
     */
    shadowCascades: 2,
    shadowDistance: 100,
    envResolution: 256,
    ambientOcclusion: true,
    aoSamples: 16,
    aoNormalPass: false,
    bloom: true,
    godRays: true,
    godRaySamples: 42,
    antialias: 'smaa',
    grain: true,
    chromaticAberration: true,
    vignette: true,
    motionBlur: true,
    waterReflections: true,
    foliageDensity: 1,
    foliageDrawDistance: 110,
    terrainDetailSampler: true,
    heatHaze: true,
    particles: true,
  },
  ultra: {
    level: 'ultra',
    maxDpr: 2,
    shadowMapSize: 4096,
    shadowCascades: 3,
    shadowDistance: 140,
    envResolution: 512,
    ambientOcclusion: true,
    aoSamples: 24,
    aoNormalPass: true,
    bloom: true,
    godRays: true,
    godRaySamples: 64,
    antialias: 'smaa',
    grain: true,
    chromaticAberration: true,
    vignette: true,
    motionBlur: true,
    waterReflections: true,
    foliageDensity: 1.35,
    foliageDrawDistance: 150,
    terrainDetailSampler: true,
    heatHaze: true,
    particles: true,
  },
};

/**
 * Guess a starting preset from what the GPU says it is.
 *
 * This is a first guess and nothing more. The adaptive monitor below is what
 * actually protects the frame rate; string-matching renderer names is a
 * heuristic that ages badly, so it only ever picks a starting point.
 */
export function detectQuality(): QualityLevel {
  if (typeof document === 'undefined') return 'medium';

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (gl === null) return 'low';

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer =
    debugInfo === null
      ? ''
      : String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '').toLowerCase();

  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  // Software rasterisers: anything above Low will crawl.
  if (/swiftshader|llvmpipe|software|mesa offscreen/.test(renderer)) return 'low';

  if (coarsePointer) return memory >= 6 && cores >= 8 ? 'medium' : 'low';

  if (/rtx|radeon rx (6|7|9)|arc a7|apple m[2-9]/.test(renderer)) return 'ultra';
  if (/gtx 1[0-9]{3}|rtx 20|radeon rx 5|apple m1/.test(renderer)) return 'high';
  if (/iris xe|uhd graphics|vega|radeon graphics/.test(renderer)) return 'medium';

  if (memory >= 8 && cores >= 8) return 'high';
  if (memory <= 4 || cores <= 4) return 'low';
  return 'medium';
}

export function resolveQuality(setting: QualityLevel | 'auto'): QualitySettings {
  const level = setting === 'auto' ? detectQuality() : setting;
  return QUALITY_PRESETS[level];
}

/**
 * Watches frame time and steps the preset down when the budget is blown.
 *
 * Only ever downwards, and only after a sustained miss: a preset that
 * oscillates is worse than one that is slightly too low, because the change
 * itself is what the player notices.
 */
export class AdaptiveQuality {
  private samples: number[] = [];
  private lastChange = 0;
  private readonly order: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

  private current: QualityLevel;
  private readonly onChange: (level: QualityLevel) => void;
  private readonly targetMs: number;

  constructor(current: QualityLevel, onChange: (level: QualityLevel) => void, targetMs = 16.7) {
    this.current = current;
    this.onChange = onChange;
    this.targetMs = targetMs;
  }

  sample(frameMs: number, nowMs: number): void {
    this.samples.push(frameMs);
    if (this.samples.length < 120) return;

    const sorted = [...this.samples].sort((a, b) => a - b);
    // 95th percentile, not the mean: a good average with regular hitches is
    // still a bad experience.
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    this.samples = [];

    if (nowMs - this.lastChange < 8000) return;

    const index = this.order.indexOf(this.current);
    if (p95 > this.targetMs * 1.5 && index > 0) {
      this.current = this.order[index - 1]!;
      this.lastChange = nowMs;
      this.onChange(this.current);
    }
  }

  get level(): QualityLevel {
    return this.current;
  }
}
