/**
 * The title screen.
 *
 * Three things and nothing else: Play, Settings, For grown-ups. A child
 * should reach the game in one press.
 */

import { useGame } from '../state/store';
import { Icon } from './Icon';

export function TitleScreen(): React.ReactElement {
  const setPhase = useGame((s) => s.setPhase);
  const setMenu = useGame((s) => s.setMenu);
  const save = useGame((s) => s.save);
  const returning = save.stats.eggsRecovered > 0;

  return (
    <div className="title">
      <NightScene />
      <div className="title__crest" aria-hidden="true" />
      <h1>Egg Heist: Wildlands</h1>
      <p className="title__tag">
        Slip into the dark. Take back the eggs. Don&rsquo;t let them see you.
      </p>

      <div className="button-row title__buttons">
        <button
          type="button"
          className="button button--primary"
          onClick={() => setPhase('playing')}
          autoFocus
        >
          <Icon name="play" size={24} />
          {returning ? 'Carry on' : 'Play'}
        </button>
        <button type="button" className="button" onClick={() => setMenu('settings')}>
          <Icon name="settings" size={22} /> Settings
        </button>
        <button type="button" className="button" onClick={() => setMenu('parents')}>
          <Icon name="parents" size={22} /> For grown-ups
        </button>
      </div>

      <p className="title__promise">
        No adverts. Nothing to buy. No sign-in. Nothing you do here leaves this device.
      </p>
    </div>
  );
}

/**
 * The wood at night, behind the title: a moon, drifting mist, a treeline, and
 * a few pairs of eyes in it that blink every few seconds.
 *
 * Decorative and hidden from screen readers. The blink is a slow close and
 * open of a few small dots, seconds apart -- nowhere near the 3Hz ceiling --
 * and like every animation here it stops under reduced motion.
 */
function NightScene(): React.ReactElement {
  return (
    <div className="title__night" aria-hidden="true">
      <div className="title__moon" />
      <div className="title__mist" />
      <svg className="title__trees" viewBox="0 0 1200 260" preserveAspectRatio="none">
        <path d={TREELINE} />
      </svg>
      {EYES.map(([left, bottom, delay], i) => (
        <span
          key={i}
          className="title__eyes"
          style={{ left: `${left}%`, bottom: `${bottom}%`, animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}

/** Where the eyes sit in the treeline: left %, bottom %, blink offset in seconds. */
const EYES: readonly (readonly [number, number, number])[] = [
  [14, 12, 0.4],
  [71, 16, 2.6],
  [88, 9, 4.9],
];

/** A ragged line of pines, drawn once rather than shipped as an image. */
const TREELINE = (() => {
  let d = 'M0 260 L0 170';
  let x = 0;
  let seed = 7;
  while (x < 1200) {
    seed = (seed * 9301 + 49297) % 233280;
    const r = seed / 233280;
    const w = 26 + r * 40;
    const h = 90 + r * 130;
    d += ` L${(x + w * 0.5).toFixed(0)} ${(260 - h).toFixed(0)} L${(x + w).toFixed(0)} ${(200 - r * 30).toFixed(0)}`;
    x += w;
  }
  return `${d} L1200 260 Z`;
})();
