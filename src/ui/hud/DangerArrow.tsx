/**
 * Points at whatever is chasing you.
 *
 * The camera pulls back under pursuit, which brings a guardian into shot when
 * it is roughly behind you -- but not when it is off to one side, and not at
 * all when it comes from in front. A threat a child cannot locate is not
 * tension, it is an unfair surprise: they have no camera discipline to fall
 * back on, and the first they know about it is being knocked over.
 *
 * So a chevron rides the edge of the screen on the bearing of the nearest
 * pursuer, and hides itself once that pursuer is comfortably in view. It
 * reads sixty times a second straight from the player runtime and writes to
 * the DOM through a ref, the same way the stamina ring does -- pushing this
 * through the store would re-render the HUD every frame.
 *
 * Shape carries the meaning, not colour: it is an arrow, it points, and it
 * grows as the danger closes. The caption track says "A guardian is chasing
 * you!" alongside it.
 */

import { useEffect, useRef } from 'react';
import { playerRef } from '../../render/player/playerRuntime';
import { useGame } from '../../state/store';

/** Below this pressure there is nothing worth pointing at. */
const SHOW_ABOVE = 0.02;

/**
 * Hide the arrow once the pursuer is this close to straight ahead.
 *
 * Roughly the horizontal field of view. Pointing at something already filling
 * the middle of the screen is clutter, and clutter is what a child stops
 * reading first.
 */
const ON_SCREEN_RADIANS = 0.62;

export function DangerArrow(): React.ReactElement {
  const wrapper = useRef<HTMLDivElement>(null);
  const reducedMotion = useGame((s) => s.save.settings.reducedMotion);

  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      frame = requestAnimationFrame(tick);
      const node = wrapper.current;
      if (node === null) return;

      const pressure = playerRef.pursuitPressure;
      // Bearing relative to where the camera is looking, wrapped to +/-pi.
      let relative = playerRef.pursuitBearing - playerRef.cameraYaw;
      relative = Math.atan2(Math.sin(relative), Math.cos(relative));

      const visible = pressure > SHOW_ABOVE && Math.abs(relative) > ON_SCREEN_RADIANS;
      node.style.opacity = visible ? String(Math.min(1, 0.35 + pressure)) : '0';
      if (!visible) return;

      /*
       * Ride an ellipse inset from the edges. Wider than tall because the
       * viewport is, and inset far enough that the chevron never fights the
       * corner readouts or the caption track along the bottom.
       */
      const x = 50 + Math.sin(relative) * 38;
      const y = 50 - Math.cos(relative) * 32;
      // Bigger as it closes: the size is the second, redundant signal.
      const scale = reducedMotion ? 1 : 0.85 + pressure * 0.5;
      node.style.left = `${x}%`;
      node.style.top = `${y}%`;
      node.style.transform = `translate(-50%, -50%) rotate(${relative}rad) scale(${scale.toFixed(3)})`;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  return (
    <div ref={wrapper} className="danger-arrow" style={{ opacity: 0 }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width="40" height="40">
        {/* Outlined as well as filled, so it holds up against any background. */}
        <path
          d="M20 3 L33 30 L20 23 L7 30 Z"
          fill="#ead9b8"
          stroke="#1c1a17"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
