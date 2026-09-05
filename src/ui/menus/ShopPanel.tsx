/**
 * The Ranger Store.
 *
 * There is no real money here and there never will be. Everything is bought
 * with visitor donations that the player's own habitats earned, and every
 * price is shown in full before you commit. No randomised purchases, no
 * bundles, no timed offers.
 */

import { UPGRADE_DEFS, PACE, INCUBATION, ECONOMY } from '../../data/balance';
import { habitatSlots, incubationSeconds, isUpgradeMaxed, upgradeCost } from '../../sim/economy';
import { useGame } from '../../state/store';
import { formatDuration, formatMoney } from '../format';
import { Icon } from '../Icon';
import type { UpgradeId } from '../../sim/types';
import { Panel } from './Panel';

/** What each upgrade actually does, in words an eight year old can read. */
function describe(id: UpgradeId, level: number, upgrades: Record<UpgradeId, number>): string {
  switch (id) {
    case 'trainingTrack':
      return `Run faster. Adds ${PACE.trackPerLevel} m/s to your speed.`;
    case 'boots':
      return 'Springier boots. A small extra push on top of your training.';
    case 'incubator':
      return `Eggs hatch sooner. Now ${formatDuration(incubationSeconds(level))}, next ${formatDuration(
        incubationSeconds(level + 1),
      )}.`;
    case 'habitatSlots':
      return `Room for one more friend. You have ${habitatSlots(upgrades)} of ${
        ECONOMY.habitatSlotsCap
      } pens.`;
    case 'fieldGuide':
      return 'Bigger bonus each time you find a species nobody has seen before.';
    default:
      return '';
  }
}

const ORDER: UpgradeId[] = ['trainingTrack', 'habitatSlots', 'incubator', 'boots', 'fieldGuide'];

export function ShopPanel(): React.ReactElement {
  const save = useGame((s) => s.save);
  const buy = useGame((s) => s.buyUpgrade);
  const close = useGame((s) => s.setMenu);

  return (
    <Panel
      icon="shop"
      title="Ranger Store"
      intro="Visitors leave donations in your sanctuary. Spend them here."
      onClose={() => close('none')}
    >
      <div className="hud__stat" style={{ marginBottom: 16 }}>
        <Icon name="coin" size={22} label="You have" />
        <span className="hud__value">{formatMoney(save.money)}</span>
        <span className="hud__rate">to spend</span>
      </div>

      <div className="shop__grid">
        {ORDER.map((id) => {
          const level = save.upgrades[id];
          const maxed = isUpgradeMaxed(id, level);
          const cost = upgradeCost(id, level);
          const affordable = save.money >= cost;
          const def = UPGRADE_DEFS[id];

          return (
            <button
              key={id}
              type="button"
              className="upgrade"
              disabled={maxed || !affordable}
              onClick={() => buy(id)}
            >
              <Icon name={def.icon} size={30} />
              <span className="upgrade__body">
                <span className="upgrade__name">
                  {def.label} {level > 0 ? `· level ${level}` : ''}
                </span>
                <span className="upgrade__desc">{describe(id, level, save.upgrades)}</span>
                <span className="upgrade__cost">
                  {maxed ? (
                    <>
                      <Icon name="tick" size={18} /> All done!
                    </>
                  ) : (
                    <>
                      <Icon name="coin" size={18} /> {formatMoney(cost)}
                      {affordable ? '' : ' — keep collecting'}
                    </>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="field__hint" style={{ marginTop: 18 }}>
        Everything in this game is free. There is nothing to buy with real money, and there never
        will be. Incubation never drops below {INCUBATION.floorSeconds} seconds, because the wait is
        half the fun.
      </p>
    </Panel>
  );
}
