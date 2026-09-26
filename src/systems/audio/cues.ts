/**
 * The cue registry.
 *
 * Every sound the game can make is declared here, and every declaration
 * carries the caption that must appear on screen with it. That is the
 * accessibility rule stated as data rather than as a promise: nothing is
 * communicated by sound alone.
 *
 * `tests/unit/cues.test.ts` walks this table and fails the build if any cue
 * lacks a caption or an icon, so the rule cannot be quietly broken by adding
 * a sound and forgetting the words.
 */

export type CueId =
  | 'egg-grab'
  | 'egg-recover'
  | 'chase-start'
  | 'egg-drop'
  | 'egg-deposit'
  | 'egg-hatch'
  | 'egg-respawn'
  | 'coin'
  | 'upgrade'
  | 'discovery'
  | 'fuse'
  | 'guardian-alert'
  | 'guardian-giveup'
  | 'guardian-drowsy'
  | 'caught'
  | 'rival-target'
  | 'rival-claim'
  | 'tool-throw'
  | 'tool-land'
  | 'footstep-grass'
  | 'footstep-stone'
  | 'footstep-water'
  | 'footstep-sand'
  | 'jump'
  | 'land'
  | 'vault'
  | 'slide'
  | 'splash'
  | 'biome-unlock'
  | 'ui-open'
  | 'ui-close'
  | 'ui-confirm'
  | 'ui-deny'
  | 'photo-shutter';

export interface Cue {
  readonly id: CueId;
  /** Shown in the caption track. Plain words, present tense, reading age 8. */
  readonly caption: string;
  /** Paired icon. Every caption has one; no caption is text alone. */
  readonly icon: string;
  /** How long the caption stays up, in seconds. */
  readonly seconds: number;
  /**
   * Ambient and footstep cues are continuous and would flood the caption
   * track. They are still declared here -- and still have a caption, used by
   * the accessibility summary in the Parent Panel -- but they are not pushed
   * on every occurrence.
   */
  readonly continuous: boolean;
  readonly channel: 'sfx' | 'music' | 'ambience';
  /**
   * A warning about danger right now. The caption track holds two lines, and
   * when it is full an urgent line outlasts the others: a grab, a chase and
   * a tumble can land inside half a second, and "A guardian is chasing you!"
   * used to be the one pushed off.
   */
  readonly urgent?: boolean;
}

export const CUES: Record<CueId, Cue> = {
  'egg-recover': {
    id: 'egg-recover',
    caption: 'You scoop the egg back up!',
    icon: 'egg',
    seconds: 2.5,
    continuous: false,
    channel: 'sfx',
  },
  'chase-start': {
    id: 'chase-start',
    urgent: true,
    // Short on purpose: it has to be read at a glance, mid-sprint.
    caption: 'A guardian is chasing you!',
    icon: 'alert',
    seconds: 3,
    continuous: false,
    channel: 'sfx',
  },
  'egg-grab': {
    id: 'egg-grab',
    caption: 'You pick up the egg.',
    icon: 'egg',
    seconds: 2.5,
    continuous: false,
    channel: 'sfx',
  },
  'egg-drop': {
    id: 'egg-drop',
    caption: 'You put the egg down gently.',
    icon: 'egg',
    seconds: 2,
    continuous: false,
    channel: 'sfx',
  },
  'egg-deposit': {
    id: 'egg-deposit',
    caption: 'The egg is in the incubator.',
    icon: 'egg-warm',
    seconds: 3,
    continuous: false,
    channel: 'sfx',
  },
  'egg-hatch': {
    id: 'egg-hatch',
    caption: 'Crack! Something has hatched.',
    icon: 'egg-warm',
    seconds: 3.5,
    continuous: false,
    channel: 'sfx',
  },
  'egg-respawn': {
    id: 'egg-respawn',
    caption: 'A new egg has appeared in a nest.',
    icon: 'egg',
    seconds: 2.5,
    continuous: false,
    channel: 'sfx',
  },
  coin: {
    id: 'coin',
    caption: 'A visitor leaves a donation.',
    icon: 'coin',
    seconds: 1.9,
    continuous: true,
    channel: 'sfx',
  },
  upgrade: {
    id: 'upgrade',
    caption: 'Upgrade bought!',
    icon: 'boot-run',
    seconds: 2.5,
    continuous: false,
    channel: 'sfx',
  },
  discovery: {
    id: 'discovery',
    caption: 'A species nobody has recorded before!',
    icon: 'book',
    seconds: 4,
    continuous: false,
    channel: 'sfx',
  },
  fuse: {
    id: 'fuse',
    caption: 'Three became one.',
    icon: 'fuse',
    seconds: 3,
    continuous: false,
    channel: 'sfx',
  },
  'guardian-alert': {
    id: 'guardian-alert',
    caption: 'A guardian has heard something.',
    icon: 'ear',
    seconds: 2.5,
    continuous: false,
    channel: 'sfx',
  },
  'guardian-giveup': {
    id: 'guardian-giveup',
    caption: 'The guardian has given up. You are safe.',
    icon: 'calm',
    seconds: 3,
    continuous: false,
    channel: 'music',
  },
  'guardian-drowsy': {
    id: 'guardian-drowsy',
    caption: 'The guardian yawns and slows down.',
    icon: 'berry',
    seconds: 3,
    continuous: false,
    channel: 'sfx',
  },
  caught: {
    id: 'caught',
    caption: 'Shooed away! You tumble over and drop the egg.',
    icon: 'shoo',
    seconds: 3.5,
    continuous: false,
    channel: 'sfx',
  },
  'rival-target': {
    id: 'rival-target',
    caption: 'A rival club is heading for a nest.',
    icon: 'rival',
    seconds: 3,
    continuous: false,
    channel: 'sfx',
  },
  'rival-claim': {
    id: 'rival-claim',
    caption: 'A rival club got there first.',
    icon: 'rival',
    seconds: 3,
    continuous: false,
    channel: 'sfx',
  },
  'tool-throw': {
    id: 'tool-throw',
    caption: 'You throw it.',
    icon: 'seeds',
    seconds: 1.8,
    continuous: false,
    channel: 'sfx',
  },
  'tool-land': {
    id: 'tool-land',
    caption: 'It lands with a rustle.',
    icon: 'seeds',
    seconds: 2.5,
    continuous: false,
    channel: 'sfx',
  },
  'footstep-grass': {
    id: 'footstep-grass',
    caption: 'Footsteps on grass.',
    icon: 'boot',
    seconds: 1.3,
    continuous: true,
    channel: 'sfx',
  },
  'footstep-stone': {
    id: 'footstep-stone',
    caption: 'Footsteps on stone.',
    icon: 'boot',
    seconds: 1.3,
    continuous: true,
    channel: 'sfx',
  },
  'footstep-water': {
    id: 'footstep-water',
    caption: 'Splashing through water.',
    icon: 'boot',
    seconds: 1.7,
    continuous: true,
    channel: 'sfx',
  },
  'footstep-sand': {
    id: 'footstep-sand',
    caption: 'Footsteps on sand.',
    icon: 'boot',
    seconds: 1.2,
    continuous: true,
    channel: 'sfx',
  },
  jump: {
    id: 'jump',
    caption: 'You jump.',
    icon: 'sprint',
    seconds: 1,
    continuous: true,
    channel: 'sfx',
  },
  land: {
    id: 'land',
    caption: 'You land.',
    icon: 'boot',
    seconds: 1,
    continuous: true,
    channel: 'sfx',
  },
  vault: {
    id: 'vault',
    caption: 'You vault over.',
    icon: 'sprint',
    seconds: 1.4,
    continuous: true,
    channel: 'sfx',
  },
  slide: {
    id: 'slide',
    caption: 'You slide.',
    icon: 'crouch',
    seconds: 1.4,
    continuous: true,
    channel: 'sfx',
  },
  splash: {
    id: 'splash',
    caption: 'Splash!',
    icon: 'boot',
    seconds: 1.5,
    continuous: true,
    channel: 'sfx',
  },
  'biome-unlock': {
    id: 'biome-unlock',
    caption: 'A new part of the reserve has opened!',
    icon: 'map',
    seconds: 4.5,
    continuous: false,
    channel: 'music',
  },
  'ui-open': {
    id: 'ui-open',
    caption: 'Menu opened.',
    icon: 'settings',
    seconds: 1,
    continuous: true,
    channel: 'sfx',
  },
  'ui-close': {
    id: 'ui-close',
    caption: 'Menu closed.',
    icon: 'settings',
    seconds: 1,
    continuous: true,
    channel: 'sfx',
  },
  'ui-confirm': {
    id: 'ui-confirm',
    caption: 'Done.',
    icon: 'tick',
    seconds: 1,
    continuous: true,
    channel: 'sfx',
  },
  'ui-deny': {
    id: 'ui-deny',
    caption: 'Not yet — keep collecting.',
    icon: 'coin',
    seconds: 2,
    continuous: false,
    channel: 'sfx',
  },
  'photo-shutter': {
    id: 'photo-shutter',
    caption: 'Photo taken.',
    icon: 'camera',
    seconds: 2,
    continuous: false,
    channel: 'sfx',
  },
};

export const CUE_IDS = Object.keys(CUES) as CueId[];
