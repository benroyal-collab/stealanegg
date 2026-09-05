/**
 * About.
 *
 * The single external-facing page in the game, and it contains no links --
 * the child-safety rules allow exactly one, to the Parent Info page, and that
 * page is inside the game rather than on the web.
 */

import { useGame } from '../../state/store';
import { Icon } from '../Icon';
import { Panel } from './Panel';

export function AboutPanel(): React.ReactElement {
  const close = useGame((s) => s.setMenu);

  return (
    <Panel
      icon="book"
      title="About Egg Heist: Wildlands"
      intro="A gentle game about finding eggs and raising the little ones that come out of them."
      onClose={() => close('none')}
    >
      <section>
        <h3>
          <Icon name="calm" size={22} /> Nothing gets hurt
        </h3>
        <p>
          The guardians in this game are looking after their nests, and they will shoo you off if
          they spot you. That is all they do. Nobody is chased, nobody is hurt, and every egg you
          bring home hatches safely and goes to live in your sanctuary.
        </p>
        <p>
          If a guardian catches you, you tumble over, drop the egg and get straight back up. You
          never lose a hatchling, a coin or an upgrade. The only thing it costs is a few seconds.
        </p>
      </section>

      <section>
        <h3>
          <Icon name="rival" size={22} /> The other clubs
        </h3>
        <p>
          Rival collector clubs are after the same eggs. They will show you which nest they are
          heading for before they set off, so you always get to decide whether to race them. They
          cannot touch you and they never will.
        </p>
      </section>

      <section>
        <h3>
          <Icon name="parents" size={22} /> Made with everything included
        </h3>
        <p>
          Every tree, egg, creature, sound and piece of music in this game was made by the code that
          runs it. Nothing is downloaded from anywhere else while you play.
        </p>
      </section>
    </Panel>
  );
}
