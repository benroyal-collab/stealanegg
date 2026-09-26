/**
 * The icon set.
 *
 * Every word in this game is paired with a picture, because the reading age
 * is eight. These are inline SVG paths -- no icon font, no sprite sheet, no
 * network request, and they scale cleanly with the UI scale setting.
 *
 * `currentColor` throughout, so an icon inherits whatever the surrounding
 * text is using and stays legible in every colourblind palette.
 */

import { ICON_PATHS, type IconName } from './iconPaths';

export type { IconName };

export interface IconProps {
  name: IconName | string;
  size?: number;
  /** Decorative icons are hidden from screen readers; labelled ones are not. */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 24, label, className }: IconProps): React.ReactElement {
  const path = ICON_PATHS[name as IconName] ?? ICON_PATHS.star;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label === undefined ? 'presentation' : 'img'}
      aria-hidden={label === undefined}
      {...(label === undefined ? {} : { 'aria-label': label })}
    >
      <path d={path} />
    </svg>
  );
}
