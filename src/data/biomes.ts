/**
 * Biome definitions: the pace gate, the guardian, the palette and the
 * lighting rig. Everything visual about a biome that isn't geometry is a
 * number in here, which is what lets the three of them read as genuinely
 * different places rather than three tints of the same place.
 */

import { GUARDIAN } from './balance';
import type { BiomeId, GuardianConfig } from '../sim/types';

/**
 * A guardian, described by what makes it different.
 *
 * The rhythm of a chase -- how fast it reacts, how long it commits, how
 * quickly it re-arms -- is the feel of the whole game, so it lives in one
 * place and every biome shares it. Only perception and aggression vary.
 *
 * This is not tidiness. Each biome used to spell out its own `alertSeconds`,
 * `giveUpSeconds` and `cooldownSeconds`, and they had quietly drifted away
 * from the values in `balance.ts`: Whisper Glade reacted in 1.5 seconds where
 * the tuning file said 1.2, so the file everyone reads to understand the game
 * described a guardian that did not exist.
 */
function guardian(
  distinctive: Pick<
    GuardianConfig,
    'visionConeDegrees' | 'visionRange' | 'patrolSpeed' | 'chaseAggression' | 'turnRate'
  >,
): GuardianConfig {
  return {
    alertSeconds: GUARDIAN.alertSeconds,
    investigateSeconds: GUARDIAN.investigateSeconds,
    giveUpSeconds: GUARDIAN.giveUpSeconds,
    cooldownSeconds: GUARDIAN.cooldownSeconds,
    drowsySeconds: GUARDIAN.drowsySeconds,
    ...distinctive,
  };
}

export interface BiomeLighting {
  /** Sun elevation and azimuth in degrees. */
  readonly sunElevation: number;
  readonly sunAzimuth: number;
  readonly sunColour: string;
  readonly sunIntensity: number;
  readonly skyTint: string;
  readonly horizonTint: string;
  readonly groundTint: string;
  readonly ambientIntensity: number;
  readonly fogColour: string;
  readonly fogDensity: number;
  /** Rayleigh/mie knobs for the procedural sky. */
  readonly turbidity: number;
  readonly rayleigh: number;
  readonly mieCoefficient: number;
  readonly mieDirectionalG: number;
  readonly exposure: number;
  readonly volumetricStrength: number;
  readonly bloomIntensity: number;
}

export interface BiomeTerrain {
  /** World size in metres. Play areas are deliberately compact and readable. */
  readonly size: number;
  readonly resolution: number;
  readonly heightScale: number;
  readonly noiseFrequency: number;
  readonly octaves: number;
  readonly ridged: boolean;
  /** Height at which water sits, or null for a dry biome. */
  readonly waterLevel: number | null;
  readonly waterColourShallow: string;
  readonly waterColourDeep: string;
  readonly groundColourLow: string;
  readonly groundColourMid: string;
  readonly groundColourHigh: string;
  readonly cliffColour: string;
}

export interface FoliageLayer {
  readonly kind: 'birch' | 'pine' | 'fern' | 'grass' | 'reed' | 'rock' | 'palm' | 'cactus' | 'ruin';
  readonly count: number;
  readonly minScale: number;
  readonly maxScale: number;
  /** Only scatter between these terrain heights. */
  readonly minHeight: number;
  readonly maxHeight: number;
  /** Only scatter on slopes flatter than this, in degrees. */
  readonly maxSlope: number;
  readonly windStrength: number;
  readonly colourVariance: number;
}

export interface BiomeDef {
  readonly id: BiomeId;
  readonly name: string;
  readonly tagline: string;
  readonly order: number;
  /** Pace in m/s required to unlock. Biome 1 is free. */
  readonly paceGate: number;
  readonly incomeRange: readonly [number, number];
  readonly guardianName: string;
  readonly guardianBlurb: string;
  readonly guardian: GuardianConfig;
  readonly signatureMechanic: string;
  readonly lighting: BiomeLighting;
  readonly terrain: BiomeTerrain;
  readonly foliage: readonly FoliageLayer[];
  readonly nestCount: number;
  readonly rivalClubs: readonly string[];
  /** Ambient bed synthesis parameters, consumed by the audio director. */
  readonly ambience: {
    readonly bedFrequency: number;
    readonly bedQ: number;
    readonly windLevel: number;
    readonly wildlifeIntervalSeconds: readonly [number, number];
    readonly wildlifePitch: readonly [number, number];
  };
  /** Palette used by the UI so menus recolour with the biome. */
  readonly uiAccent: string;
  readonly uiInk: string;
}

export const BIOME_DEFS: Record<BiomeId, BiomeDef> = {
  glade: {
    id: 'glade',
    name: 'Whisper Glade',
    tagline: 'Dawn woodland. Soft light, soft rules.',
    order: 1,
    paceGate: 0,
    incomeRange: [3, 12],
    guardianName: 'Broody Hen',
    guardianBlurb: 'She grumbles a lot but she is slow, and she gives up quickly.',
    guardian: guardian({
      visionConeDegrees: 54,
      visionRange: 14,
      patrolSpeed: 1.5,
      // Slowest pursuer in the game, and still faster than the player's Pace
      // for the first two seconds. "Slow" here means it turns badly and loses
      // you at corners, not that it cannot keep up.
      chaseAggression: 1.0,
      turnRate: 130,
    }),
    signatureMechanic: 'Wide sightlines and generous cover. The game teaches itself here.',
    lighting: {
      // Low enough to rake long shadows through the birches, high enough that
      // the ground still receives real light. Below about 12 degrees the
      // terrain's N.L term collapses and the whole floor goes to mud.
      sunElevation: 15,
      sunAzimuth: 108,
      sunColour: '#ffd2a0',
      sunIntensity: 6.2,
      skyTint: '#8fb4cc',
      horizonTint: '#f3cfa4',
      groundTint: '#66714c',
      // Ambient buys shape in the shadows; too much of it and the sun stops
      // reading at all. 0.45 leaves shadows blue and legible without going
      // black, which is what dawn under a canopy actually looks like.
      ambientIntensity: 0.45,
      // Fog is matched to the horizon tint, not to a neutral grey. A mismatch
      // draws a hard band where the terrain's fade meets the sky dome.
      fogColour: '#e2d3bc',
      fogDensity: 0.0055,
      turbidity: 4.2,
      rayleigh: 2.6,
      mieCoefficient: 0.008,
      mieDirectionalG: 0.82,
      exposure: 1.0,
      volumetricStrength: 0.85,
      bloomIntensity: 0.42,
    },
    terrain: {
      size: 150,
      resolution: 160,
      heightScale: 11,
      noiseFrequency: 0.019,
      octaves: 5,
      ridged: false,
      waterLevel: null,
      waterColourShallow: '#5f8f78',
      waterColourDeep: '#20402f',
      groundColourLow: '#5c6b3c',
      groundColourMid: '#7f8a52',
      groundColourHigh: '#a39c68',
      cliffColour: '#8a7f6c',
    },
    foliage: [
      {
        kind: 'birch',
        count: 240,
        minScale: 0.8,
        maxScale: 1.5,
        minHeight: -3,
        maxHeight: 12,
        maxSlope: 26,
        windStrength: 0.5,
        colourVariance: 0.14,
      },
      {
        kind: 'pine',
        count: 70,
        minScale: 0.9,
        maxScale: 1.6,
        minHeight: 1,
        maxHeight: 14,
        maxSlope: 30,
        windStrength: 0.35,
        colourVariance: 0.12,
      },
      {
        kind: 'fern',
        count: 900,
        minScale: 0.6,
        maxScale: 1.3,
        minHeight: -3,
        maxHeight: 9,
        maxSlope: 32,
        windStrength: 0.9,
        colourVariance: 0.2,
      },
      {
        kind: 'grass',
        count: 7000,
        minScale: 0.7,
        maxScale: 1.4,
        minHeight: -3,
        maxHeight: 11,
        maxSlope: 34,
        windStrength: 1.0,
        colourVariance: 0.26,
      },
      {
        kind: 'rock',
        count: 90,
        minScale: 0.5,
        maxScale: 1.8,
        minHeight: -3,
        maxHeight: 14,
        maxSlope: 44,
        windStrength: 0,
        colourVariance: 0.1,
      },
    ],
    nestCount: 7,
    rivalClubs: ['Acorn Club', 'The Bramblers'],
    ambience: {
      bedFrequency: 320,
      bedQ: 0.8,
      windLevel: 0.16,
      wildlifeIntervalSeconds: [3.5, 9],
      wildlifePitch: [900, 2400],
    },
    uiAccent: '#8fbf72',
    uiInk: '#eaf3e2',
  },

  mirrormere: {
    id: 'mirrormere',
    name: 'Mirrormere',
    tagline: 'Misty lake. Walk the planks, hide in the reeds.',
    order: 2,
    paceGate: 9.0,
    incomeRange: [15, 60],
    guardianName: 'Sentinel Swan',
    guardianBlurb: 'Fast in a straight line. Terrible at corners. Use that.',
    guardian: guardian({
      visionConeDegrees: 64,
      visionRange: 20,
      patrolSpeed: 2.4,
      // Turns like a barge (62 deg/sec), so the counterplay is corners and
      // reeds rather than raw speed. It is allowed to be quicker in a
      // straight line precisely because it cannot follow you round one.
      chaseAggression: 1.07,
      turnRate: 62,
    }),
    signatureMechanic: 'Water drags at your legs. Reeds cut the Swan line of sight clean.',
    lighting: {
      sunElevation: 21,
      sunAzimuth: 250,
      sunColour: '#dbe8f5',
      sunIntensity: 4.4,
      skyTint: '#9cb8cc',
      horizonTint: '#e4edf1',
      groundTint: '#6b7a78',
      // Higher than the Glade on purpose: mist scatters light in from every
      // direction, so Mirrormere genuinely is a flatter-lit place.
      ambientIntensity: 0.85,
      // Denser than the Glade on purpose -- the mist is the biome -- but well
      // short of the soup that swallowed everything past 40 metres.
      fogColour: '#dfe9ed',
      fogDensity: 0.011,
      turbidity: 8.5,
      rayleigh: 1.4,
      mieCoefficient: 0.02,
      mieDirectionalG: 0.76,
      exposure: 1.05,
      volumetricStrength: 1.15,
      bloomIntensity: 0.5,
    },
    terrain: {
      size: 165,
      resolution: 170,
      heightScale: 6.5,
      noiseFrequency: 0.013,
      octaves: 4,
      ridged: false,
      waterLevel: 1.15,
      waterColourShallow: '#6f9aa2',
      waterColourDeep: '#16333d',
      groundColourLow: '#6d7a64',
      groundColourMid: '#84906f',
      groundColourHigh: '#a5a98c',
      cliffColour: '#828a82',
    },
    foliage: [
      {
        kind: 'reed',
        count: 5200,
        minScale: 0.8,
        maxScale: 1.9,
        minHeight: 0.5,
        maxHeight: 2.4,
        maxSlope: 30,
        windStrength: 1.35,
        colourVariance: 0.22,
      },
      {
        kind: 'grass',
        count: 4200,
        minScale: 0.6,
        maxScale: 1.2,
        minHeight: 1.6,
        maxHeight: 8,
        maxSlope: 30,
        windStrength: 1.0,
        colourVariance: 0.24,
      },
      {
        kind: 'pine',
        count: 120,
        minScale: 0.9,
        maxScale: 1.8,
        minHeight: 2.4,
        maxHeight: 10,
        maxSlope: 30,
        windStrength: 0.4,
        colourVariance: 0.12,
      },
      {
        kind: 'rock',
        count: 130,
        minScale: 0.4,
        maxScale: 1.5,
        minHeight: 0.4,
        maxHeight: 9,
        maxSlope: 46,
        windStrength: 0,
        colourVariance: 0.1,
      },
    ],
    nestCount: 8,
    rivalClubs: ['Heron Society', 'Pebble Crew', 'The Skippers'],
    ambience: {
      bedFrequency: 180,
      bedQ: 1.2,
      windLevel: 0.1,
      wildlifeIntervalSeconds: [4, 11],
      wildlifePitch: [500, 1500],
    },
    uiAccent: '#7fb6c4',
    uiInk: '#e6f1f4',
  },

  dunes: {
    id: 'dunes',
    name: 'Amber Dunes',
    tagline: 'Open sand and old ruins. Nowhere to hide. Listen instead.',
    order: 3,
    paceGate: 13.0,
    incomeRange: [70, 280],
    guardianName: 'Dune Scorpion',
    guardianBlurb: 'It burrows, then pops up ahead of you. Watch the sand.',
    guardian: guardian({
      visionConeDegrees: 58,
      visionRange: 22,
      patrolSpeed: 2.9,
      // The fastest thing in the game, and it corners well. There is nowhere
      // to hide out here, so the escape has to be won on the flat.
      chaseAggression: 1.14,
      turnRate: 165,
    }),
    signatureMechanic: 'Almost no cover. It hunts by sound, so plan around your own noise.',
    lighting: {
      sunElevation: 28,
      sunAzimuth: 300,
      sunColour: '#ffd196',
      sunIntensity: 7.4,
      skyTint: '#a6bfe0',
      horizonTint: '#f8d8a8',
      groundTint: '#a98a5e',
      // Hard desert light: a strong key and a bright sand bounce, but very
      // little sky fill. This is what gives the dunes their long shadows.
      ambientIntensity: 0.55,
      // Clear desert air. What little haze there is comes from the heat-shimmer
      // pass, not from fog.
      fogColour: '#efdcb8',
      fogDensity: 0.0035,
      turbidity: 6.0,
      rayleigh: 1.9,
      mieCoefficient: 0.012,
      mieDirectionalG: 0.8,
      exposure: 0.95,
      volumetricStrength: 0.3,
      bloomIntensity: 0.55,
    },
    terrain: {
      size: 180,
      resolution: 180,
      heightScale: 16,
      noiseFrequency: 0.011,
      octaves: 4,
      ridged: true,
      waterLevel: null,
      waterColourShallow: '#8aa8a0',
      waterColourDeep: '#2c4a44',
      groundColourLow: '#c69a62',
      groundColourMid: '#ddb47a',
      groundColourHigh: '#f0d4a4',
      cliffColour: '#a8845c',
    },
    foliage: [
      {
        kind: 'ruin',
        count: 46,
        minScale: 0.9,
        maxScale: 2.6,
        minHeight: -4,
        maxHeight: 18,
        maxSlope: 18,
        windStrength: 0,
        colourVariance: 0.08,
      },
      {
        kind: 'cactus',
        count: 130,
        minScale: 0.7,
        maxScale: 1.7,
        minHeight: -4,
        maxHeight: 16,
        maxSlope: 24,
        windStrength: 0.12,
        colourVariance: 0.14,
      },
      {
        kind: 'palm',
        count: 34,
        minScale: 1.0,
        maxScale: 1.8,
        minHeight: -4,
        maxHeight: 8,
        maxSlope: 20,
        windStrength: 0.7,
        colourVariance: 0.1,
      },
      {
        kind: 'grass',
        count: 2600,
        minScale: 0.5,
        maxScale: 1.0,
        minHeight: -4,
        maxHeight: 14,
        maxSlope: 28,
        windStrength: 0.8,
        colourVariance: 0.18,
      },
      {
        kind: 'rock',
        count: 170,
        minScale: 0.4,
        maxScale: 2.2,
        minHeight: -4,
        maxHeight: 18,
        maxSlope: 50,
        windStrength: 0,
        colourVariance: 0.12,
      },
    ],
    nestCount: 9,
    rivalClubs: ['Sandpiper Union', 'Ruin Runners', 'Amber Guild'],
    ambience: {
      bedFrequency: 120,
      bedQ: 0.6,
      windLevel: 0.34,
      wildlifeIntervalSeconds: [6, 16],
      wildlifePitch: [700, 1900],
    },
    uiAccent: '#e0a860',
    uiInk: '#f7ead6',
  },
};

export const BIOME_ORDER = ['glade', 'mirrormere', 'dunes'] as const;

export function biomeAt(order: number): BiomeDef | undefined {
  return Object.values(BIOME_DEFS).find((b) => b.order === order);
}
