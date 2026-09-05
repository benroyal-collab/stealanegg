/**
 * Photo Mode's live settings.
 *
 * Module-level and mutable, read by the post chain on a frame. The UI writes
 * it and the renderer reads it, with no React in between -- a filter change
 * should not remount the effect composer.
 */

export interface PhotoSettings {
  active: boolean;
  /** One of the named looks in the Photo Mode UI. */
  filter: string;
  /** 0..1, drives depth-of-field strength. */
  blur: number;
}

export const photoSettings: PhotoSettings = {
  active: false,
  filter: 'none',
  blur: 0.5,
};

/** Hue/saturation/brightness triple for each named look. */
export function filterGrade(filter: string): {
  hue: number;
  saturation: number;
  brightness: number;
} {
  switch (filter) {
    case 'warm':
      return { hue: 0.04, saturation: 0.18, brightness: 0.04 };
    case 'cool':
      return { hue: -0.06, saturation: 0.1, brightness: 0.02 };
    case 'storybook':
      return { hue: 0.02, saturation: 0.34, brightness: 0.06 };
    case 'mono':
      return { hue: 0, saturation: -1, brightness: 0.03 };
    case 'none':
    default:
      return { hue: 0, saturation: 0, brightness: 0 };
  }
}
