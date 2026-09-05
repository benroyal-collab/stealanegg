/**
 * Loading tips.
 *
 * Every tip teaches something the game does not otherwise say out loud, and
 * none of them is a nag or a monetisation prompt. They rotate slowly enough
 * to be read.
 */

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

const TIPS: readonly { icon: string; text: string }[] = [
  { icon: 'crouch', text: 'Crouching in long grass makes you very hard to spot.' },
  { icon: 'ear', text: 'Guardians hear you sprint from a long way off. Walking is quieter.' },
  { icon: 'seeds', text: 'Throw seeds to give a guardian something else to look at.' },
  { icon: 'berry', text: 'A sleepy berry makes a guardian yawn and slow right down.' },
  { icon: 'egg', text: 'Rarer eggs are heavier. They are worth more, but you run slower.' },
  { icon: 'shoo', text: 'Being shooed away only costs three seconds. You never lose anything.' },
  { icon: 'rival', text: 'Rival clubs show you which nest they want before they set off.' },
  { icon: 'boot-run', text: 'Running faster is what opens up new parts of the reserve.' },
  {
    icon: 'fence',
    text: 'Empty pens earn nothing. Pop your hatchlings in as soon as they arrive.',
  },
  { icon: 'fuse', text: 'Three of the same kind can become one rarer one at the Breeding Hut.' },
  { icon: 'camera', text: 'Press P for photo mode. You can save a picture of anything you like.' },
  { icon: 'sprint', text: 'Run at a low wall and jump: you will vault straight over it.' },
  { icon: 'calm', text: 'Guardians always give up eventually. Just break their line of sight.' },
];

export function LoadingTips(): React.ReactElement {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    // Six seconds: long enough to read twice at a child's reading rate.
    const id = window.setInterval(() => setIndex((n) => (n + 1) % TIPS.length), 6000);
    return () => window.clearInterval(id);
  }, []);

  const tip = TIPS[index] ?? TIPS[0]!;

  return (
    <p className="boot__tip">
      <Icon name={tip.icon} size={22} />
      <span>{tip.text}</span>
    </p>
  );
}
