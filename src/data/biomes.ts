/**
 * Biome definitions: the pace gate, the guardian, the palette and the
 * lighting rig. Everything visual about a biome that isn't geometry is a
 * number in here, which is what lets the three of them read as genuinely
 * different places rather than three tints of the same place.
 */

import type { BiomeId, GuardianConfig } from '../sim/types';

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
    guardian: {
      visionConeDegrees: 54,
      visionRange: 14,
      alertSeconds: 1.5,
      investigateSeconds: 5,
      giveUpSeconds: 3,
      cooldownSeconds: 7,
      drowsySeconds: 8,
      patrolSpeed: 1.5,
      chaseSpeed: 4.2,
      turnRate: 130,
    },
    signatureMechanic: 'Wide sightlines and generous cover. The game teaches itself here.',
    lighting: {
      sunElevation: 8.5,
      sunAzimuth: 108,
      sunColour: '#ffd9a0',
      sunIntensity: 3.4,
      skyTint: '#7fa7c4',
      horizonTint: '#f0c9a0',
      groundTint: '#4c5a3c',
      ambientIntensity: 0.42,
      fogColour: '#cfd9d2',
      fogDensity: 0.017,
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
      heightScale: 7.5,
      noiseFrequency: 0.011,
      octaves: 4,
      ridged: false,
      waterLevel: null,
      waterColourShallow: '#5f8f78',
      waterColourDeep: '#20402f',
      groundColourLow: '#3f4a2c',
      groundColourMid: '#5a6338',
      groundColourHigh: '#7c7a4f',
      cliffColour: '#6b6255',
    },
    foliage: [
      { kind: 'birch', count: 240, minScale: 0.8, maxScale: 1.5, minHeight: -3, maxHeight: 12, maxSlope: 26, windStrength: 0.5, colourVariance: 0.14 },
      { kind: 'pine', count: 70, minScale: 0.9, maxScale: 1.6, minHeight: 1, maxHeight: 14, maxSlope: 30, windStrength: 0.35, colourVariance: 0.12 },
      { kind: 'fern', count: 900, minScale: 0.6, maxScale: 1.3, minHeight: -3, maxHeight: 9, maxSlope: 32, windStrength: 0.9, colourVariance: 0.2 },
      { kind: 'grass', count: 7000, minScale: 0.7, maxScale: 1.4, minHeight: -3, maxHeight: 11, maxSlope: 34, windStrength: 1.0, colourVariance: 0.26 },
      { kind: 'rock', count: 90, minScale: 0.5, maxScale: 1.8, minHeight: -3, maxHeight: 14, maxSlope: 44, windStrength: 0, colourVariance: 0.1 },
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
    guardian: {
      visionConeDegrees: 64,
      visionRange: 20,
      alertSeconds: 1.1,
      investigateSeconds: 6,
      giveUpSeconds: 4,
      cooldownSeconds: 8,
      drowsySeconds: 8,
      patrolSpeed: 2.4,
      chaseSpeed: 7.4,
      turnRate: 62,
    },
    signatureMechanic: 'Water drags at your legs. Reeds cut the Swan line of sight clean.',
    lighting: {
      sunElevation: 15,
      sunAzimuth: 250,
      sunColour: '#cfe0f2',
      sunIntensity: 2.6,
      skyTint: '#93aec2',
      horizonTint: '#dfe8ec',
      groundTint: '#4a5a5c',
      ambientIntensity: 0.58,
      fogColour: '#d7e2e6',
      fogDensity: 0.03,
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
      heightScale: 5.0,
      noiseFrequency: 0.009,
      octaves: 3,
      ridged: false,
      waterLevel: 1.15,
      waterColourShallow: '#6f9aa2',
      waterColourDeep: '#16333d',
      groundColourLow: '#4e5748',
      groundColourMid: '#5c6a52',
      groundColourHigh: '#7d8168',
      cliffColour: '#5f6660',
    },
    foliage: [
      { kind: 'reed', count: 5200, minScale: 0.8, maxScale: 1.9, minHeight: 0.5, maxHeight: 2.4, maxSlope: 30, windStrength: 1.35, colourVariance: 0.22 },
      { kind: 'grass', count: 4200, minScale: 0.6, maxScale: 1.2, minHeight: 1.6, maxHeight: 8, maxSlope: 30, windStrength: 1.0, colourVariance: 0.24 },
      { kind: 'pine', count: 120, minScale: 0.9, maxScale: 1.8, minHeight: 2.4, maxHeight: 10, maxSlope: 30, windStrength: 0.4, colourVariance: 0.12 },
      { kind: 'rock', count: 130, minScale: 0.4, maxScale: 1.5, minHeight: 0.4, maxHeight: 9, maxSlope: 46, windStrength: 0, colourVariance: 0.1 },
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
    guardian: {
      visionConeDegrees: 58,
      visionRange: 22,
      alertSeconds: 1.0,
      investigateSeconds: 7,
      giveUpSeconds: 5,
      cooldownSeconds: 9,
      drowsySeconds: 8,
      patrolSpeed: 2.9,
      chaseSpeed: 8.6,
      turnRate: 165,
    },
    signatureMechanic: 'Almost no cover. It hunts by sound, so plan around your own noise.',
    lighting: {
      sunElevation: 24,
      sunAzimuth: 300,
      sunColour: '#ffcf8a',
      sunIntensity: 4.6,
      skyTint: '#9db6d8',
      horizonTint: '#f6d3a0',
      groundTint: '#8a6a44',
      ambientIntensity: 0.5,
      fogColour: '#e8cfa8',
      fogDensity: 0.012,
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
      heightScale: 12,
      noiseFrequency: 0.008,
      octaves: 3,
      ridged: true,
      waterLevel: null,
      waterColourShallow: '#8aa8a0',
      waterColourDeep: '#2c4a44',
      groundColourLow: '#b08a56',
      groundColourMid: '#c9a06a',
      groundColourHigh: '#e0c390',
      cliffColour: '#8d6f4c',
    },
    foliage: [
      { kind: 'ruin', count: 46, minScale: 0.9, maxScale: 2.6, minHeight: -4, maxHeight: 18, maxSlope: 18, windStrength: 0, colourVariance: 0.08 },
      { kind: 'cactus', count: 130, minScale: 0.7, maxScale: 1.7, minHeight: -4, maxHeight: 16, maxSlope: 24, windStrength: 0.12, colourVariance: 0.14 },
      { kind: 'palm', count: 34, minScale: 1.0, maxScale: 1.8, minHeight: -4, maxHeight: 8, maxSlope: 20, windStrength: 0.7, colourVariance: 0.1 },
      { kind: 'grass', count: 2600, minScale: 0.5, maxScale: 1.0, minHeight: -4, maxHeight: 14, maxSlope: 28, windStrength: 0.8, colourVariance: 0.18 },
      { kind: 'rock', count: 170, minScale: 0.4, maxScale: 2.2, minHeight: -4, maxHeight: 18, maxSlope: 50, windStrength: 0, colourVariance: 0.12 },
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
