/**
 * Pause.
 *
 * Depth of field comes on here, which is the only place other than Photo Mode
 * that it is allowed. Everything the player might want is one press away, and
 * "For grown-ups" is always reachable without leaving the game.
 */

import { useGame } from '../../state/store';
import { Icon } from '../Icon';
import { Panel } from './Panel';
import { formatDuration } from '../format';

export function PauseMenu(): React.ReactElement {
  const setPhase = useGame((s) => s.setPhase);
  const setMenu = useGame((s) => s.setMenu);
  const save = useGame((s) => s.save);

  return (
    <Panel icon="pause" title="Paused" onClose={() => setPhase('playing')}>
      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          onClick={() => setPhase('playing')}
        >
          <Icon name="play" size={22} /> Back to the sanctuary
        </button>
        <button type="button" className="button" onClick={() => setMenu('guide')}>
          <Icon name="guide" size={22} /> Field Guide
        </button>
        <button type="button" className="button" onClick={() => setPhase('photo')}>
          <Icon name="camera" size={22} /> Photo mode
        </button>
        <button type="button" className="button" onClick={() => setMenu('settings')}>
          <Icon name="settings" size={22} /> Settings
        </button>
        <button type="button" className="button" onClick={() => setMenu('parents')}>
          <Icon name="parents" size={22} /> For grown-ups
        </button>
        <button type="button" className="button" onClick={() => setMenu('about')}>
          <Icon name="book" size={22} /> About this game
        </button>
      </div>

      <section style={{ marginTop: 24 }}>
        <h3>
          <Icon name="star" size={22} /> Your sanctuary so far
        </h3>
        <ul>
          <li>Eggs brought home: {save.stats.eggsRecovered}</li>
          <li>Hatchlings raised: {save.creatures.length}</li>
          <li>Species discovered: {save.discovered.length}</li>
          <li>Times shooed away: {save.stats.timesCaught} (nothing was ever lost)</li>
          <li>Time played: {formatDuration(save.playSeconds)}</li>
        </ul>
      </section>
    </Panel>
  );
}
