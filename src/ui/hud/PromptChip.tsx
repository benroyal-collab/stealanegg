/**
 * "Press E to pick up the egg."
 *
 * The button glyph changes with whatever device the player last touched, so a
 * child on a gamepad never sees a keyboard key they cannot find. On touch,
 * the chip *is* the button.
 */

import { useGame } from '../../state/store';
import { Icon } from '../Icon';
import { lastInputDevice, pressVirtual } from '../../systems/deviceHint';
import { keyLabel } from '../../systems/input';

export interface PromptChipProps {
  prompt: { kind: string; label: string; icon: string };
}

export function PromptChip({ prompt }: PromptChipProps): React.ReactElement {
  const bindings = useGame((s) => s.save.settings.bindings);
  const device = lastInputDevice();

  const glyph =
    device === 'gamepad' ? 'A' : device === 'touch' ? '' : keyLabel(bindings.interact ?? 'KeyE');

  if (device === 'touch') {
    return (
      <button
        type="button"
        className="prompt prompt--touch"
        onPointerDown={() => pressVirtual('interact')}
      >
        <Icon name={prompt.icon} size={30} />
        <span>{prompt.label}</span>
      </button>
    );
  }

  return (
    <div className="prompt">
      <span className="prompt__key">{glyph}</span>
      <Icon name={prompt.icon} size={26} />
      <span>{prompt.label}</span>
    </div>
  );
}
