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

export type IconName =
  | 'egg'
  | 'egg-warm'
  | 'coin'
  | 'boot'
  | 'boot-run'
  | 'fence'
  | 'book'
  | 'fuse'
  | 'seeds'
  | 'berry'
  | 'whistle'
  | 'shoo'
  | 'ear'
  | 'calm'
  | 'rival'
  | 'map'
  | 'camera'
  | 'settings'
  | 'parents'
  | 'pause'
  | 'play'
  | 'close'
  | 'tick'
  | 'lock'
  | 'sprint'
  | 'crouch'
  | 'grab'
  | 'star'
  | 'clock'
  | 'incubator'
  | 'shop'
  | 'guide'
  | 'breeding'
  | 'track';

const PATHS: Record<IconName, string> = {
  egg: 'M12 3c3.3 0 6 4.6 6 8.6 0 3.6-2.7 6.4-6 6.4s-6-2.8-6-6.4C6 7.6 8.7 3 12 3z',
  'egg-warm':
    'M12 4c2.9 0 5.2 4 5.2 7.5 0 3.1-2.3 5.5-5.2 5.5s-5.2-2.4-5.2-5.5C6.8 8 9.1 4 12 4zM5 20h14',
  coin: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4v8m-2.5-6h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4',
  boot: 'M7 3v9l-2 3v6h14v-4c0-2-2-2.5-4-4l-3-2V3z',
  'boot-run': 'M3 18h5l2-4 3 2 2-5 3 3M4 7h6M4 11h4',
  fence: 'M4 20V8l2-3 2 3v12M12 20V8l2-3 2 3v12M2 12h20M2 16h20',
  book: 'M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 3v18',
  fuse: 'M7 8a3 3 0 1 0 0-.1zM17 8a3 3 0 1 0 0-.1zM12 19a3.5 3.5 0 1 0 0-.1zM9 10l2 6M15 10l-2 6',
  seeds:
    'M8 7a2 2 0 1 0 0-.1zM15 10a2 2 0 1 0 0-.1zM10 15a2 2 0 1 0 0-.1zM17 17a1.5 1.5 0 1 0 0-.1z',
  berry: 'M12 6a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 6V3M12 3l3-1',
  whistle: 'M4 10h10a4 4 0 1 1 0 8H8l-4-3zM14 6l4-2',
  shoo: 'M5 16c3-6 11-6 14 0M8 8l1 3M12 6l0 3M16 8l-1 3',
  ear: 'M9 20c-2 0-3-2-3-5 0-6 1-11 6-11s6 4 6 7-3 4-4 6-1 3-3 3z',
  calm: 'M4 14c3-3 5-3 8 0s5 3 8 0M4 9c3-3 5-3 8 0s5 3 8 0',
  rival: 'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 20c0-3.3 2.7-6 6-6s6 2.7 6 6',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  camera: 'M4 8h3l2-2h6l2 2h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  parents:
    'M9 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM17 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 20c0-3 2.7-5 6-5s6 2 6 5M15 20c0-2 1.3-3.5 3-3.5s3 1.5 3 3.5',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4l13 8-13 8z',
  close: 'M6 6l12 12M18 6L6 18',
  tick: 'M4 13l5 5L20 6',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  sprint: 'M13 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 21l3-6 3 2 2-5 4 4M3 11h5',
  crouch: 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 21l2-7h5l2 7M7 12h10',
  grab: 'M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V7a1.5 1.5 0 0 1 3 0v9a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5v-4a1.5 1.5 0 0 1 3 0',
  star: 'M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6L12 16.8 6.6 19.6l1.2-6L3.3 9.4l6.1-.8z',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  incubator:
    'M12 5c2.6 0 4.6 3.4 4.6 6.4 0 2.7-2 4.6-4.6 4.6s-4.6-1.9-4.6-4.6C7.4 8.4 9.4 5 12 5zM5 19h14',
  shop: 'M4 9h16l-1 11H5zM8 9V6a4 4 0 0 1 8 0v3',
  guide: 'M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM9 8h6M9 12h6',
  breeding:
    'M8 7a3 3 0 1 0 0-.1zM16 7a3 3 0 1 0 0-.1zM12 18a3.5 3.5 0 1 0 0-.1zM9.5 9.5l1.5 5M14.5 9.5l-1.5 5',
  track: 'M4 18h16M6 18V9M18 18V9M6 12h12M4 6h16',
};

export interface IconProps {
  name: IconName | string;
  size?: number;
  /** Decorative icons are hidden from screen readers; labelled ones are not. */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 24, label, className }: IconProps): React.ReactElement {
  const path = PATHS[name as IconName] ?? PATHS.star;
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
