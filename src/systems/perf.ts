/**
 * Frame-time and draw-call monitoring.
 *
 * Feeds two consumers: the F3 overlay, and the adaptive quality controller
 * that steps the preset down when the budget is being missed. Measure, don't
 * assume -- a performance budget you cannot see is a wish.
 *
 * Deliberately allocation-free and cheap enough to leave on permanently.
 */

import { PERFORMANCE_BUDGET } from '../data/balance';
import { AdaptiveQuality, type QualityLevel } from '../render/quality';
import { testHookEnabled } from './testHook';

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  /** 95th percentile over the last window. Hitches matter more than means. */
  p95Ms: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  textureMemoryMb: number;
  quality: QualityLevel | 'unknown';
  overBudget: boolean;
}

interface RendererInfo {
  render: { calls: number; triangles: number };
  memory: { geometries: number; textures: number };
  programs?: { length: number } | null;
}

const WINDOW = 90;

class PerfMonitor {
  private readonly times = new Float32Array(WINDOW);
  private cursor = 0;
  private filled = 0;
  private adaptive: AdaptiveQuality | null = null;
  private elapsed = 0;

  readonly snapshot: PerfSnapshot = {
    fps: 0,
    frameMs: 0,
    p95Ms: 0,
    drawCalls: 0,
    triangles: 0,
    programs: 0,
    textureMemoryMb: 0,
    quality: 'unknown',
    overBudget: false,
  };

  configure(adaptive: boolean, level: QualityLevel, onDrop: (level: QualityLevel) => void): void {
    this.snapshot.quality = level;
    this.adaptive = adaptive ? new AdaptiveQuality(level, onDrop) : null;
  }

  frame(delta: number, info: RendererInfo): void {
    const ms = delta * 1000;
    this.elapsed += ms;

    this.times[this.cursor] = ms;
    this.cursor = (this.cursor + 1) % WINDOW;
    if (this.filled < WINDOW) this.filled += 1;

    const s = this.snapshot;
    s.frameMs = ms;
    s.fps = ms > 0 ? 1000 / ms : 0;
    s.drawCalls = info.render.calls;
    s.triangles = info.render.triangles;
    s.programs = info.programs?.length ?? 0;
    // Rough: an RGBA8 texture with mipmaps, averaged. Enough to spot a leak,
    // which is all a live counter is good for.
    s.textureMemoryMb = Math.round((info.memory.textures * 1.4 * 1024 * 1024) / 1_048_576);
    s.p95Ms = this.percentile(0.95);
    s.overBudget =
      s.p95Ms > PERFORMANCE_BUDGET.cpuFrameMs + PERFORMANCE_BUDGET.gpuFrameMs ||
      s.drawCalls > PERFORMANCE_BUDGET.drawCalls ||
      s.triangles > PERFORMANCE_BUDGET.triangles;

    this.adaptive?.sample(ms, this.elapsed);
    if (this.adaptive !== null) s.quality = this.adaptive.level;

    // Mirrored onto window for the e2e perf assertions. Read-only, and only
    // when the test hook is on.
    if (testHookEnabled() && typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__eggheistRenderInfo = s;
    }
  }

  private percentile(p: number): number {
    if (this.filled === 0) return 0;
    // Copy-and-sort over 90 floats, once per frame, is under a microsecond.
    const sorted = Array.from(this.times.subarray(0, this.filled)).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  }
}

export const perfMonitor = new PerfMonitor();
export const BUDGET = PERFORMANCE_BUDGET;
