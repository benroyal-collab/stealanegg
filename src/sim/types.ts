/**
 * Shared vocabulary for the headless simulation.
 *
 * Nothing in this file may import a renderer, React or the DOM. The whole
 * point of `sim/` is that a full session can be played out in a Node test
 * with no canvas in sight.
 */

export const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'secret',
] as const;
export type Rarity = (typeof RARITIES)[number];

export const MUTATIONS = ['none', 'golden', 'frosted', 'storm', 'prism'] as const;
export type MutationId = (typeof MUTATIONS)[number];

export const SIZES = ['tiny', 'normal', 'big', 'huge'] as const;
export type SizeId = (typeof SIZES)[number];

export const BIOMES = ['glade', 'mirrormere', 'dunes'] as const;
export type BiomeId = (typeof BIOMES)[number];

export const DIFFICULTIES = ['relaxed', 'standard', 'ranger'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const TOOLS = ['seedPouch', 'sleepyBerries', 'whistle'] as const;
export type ToolId = (typeof TOOLS)[number];

/** Upgrade tracks. Pace is the spine; everything else supports it. */
export const UPGRADES = [
  'trainingTrack',
  'boots',
  'incubator',
  'habitatSlots',
  'fieldGuide',
] as const;
export type UpgradeId = (typeof UPGRADES)[number];

/** A creature species. Purely descriptive; income comes from `baseIncome`. */
export interface Species {
  readonly id: string;
  readonly name: string;
  readonly biome: BiomeId;
  readonly rarity: Rarity;
  /** Donations per second at Normal size with no mutation. */
  readonly baseIncome: number;
  readonly blurb: string;
  /** Parametric body knobs consumed by the procedural creature builder. */
  readonly body: CreatureBody;
}

export interface CreatureBody {
  readonly palette: readonly [string, string, string];
  readonly bodyRadius: number;
  readonly bodyStretch: number;
  readonly legCount: 0 | 2 | 4 | 6;
  readonly legLength: number;
  readonly earStyle: 'none' | 'round' | 'tall' | 'fin' | 'frill';
  readonly tailStyle: 'none' | 'tuft' | 'long' | 'fan';
  readonly eyeSize: number;
  readonly shellPattern: 'speckle' | 'band' | 'swirl' | 'plain' | 'star';
}

/** An egg lying in the world, or being carried. */
export interface EggRoll {
  readonly speciesId: string;
  readonly rarity: Rarity;
  readonly mutation: MutationId;
  readonly size: SizeId;
}

/** A hatched creature owned by the player. */
export interface OwnedCreature extends EggRoll {
  readonly uid: string;
  /** Habitat slot index, or null when it is waiting in the burrow. */
  readonly slot: number | null;
}

export interface EggInIncubator {
  readonly roll: EggRoll;
  /** Seconds of incubation still owed. */
  readonly remaining: number;
  readonly total: number;
}

export type GuardianState =
  'patrol' | 'alert' | 'investigate' | 'chase' | 'giveUp' | 'cooldown' | 'drowsy';

export interface GuardianPerceptionInput {
  /** Metres from guardian to player. */
  readonly distance: number;
  /** Absolute angle in degrees between guardian facing and the player. */
  readonly angleToPlayer: number;
  /** False when a reed bed, rock or dune breaks the line. */
  readonly hasLineOfSight: boolean;
  /** How loudly the player is currently moving, in metres of audible radius. */
  readonly noiseRadius: number;
  readonly playerIsCarrying: boolean;
}

export interface GuardianConfig {
  readonly visionConeDegrees: number;
  readonly visionRange: number;
  readonly alertSeconds: number;
  readonly investigateSeconds: number;
  readonly giveUpSeconds: number;
  readonly cooldownSeconds: number;
  readonly drowsySeconds: number;
  readonly patrolSpeed: number;
  /**
   * Multiplier on the shared chase fractions in `CHASE`.
   *
   * Not an absolute speed. Pursuit is measured against the player's own Pace
   * so that it stays a chase at every upgrade level -- an absolute number is
   * either impossible at Pace 6 or irrelevant at Pace 22, and the one this
   * replaced managed to be irrelevant on the first run.
   */
  readonly chaseAggression: number;
  /** How sharply it can change heading, in degrees per second. */
  readonly turnRate: number;
}

export interface GuardianRuntime {
  state: GuardianState;
  /** Seconds spent in the current state. */
  timeInState: number;
  /** Seconds since the player was last perceived. */
  timeSinceContact: number;
  /** World position of the last thing worth looking at, if any. */
  investigateTarget: Vec2 | null;
  drowsyFor: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

export interface SaveV1 {
  readonly version: 1;
  money: number;
  /** Seconds of wall-clock play in this save. */
  playSeconds: number;
  lastSeenEpochMs: number;
  pace: number;
  upgrades: Record<UpgradeId, number>;
  creatures: OwnedCreature[];
  incubator: EggInIncubator | null;
  discovered: string[];
  unlockedBiomes: BiomeId[];
  currentBiome: BiomeId;
  tools: Record<ToolId, number>;
  settings: GameSettings;
  tutorialStep: number;
  stats: { eggsRecovered: number; timesCaught: number; racesLost: number };
}

export interface GameSettings {
  difficulty: Difficulty;
  quality: 'low' | 'medium' | 'high' | 'ultra' | 'auto';
  reducedMotion: boolean;
  colourblind: 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';
  captions: boolean;
  uiScale: number;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  holdToSprint: boolean;
  holdToCrouch: boolean;
  invertY: boolean;
  lookSensitivity: number;
  cameraShake: boolean;
  exposure: number;
  breakReminderMinutes: number;
  bindings: Record<string, string>;
}
