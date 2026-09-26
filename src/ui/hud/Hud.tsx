/**
 * The HUD.
 *
 * Rules this obeys, all of them from the child-safety and accessibility
 * sections rather than from taste:
 *
 * - Every word is paired with an icon.
 * - Nothing is signalled by colour alone: rarity carries a word and a pip
 *   count, guardian state carries a shape.
 * - Minimum 16px body text, scaled by the UI scale setting.
 * - No countdowns that create urgency, no streaks, no "watch to continue".
 * - Captions for every audio cue, on by default.
 */

import { useGame } from '../../state/store';
import { Icon } from '../Icon';
import { formatMoney } from '../format';
import { PromptChip } from './PromptChip';
import { DangerArrow } from './DangerArrow';
import { StaminaRing } from './StaminaRing';
import { IncubatorPill } from './IncubatorPill';
import { CaptionTrack } from './CaptionTrack';
import { ToastStack } from './ToastStack';
import { donationsPerSecond, habitatSlots, nextLockedBiome } from '../../sim/economy';
import { BIOME_DEFS } from '../../data/biomes';

export function Hud(): React.ReactElement | null {
  const phase = useGame((s) => s.phase);
  const save = useGame((s) => s.save);
  const prompt = useGame((s) => s.prompt);

  if (phase !== 'playing') return null;

  const dps = donationsPerSecond(save.creatures);
  const slots = habitatSlots(save.upgrades);
  const used = save.creatures.filter((c) => c.slot !== null).length;
  const next = nextLockedBiome(save.pace);

  return (
    <div className="hud">
      <div className="hud__corner hud__corner--tl">
        <div className="hud__stat">
          <Icon name="coin" size={22} label="Donations" />
          <span className="hud__value">{formatMoney(save.money)}</span>
          <span className="hud__rate">+{formatMoney(dps)} a second</span>
        </div>

        <div className="hud__stat">
          <Icon name="boot-run" size={22} label="Your speed" />
          <span className="hud__value">{save.pace.toFixed(1)} m/s</span>
        </div>

        <div className="hud__stat">
          <Icon name="fence" size={22} label="Habitats used" />
          <span className="hud__value">
            {used} of {slots}
          </span>
        </div>
      </div>

      <div className="hud__corner hud__corner--tr">
        <IncubatorPill />
        {next !== null ? (
          <div className="hud__goal">
            <Icon name="map" size={20} label="Next place to unlock" />
            <span>
              {BIOME_DEFS[next].name} opens at {BIOME_DEFS[next].paceGate.toFixed(1)} m/s
            </span>
          </div>
        ) : null}
      </div>

      <StaminaRing />
      <DangerArrow />
      {prompt !== null ? <PromptChip prompt={prompt} /> : null}
      <CaptionTrack />
      <ToastStack />
    </div>
  );
}
