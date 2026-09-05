/**
 * Onboarding, without a wall of text.
 *
 * One short line at a time, each one attached to something the player can see
 * right now, and each one clears itself the moment they do the thing. No
 * "click Next to continue", no pop-up quiz, no gate.
 *
 * The steps deliberately teach in the order the loop happens, and the whole
 * sequence is five sentences long. A child who ignores it entirely can still
 * finish the game -- the on-screen prompts alone are enough.
 */

import { useEffect } from 'react';
import { useGame } from '../state/store';
import { Icon } from './Icon';

interface Step {
  readonly id: number;
  readonly icon: string;
  readonly text: string;
  /** True once the player has demonstrably done this. */
  readonly done: (state: ReturnType<typeof snapshot>) => boolean;
}

function snapshot(): {
  eggs: number;
  creatures: number;
  placed: number;
  upgrades: number;
  incubating: boolean;
} {
  const save = useGame.getState().save;
  return {
    eggs: save.stats.eggsRecovered,
    creatures: save.creatures.length,
    placed: save.creatures.filter((c) => c.slot !== null).length,
    upgrades: Object.values(save.upgrades).reduce((a, b) => a + b, 0),
    incubating: save.incubator !== null,
  };
}

const STEPS: readonly Step[] = [
  {
    id: 1,
    icon: 'egg',
    text: 'Find a nest and pick up an egg.',
    done: (s) => s.eggs > 0 || s.incubating,
  },
  {
    id: 2,
    icon: 'egg-warm',
    text: 'Carry it back to the incubator and put it in.',
    done: (s) => s.incubating || s.creatures > 0,
  },
  {
    id: 3,
    icon: 'fence',
    text: 'When it hatches, pop the little one in a pen.',
    done: (s) => s.placed > 0,
  },
  {
    id: 4,
    icon: 'coin',
    text: 'Visitors leave donations. Spend them at the store.',
    done: (s) => s.upgrades > 0,
  },
  {
    id: 5,
    icon: 'boot-run',
    text: 'Faster running opens up wilder places. Off you go!',
    done: (s) => s.upgrades > 2,
  },
];

export function Tutorial(): React.ReactElement | null {
  const step = useGame((s) => s.save.tutorialStep);
  const advance = useGame((s) => s.advanceTutorial);
  const phase = useGame((s) => s.phase);
  const prompt = useGame((s) => s.prompt);

  const current = STEPS.find((s) => s.id === step + 1) ?? null;

  useEffect(() => {
    if (current === null) return;
    const id = window.setInterval(() => {
      if (current.done(snapshot())) advance(current.id);
    }, 600);
    return () => window.clearInterval(id);
  }, [current, advance]);

  if (phase !== 'playing' || current === null) return null;
  // Never cover the interaction prompt: if there is something to press right
  // now, that is more useful than a hint about it.
  if (prompt !== null && current.id <= 2) return null;

  return (
    <div className="tutorial" role="note">
      <Icon name={current.icon} size={28} />
      <span>{current.text}</span>
    </div>
  );
}
