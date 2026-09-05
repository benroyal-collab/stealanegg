/**
 * The player's per-frame state, deliberately kept out of React.
 *
 * A single module-level object that the controller writes and everything else
 * reads. Pushing a transform through zustand sixty times a second would
 * re-render the whole UI tree for nothing; this is the escape hatch, and it
 * is the only mutable global in the codebase.
 */

import { Vector3 } from 'three';
import type { Gait, MovementState, Stance } from '../../systems/movement';

export interface PlayerRuntime {
  position: Vector3;
  facing: number;
  gait: Gait;
  stance: Stance;
  stamina: number;
  speed: number;
  grounded: boolean;
  inWater: boolean;
  /** How far away a guardian could hear us this frame, in metres. */
  noiseRadius: number;
  cameraYaw: number;
  justLanded: boolean;
  justJumped: boolean;
  justVaulted: boolean;
  justSlid: boolean;
  interactPressed: boolean;
  toolPressed: boolean;
  /** The full solver state, for the perf overlay and debug readouts. */
  state: MovementState | null;
}

export const playerRef: PlayerRuntime = {
  position: new Vector3(),
  facing: 0,
  gait: 'idle',
  stance: 'upright',
  stamina: 0,
  speed: 0,
  grounded: false,
  inWater: false,
  noiseRadius: 0,
  cameraYaw: 0,
  justLanded: false,
  justJumped: false,
  justVaulted: false,
  justSlid: false,
  interactPressed: false,
  toolPressed: false,
  state: null,
};
