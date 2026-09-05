/**
 * The F3 performance overlay.
 *
 * Measure, don't assume. This shows the numbers the budget is written in --
 * frame time, 95th percentile, draw calls, triangles -- and turns the panel
 * amber the moment any of them is over. A budget you cannot see is a wish.
 */

import { useEffect, useState } from 'react';
import { BUDGET, perfMonitor } from '../systems/perf';
import { useGame } from '../state/store';

export function PerfOverlay(): React.ReactElement | null {
  const shown = useGame((s) => s.perfOverlay);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!shown) return;
    // Twice a second: fast enough to be useful, slow enough to read.
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [shown]);

  if (!shown) return null;
  const s = perfMonitor.snapshot;

  const line = (label: string, value: string, over: boolean): string =>
    `${label.padEnd(12)}${value}${over ? '  OVER' : ''}`;

  return (
    <div className={`perf${s.overBudget ? ' perf--over' : ''}`} role="status">
      {[
        line('fps', s.fps.toFixed(0), s.fps < 55),
        line('frame', `${s.frameMs.toFixed(2)} ms`, false),
        line('p95', `${s.p95Ms.toFixed(2)} ms`, s.p95Ms > BUDGET.cpuFrameMs + BUDGET.gpuFrameMs),
        line('draws', `${s.drawCalls} / ${BUDGET.drawCalls}`, s.drawCalls > BUDGET.drawCalls),
        line(
          'tris',
          `${(s.triangles / 1000).toFixed(0)}k / ${BUDGET.triangles / 1000}k`,
          s.triangles > BUDGET.triangles,
        ),
        line('programs', String(s.programs), false),
        line('textures', `~${s.textureMemoryMb} MB`, false),
        line('quality', s.quality, false),
      ].join('\n')}
    </div>
  );
}
