/**
 * Input: keyboard+mouse, gamepad and touch, all first-class and all live at
 * once. There is no "input mode" to pick -- whichever device the player
 * touches last drives the on-screen prompts, and every device stays polled.
 *
 * Bindings are fully remappable and one-handed play is possible: every action
 * has a keyboard binding that can be moved anywhere, and sprint and crouch
 * each support hold-or-toggle.
 */

import { DEFAULT_BINDINGS } from '../sim/save';

export type ActionId =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'jump'
  | 'crouch'
  | 'interact'
  | 'tool'
  | 'photo'
  | 'menu'
  | 'perf';

export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

export interface FrameInput {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  sprint: boolean;
  crouch: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  toolPressed: boolean;
  photoPressed: boolean;
  menuPressed: boolean;
  perfPressed: boolean;
  device: InputDevice;
}

const STICK_DEADZONE = 0.18;
const TRIGGER_THRESHOLD = 0.5;

export interface ExternalStick {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  sprint: boolean;
  crouch: boolean;
}

export interface InputOptions {
  holdToSprint: boolean;
  holdToCrouch: boolean;
  invertY: boolean;
  lookSensitivity: number;
  bindings: Record<string, string>;
}

/**
 * Polls every device and produces one normalised FrameInput per frame.
 *
 * Edge-triggered actions (jump, interact) are latched on the event and
 * cleared by `consume()`, so a button press can never be missed between
 * frames -- which is half of what the 150ms input buffer is protecting.
 */
export class InputManager {
  private readonly held = new Set<string>();
  private readonly latched = new Set<ActionId>();
  private options: InputOptions;
  private device: InputDevice = 'keyboard';
  private pointerLocked = false;

  private lookDeltaX = 0;
  private lookDeltaY = 0;

  private sprintToggle = false;
  private crouchToggle = false;

  /**
   * Virtual stick state, fed by the on-screen touch controls and, in e2e
   * runs, by the test hook. Private with a setter rather than public fields
   * so callers cannot half-update it.
   */
  private readonly virtual: ExternalStick = {
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    sprint: false,
    crouch: false,
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.device = 'keyboard';
    this.held.add(e.code);
    const action = this.actionFor(e.code);
    if (action !== null) {
      this.latched.add(action);
      if (action === 'sprint' && !this.options.holdToSprint) this.sprintToggle = !this.sprintToggle;
      if (action === 'crouch' && !this.options.holdToCrouch) this.crouchToggle = !this.crouchToggle;
      // Space and the arrows scroll the page; the game owns them while playing.
      if (SWALLOWED.has(e.code)) e.preventDefault();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.device = 'keyboard';
    this.lookDeltaX += e.movementX;
    this.lookDeltaY += e.movementY;
  };

  private readonly onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement !== null;
  };

  private readonly onBlur = (): void => {
    // Losing focus mid-sprint should not leave the key stuck down.
    this.held.clear();
  };

  private readonly onGamepadConnected = (): void => {
    this.device = 'gamepad';
  };

  constructor(options: InputOptions) {
    this.options = options;
  }

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }

  setOptions(options: InputOptions): void {
    this.options = options;
  }

  get lastDevice(): InputDevice {
    return this.device;
  }

  /**
   * Take just the system-level edges (menu, photo, perf) without disturbing
   * the movement frame.
   *
   * The player controller owns `consume()`; if the system-key handler called
   * it too, one of them would swallow the other's jump press.
   */
  peek(): Pick<FrameInput, 'menuPressed' | 'photoPressed' | 'perfPressed'> {
    return {
      menuPressed: this.takeLatch('menu'),
      photoPressed: this.takeLatch('photo'),
      perfPressed: this.takeLatch('perf'),
    };
  }

  /** Read and clear the frame's input. */
  consume(): FrameInput {
    const gp = readGamepad();
    if (gp !== null && (Math.abs(gp.moveX) > 0 || Math.abs(gp.moveY) > 0 || gp.anyButton)) {
      this.device = 'gamepad';
    }
    const v = this.virtual;
    if (v.moveX !== 0 || v.moveY !== 0 || v.lookX !== 0) {
      this.device = 'touch';
    }

    const kbX = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    const kbY = (this.isHeld('back') ? 1 : 0) - (this.isHeld('forward') ? 1 : 0);

    let moveX = kbX + (gp?.moveX ?? 0) + v.moveX;
    let moveY = kbY + (gp?.moveY ?? 0) + v.moveY;
    const length = Math.hypot(moveX, moveY);
    if (length > 1) {
      moveX /= length;
      moveY /= length;
    }

    const sens = this.options.lookSensitivity;
    const lookX = (this.lookDeltaX * 0.0022 + (gp?.lookX ?? 0) * 0.045 + v.lookX * 0.006) * sens;
    const lookYRaw = (this.lookDeltaY * 0.0022 + (gp?.lookY ?? 0) * 0.045 + v.lookY * 0.006) * sens;
    const lookY = this.options.invertY ? -lookYRaw : lookYRaw;

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    // Look is a delta, not a state: consume it so a flick doesn't keep turning.
    v.lookX = 0;
    v.lookY = 0;

    const sprintHeld = this.isHeld('sprint') || (gp?.sprint ?? false) || v.sprint;
    const crouchHeld = this.isHeld('crouch') || (gp?.crouch ?? false) || v.crouch;

    const input: FrameInput = {
      moveX: applyDeadzone(moveX),
      moveY: applyDeadzone(moveY),
      lookX,
      lookY,
      sprint: this.options.holdToSprint ? sprintHeld : this.sprintToggle,
      crouch: this.options.holdToCrouch ? crouchHeld : this.crouchToggle,
      jumpPressed: this.takeLatch('jump') || (gp?.jumpPressed ?? false),
      interactPressed: this.takeLatch('interact') || (gp?.interactPressed ?? false),
      toolPressed: this.takeLatch('tool') || (gp?.toolPressed ?? false),
      // System keys are claimed by peek(), not here.
      photoPressed: false,
      menuPressed: gp?.menuPressed ?? false,
      perfPressed: false,
      device: this.device,
    };
    return input;
  }

  /** Feed the virtual stick from the touch controls or the e2e hook. */
  setExternalStick(patch: Partial<ExternalStick>): void {
    Object.assign(this.virtual, patch);
  }

  /** Used by the touch layer to fire an action from an on-screen button. */
  press(action: ActionId): void {
    this.device = 'touch';
    this.latched.add(action);
    if (action === 'sprint' && !this.options.holdToSprint) this.sprintToggle = !this.sprintToggle;
    if (action === 'crouch' && !this.options.holdToCrouch) this.crouchToggle = !this.crouchToggle;
  }

  reset(): void {
    this.held.clear();
    this.latched.clear();
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.virtual.moveX = 0;
    this.virtual.moveY = 0;
    this.virtual.sprint = false;
    this.virtual.crouch = false;
    this.sprintToggle = false;
    this.crouchToggle = false;
  }

  private isHeld(action: ActionId): boolean {
    const code = this.options.bindings[action] ?? DEFAULT_BINDINGS[action];
    return code !== undefined && this.held.has(code);
  }

  private takeLatch(action: ActionId): boolean {
    if (!this.latched.has(action)) return false;
    this.latched.delete(action);
    return true;
  }

  private actionFor(code: string): ActionId | null {
    for (const [action, bound] of Object.entries(this.options.bindings)) {
      if (bound === code) return action as ActionId;
    }
    return null;
  }
}

const SWALLOWED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3']);

interface GamepadFrame {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  sprint: boolean;
  crouch: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  toolPressed: boolean;
  menuPressed: boolean;
  anyButton: boolean;
}

const gamepadPrev = new Map<number, boolean[]>();

/** Standard mapping: A=0, B=1, X=2, LB=4, L3=10, Start=9. */
function readGamepad(): GamepadFrame | null {
  if (typeof navigator === 'undefined' || navigator.getGamepads === undefined) return null;
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad === null || !pad.connected) continue;
    const prev = gamepadPrev.get(pad.index) ?? [];
    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number): boolean => (pressed[i] ?? false) && !(prev[i] ?? false);
    gamepadPrev.set(pad.index, pressed);

    return {
      moveX: applyDeadzone(pad.axes[0] ?? 0),
      moveY: applyDeadzone(pad.axes[1] ?? 0),
      lookX: applyDeadzone(pad.axes[2] ?? 0),
      lookY: applyDeadzone(pad.axes[3] ?? 0),
      sprint: (pressed[10] ?? false) || (pad.buttons[6]?.value ?? 0) > TRIGGER_THRESHOLD,
      crouch: pressed[1] ?? false,
      jumpPressed: edge(0),
      interactPressed: edge(2),
      toolPressed: edge(4),
      menuPressed: edge(9),
      anyButton: pressed.some(Boolean),
    };
  }
  return null;
}

export function applyDeadzone(value: number): number {
  const a = Math.abs(value);
  if (a < STICK_DEADZONE) return 0;
  // Rescale so the stick still reaches 1.0 at the rim after the deadzone bite.
  return Math.sign(value) * ((a - STICK_DEADZONE) / (1 - STICK_DEADZONE));
}

/** Human-readable key name for the bindings UI. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return `${code.slice(5)} arrow`;
  const named: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    Escape: 'Esc',
    Tab: 'Tab',
    Enter: 'Enter',
  };
  return named[code] ?? code;
}
