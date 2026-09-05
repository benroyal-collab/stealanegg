/**
 * Number formatting for an eight year old.
 *
 * Big numbers are exciting; unreadable numbers are not. Anything under a
 * thousand is shown exactly, and above that it gets a suffix with one decimal
 * so "1.4k" is obviously more than "990" at a glance.
 */

const SUFFIXES = ['', 'k', 'M', 'B', 'T'] as const;

export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safe < 1000) return Math.floor(safe).toLocaleString('en-GB');

  let scaled = safe;
  let tier = 0;
  while (scaled >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier += 1;
  }
  // One decimal below 100, none above: "12.4k" but "340k".
  const decimals = scaled < 100 ? 1 : 0;
  return `${scaled.toFixed(decimals)}${SUFFIXES[tier]}`;
}

/** "1 min 20 sec" rather than "80s". Words beat units at this reading age. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe < 60) return `${safe} sec`;
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  if (rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest} sec`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}
