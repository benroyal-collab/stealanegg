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
  /**
   * Colour grade, applied at the end of the post chain.
   *
   * ACES already rolls the highlights off, which is correct and also leaves
   * the midtones sitting flat -- the whole frame reads as a log image nobody
   * graded, which is most of what "amateurish" means when the geometry and
   * the lighting are fine. A little contrast puts the blacks back and a
   * little saturation stops the palette washing out into the fog.
   *
   * Per biome, because the three want different things: the Glade is a warm
   * dawn and can take a push, Mirrormere is deliberately misty and must not
   * be crushed into a postcard, the Dunes are already high contrast.
   */
  readonly contrast: number;
  readonly saturation: number;
  /** Brightness of the star field, 0 for none. Every biome is played at night. */
  readonly stars: number;
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
  /**
   * Trodden earth, for the sanctuary clearing.
   *
   * The clearing used to take the cliff colour, which is right in hue --
   * what is under the grass -- but those are cool, desaturated rock tones,
   * and under a low warm sun Whisper Glade's clearing came out the grey of a
   * car park. Packed earth is warmer and lighter than rock, so it gets its
   * own colour.
   */
  readonly pathColour: string;
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
    /**
     * What calls out of the dark. Every biome is played at night, so the
     * wildlife is the night's: an owl in the wood, a loon's wail across the
     * lake, a far-off howl over the dunes. Spooky, and every one of them a
     * real animal minding its own business.
     */
    readonly nightCall: 'owl' | 'loon' | 'howl';
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
      /*
       * Night. The "sun" is the moon: a cold key low enough to rake long
       * shadows through the birches, high enough that the ground still
       * catches it. Fog closes the wood in to forty-odd metres, so what is
       * out there is heard and glimpsed before it is seen -- and the
       * ranger's torch becomes the thing a child steers by.
       */
      sunElevation: 24,
      sunAzimuth: 108,
      sunColour: '#b8ccef',
      sunIntensity: 1.6,
      skyTint: '#0c1828',
      horizonTint: '#26364a',
      groundTint: '#121812',
      // Just enough fill that shadows keep their shape rather than going to
      // a black hole a child cannot read.
      ambientIntensity: 0.38,
      // Matched to the horizon, or the terrain's fade draws a band against
      // the dome.
      fogColour: '#1a2433',
      fogDensity: 0.022,
      turbidity: 2.0,
      rayleigh: 1.0,
      mieCoefficient: 0.006,
      mieDirectionalG: 0.9,
      exposure: 1.4,
      volumetricStrength: 0.6,
      bloomIntensity: 0.85,
      contrast: 0.12,
      saturation: -0.22,
      stars: 1.0,
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
      pathColour: '#a4825a',
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
      wildlifeIntervalSeconds: [7, 16],
      wildlifePitch: [900, 2400],
      nightCall: 'owl',
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
      /*
       * A drowned, misty night. Denser fog than the wood -- the mist is the
       * biome -- and a pale moon high over the water, which is what lets the
       * swan read as a ghost gliding out of it.
       */
      sunElevation: 30,
      sunAzimuth: 250,
      sunColour: '#c4d4e4',
      sunIntensity: 1.3,
      skyTint: '#0f1b24',
      horizonTint: '#303f47',
      groundTint: '#151d1d',
      // Mist scatters light in from everywhere, so it is flatter-lit.
      ambientIntensity: 0.38,
      fogColour: '#26333a',
      fogDensity: 0.03,
      turbidity: 5.0,
      rayleigh: 0.8,
      mieCoefficient: 0.02,
      mieDirectionalG: 0.8,
      exposure: 1.45,
      volumetricStrength: 0.9,
      bloomIntensity: 0.9,
      contrast: 0.1,
      saturation: -0.3,
      stars: 0.45,
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
      pathColour: '#9e9682',
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
      wildlifeIntervalSeconds: [9, 20],
      wildlifePitch: [500, 1500],
      nightCall: 'loon',
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
      /*
       * A harvest moon: huge, low and orange over the dunes, throwing long
       * shadows off every rock and ruin. Clear desert air, so the least fog
       * and the most stars of the three.
       */
      sunElevation: 17,
      sunAzimuth: 300,
      sunColour: '#e2b48e',
      sunIntensity: 1.0,
      skyTint: '#120e1c',
      horizonTint: '#3a2a32',
      groundTint: '#261d16',
      ambientIntensity: 0.3,
      fogColour: '#29212d',
      fogDensity: 0.018,
      turbidity: 2.2,
      rayleigh: 1.1,
      // A tight halo. Wider and the moon's glow became an orange ceiling
      // with the ruins cut out of it.
      mieCoefficient: 0.004,
      mieDirectionalG: 0.93,
      exposure: 1.4,
      volumetricStrength: 0.4,
      bloomIntensity: 0.85,
      contrast: 0.12,
      saturation: -0.14,
      stars: 1.25,
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
      pathColour: '#c89e6a',
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
      wildlifeIntervalSeconds: [12, 26],
      wildlifePitch: [700, 1900],
      nightCall: 'howl',
    },
    uiAccent: '#e0a860',
    uiInk: '#f7ead6',
  },
};

export const BIOME_ORDER = ['glade', 'mirrormere', 'dunes'] as const;

export function biomeAt(order: number): BiomeDef | undefined {
  return Object.values(BIOME_DEFS).find((b) => b.order === order);
}
