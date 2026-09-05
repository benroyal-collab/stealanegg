/**
 * Mutations are real material variants, not colour tints. Each one changes
 * the shading model in a way you can see from across the sanctuary, which is
 * the whole point: rarity has to be legible at a glance to an eight year old.
 *
 * Per the accessibility rule, no mutation is signalled by colour alone --
 * every one of them also carries a distinct badge shape and a caption.
 */

import type { MutationId } from '../sim/types';

export interface MutationDef {
  readonly id: MutationId;
  readonly label: string;
  /** Shown next to the label so colour is never the only signal. */
  readonly badge: 'plain' | 'diamond' | 'snowflake' | 'bolt' | 'prism';
  readonly caption: string;
  readonly incomeMultiplier: number;
  readonly material: {
    readonly metalness: number;
    readonly roughness: number;
    readonly emissive: string;
    readonly emissiveIntensity: number;
    /** Fake subsurface wrap term, 0 = off. */
    readonly subsurface: number;
    /** Thin-film iridescence strength, 0 = off. */
    readonly iridescence: number;
    readonly iridescenceIOR: number;
    readonly clearcoat: number;
    /** Animated arc pass, used by Storm only. */
    readonly arcs: boolean;
    /** Normal-map style overlay applied on top of the base shell pattern. */
    readonly detailNormal: 'none' | 'ice' | 'brushed';
    readonly tint: string;
  };
}

export const MUTATION_DEFS: Record<MutationId, MutationDef> = {
  none: {
    id: 'none',
    label: 'Ordinary',
    badge: 'plain',
    caption: 'A normal, perfectly lovely egg.',
    incomeMultiplier: 1,
    material: {
      metalness: 0,
      roughness: 0.62,
      emissive: '#000000',
      emissiveIntensity: 0,
      subsurface: 0.12,
      iridescence: 0,
      iridescenceIOR: 1.3,
      clearcoat: 0.08,
      arcs: false,
      detailNormal: 'none',
      tint: '#ffffff',
    },
  },
  golden: {
    id: 'golden',
    label: 'Golden',
    badge: 'diamond',
    caption: 'Golden. Shiny metal shell. Worth two times as much.',
    incomeMultiplier: 2,
    material: {
      metalness: 1.0,
      roughness: 0.15,
      emissive: '#3a2200',
      emissiveIntensity: 0.12,
      subsurface: 0,
      iridescence: 0,
      iridescenceIOR: 1.3,
      clearcoat: 0.3,
      arcs: false,
      detailNormal: 'brushed',
      tint: '#ffcf5a',
    },
  },
  frosted: {
    id: 'frosted',
    label: 'Frosted',
    badge: 'snowflake',
    caption: 'Frosted. Icy and glowing from inside. Worth two and a half times.',
    incomeMultiplier: 2.5,
    material: {
      metalness: 0,
      roughness: 0.28,
      emissive: '#0d2a3a',
      emissiveIntensity: 0.2,
      subsurface: 0.85,
      iridescence: 0.15,
      iridescenceIOR: 1.31,
      clearcoat: 0.75,
      arcs: false,
      detailNormal: 'ice',
      tint: '#bfe6ff',
    },
  },
  storm: {
    id: 'storm',
    label: 'Storm',
    badge: 'bolt',
    caption: 'Storm. Little sparks crawl over the shell. Worth four times.',
    incomeMultiplier: 4,
    material: {
      metalness: 0.25,
      roughness: 0.42,
      emissive: '#3a2f7a',
      emissiveIntensity: 0.9,
      subsurface: 0.1,
      iridescence: 0.1,
      iridescenceIOR: 1.35,
      clearcoat: 0.4,
      arcs: true,
      detailNormal: 'none',
      tint: '#8a7fe0',
    },
  },
  prism: {
    id: 'prism',
    label: 'Prism',
    badge: 'prism',
    caption: 'Prism. Rainbow shine that shifts as you walk. Worth eight times.',
    incomeMultiplier: 8,
    material: {
      metalness: 0.1,
      roughness: 0.08,
      emissive: '#000000',
      emissiveIntensity: 0,
      subsurface: 0.2,
      iridescence: 1.0,
      iridescenceIOR: 2.2,
      clearcoat: 1.0,
      arcs: false,
      detailNormal: 'none',
      tint: '#ffffff',
    },
  },
};

export const RARITY_LABEL = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
  secret: 'Secret',
} as const;

/**
 * Rarity colours come in four palettes. Colour is decoration: rarity is also
 * always stated in words and shown with a pip count, so a colourblind player
 * loses nothing.
 */
export const RARITY_PIPS = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  mythic: 6,
  secret: 7,
} as const;

export const RARITY_COLOURS = {
  off: {
    common: '#c9cdc4',
    uncommon: '#8fbf72',
    rare: '#6aa8d8',
    epic: '#b08ad8',
    legendary: '#e0a860',
    mythic: '#e07a8a',
    secret: '#f0e0a0',
  },
  deuteranopia: {
    common: '#c9cdc4',
    uncommon: '#8ab4e8',
    rare: '#4a7ad0',
    epic: '#b09ae0',
    legendary: '#e8c060',
    mythic: '#f09040',
    secret: '#fff0b0',
  },
  protanopia: {
    common: '#c9cdc4',
    uncommon: '#90c0e0',
    rare: '#5088c8',
    epic: '#a898e0',
    legendary: '#e8cc70',
    mythic: '#f0a850',
    secret: '#fff4c0',
  },
  tritanopia: {
    common: '#c9cdc4',
    uncommon: '#8fd0a8',
    rare: '#40a878',
    epic: '#e08aa8',
    legendary: '#e86a6a',
    mythic: '#c04858',
    secret: '#ffd0d8',
  },
} as const;
