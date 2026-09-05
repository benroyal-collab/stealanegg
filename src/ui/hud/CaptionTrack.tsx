/**
 * Captions.
 *
 * Every audio cue in the game also arrives here as text with an icon, which
 * is the accessibility requirement stated as plainly as it can be: nothing is
 * communicated by sound alone. The cue registry test walks every cue and
 * fails the build if one has no caption.
 *
 * On by default, not opt-in.
 */

import { useGame } from '../../state/store';
import { Icon } from '../Icon';

export function CaptionTrack(): React.ReactElement | null {
  const captions = useGame((s) => s.captions);
  const enabled = useGame((s) => s.save.settings.captions);

  if (!enabled || captions.length === 0) return null;

  return (
    <div className="captions" role="status" aria-live="polite">
      {captions.map((caption) => (
        <div key={caption.id} className="captions__line">
          <Icon name={caption.icon} size={20} />
          <span>{caption.text}</span>
        </div>
      ))}
    </div>
  );
}
