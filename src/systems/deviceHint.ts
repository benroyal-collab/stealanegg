/**
 * A tiny bridge so the UI can know which input device is live, and fire
 * actions from on-screen buttons, without threading the InputManager through
 * the whole React tree.
 *
 * Module-level rather than context: this is read during render by prompt
 * chips that would otherwise re-render the world when the device changes.
 */

import type { ActionId, InputDevice, InputManager } from './input';

let manager: InputManager | null = null;
let device: InputDevice = 'keyboard';
const listeners = new Set<(device: InputDevice) => void>();

export function registerInputManager(next: InputManager | null): void {
  manager = next;
}

export function reportDevice(next: InputDevice): void {
  if (next === device) return;
  device = next;
  for (const listener of listeners) listener(next);
}

export function lastInputDevice(): InputDevice {
  return device;
}

export function subscribeDevice(listener: (device: InputDevice) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fire an action from an on-screen control. */
export function pressVirtual(action: ActionId): void {
  manager?.press(action);
}

/** Feed the virtual stick from the touch controls. */
export function setVirtualStick(patch: {
  moveX?: number;
  moveY?: number;
  lookX?: number;
  lookY?: number;
  sprint?: boolean;
  crouch?: boolean;
}): void {
  manager?.setExternalStick(patch);
}
