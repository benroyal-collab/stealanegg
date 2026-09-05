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
      <div className="title__crest" aria-hidden="true" />
      <h1>Egg Heist: Wildlands</h1>
      <p className="title__tag">Recover the eggs. Raise the hatchlings. Open up the wild.</p>

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
