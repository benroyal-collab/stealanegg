/**
 * A read-only window hook used by the Playwright gates.
 *
 * Enabled only in dev or when the page is loaded with `?e2e=1`, because the
 * movement and cold-start gates need to assert on real runtime state and
 * screen-scraping a canvas cannot do that. It exposes nothing that isn't
 * already on screen, and it never accepts input.
 */

import type { PlayerRuntime } from '../render/player/playerRuntime';

export interface TestSample {
  x: number;
  y: number;
  z: number;
  speed: number;
  gait: string;
  stance: string;
  stamina: number;
  grounded: boolean;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraDistance: number;
  frame: number;
  drawCalls: number;
  triangles: number;
}

export interface TestHook {
  readonly enabled: true;
  sample: () => TestSample | null;
  /** Frame counter, so a screenshot can wait for the scene to have settled. */
  frames: () => number;
  /** Every sample since the page loaded, for post-hoc NaN/tunnelling checks. */
  history: () => readonly TestSample[];
  /** Drive movement without a real keyboard. */
  setVirtualInput: (patch: Partial<VirtualInput>) => void;
  ready: () => boolean;
  phase: () => string;
}

export interface VirtualInput {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  interact: boolean;
}

export const virtualInput: VirtualInput = {
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  sprint: false,
  crouch: false,
  jump: false,
  interact: false,
};

let history: TestSample[] = [];
let latest: TestSample | null = null;
let frame = 0;
let readyFlag = false;
let phaseFn: () => string = () => 'unknown';

export function testHookEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('e2e') === '1';
}

export function installTestHook(getPhase: () => string): void {
  if (!testHookEnabled() || typeof window === 'undefined') return;
  phaseFn = getPhase;
  const hook: TestHook = {
    enabled: true,
    sample: () => latest,
    frames: () => frame,
    history: () => history,
    setVirtualInput: (patch) => Object.assign(virtualInput, patch),
    ready: () => readyFlag,
    phase: () => phaseFn(),
  };
  (window as unknown as Record<string, unknown>).__eggheist = hook;
}

export function markReady(): void {
  readyFlag = true;
}

export function recordSample(
  player: PlayerRuntime,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  drawCalls = 0,
  triangles = 0,
): void {
  if (!testHookEnabled()) return;
  frame += 1;
  const distance = Math.hypot(
    cameraX - player.position.x,
    cameraY - player.position.y,
    cameraZ - player.position.z,
  );
  latest = {
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    speed: player.speed,
    gait: player.gait,
    stance: player.stance,
    stamina: player.stamina,
    grounded: player.grounded,
    cameraX,
    cameraY,
    cameraZ,
    cameraDistance: distance,
    frame,
    drawCalls,
    triangles,
  };
  // Keep the tail bounded; the gates only ever look at the last few thousand.
  history.push(latest);
  if (history.length > 8000) history = history.slice(-4000);
}
