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
  /**
   * Top speed the solver is currently allowed, carry penalty included.
   *
   * Published here because pursuit speed is a fraction of it: a guardian has
   * to know how fast the thing it is chasing can actually go, and reading it
   * off the live solver is the only way that stays true through upgrades,
   * carry penalties and difficulty.
   */
  pace: number;
  cameraYaw: number;
  justLanded: boolean;
  justJumped: boolean;
  justVaulted: boolean;
  justSlid: boolean;
  interactPressed: boolean;
  toolPressed: boolean;
  /** The full solver state, for the perf overlay and debug readouts. */
  state: MovementState | null;
  /**
   * Shake the camera by this much on the next frame, then reset to zero.
   *
   * A request rather than a call, so gameplay code never has to reach into
   * the camera -- and so the camera stays the one place that decides whether
   * shake is allowed at all (it is off under reduced motion).
   */
  shakeRequest: number;
  /** Seconds of tumble left, so the avatar knows to fall over. */
  tumbleRemaining: number;
  /**
   * How close the nearest pursuer is, 0 (clear) to 1 (on your heels).
   *
   * One number, published by the loop and read by the camera, the movement
   * solver, the post chain and the audio director -- so the fright, the
   * adrenaline and the music always agree about how much danger there
   * actually is.
   */
  pursuitPressure: number;
  /** World bearing to the nearest pursuer, radians. See `pursuitPressure`. */
  pursuitBearing: number;
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
  pace: 0,
  cameraYaw: 0,
  justLanded: false,
  justJumped: false,
  justVaulted: false,
  justSlid: false,
  interactPressed: false,
  toolPressed: false,
  state: null,
  shakeRequest: 0,
  tumbleRemaining: 0,
  pursuitPressure: 0,
  pursuitBearing: 0,
};
