/**
 * The stamina ring, drawn around the reticle position.
 *
 * Reads sixty times a second from the player runtime, so it lives outside the
 * store and writes straight to the SVG via a ref -- pushing stamina through
 * zustand would re-render the whole HUD every frame.
 *
 * It only appears once the player has started running. A permanent meter on
 * screen is one more thing for a child to worry about; a meter that shows up
 * when it becomes relevant teaches itself.
 */

import { useEffect, useRef } from 'react';
import { STAMINA } from '../../data/balance';
import { playerRef } from '../../render/player/playerRuntime';

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function StaminaRing(): React.ReactElement {
  const arc = useRef<SVGCircleElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      frame = requestAnimationFrame(tick);
      const fraction = Math.max(0, Math.min(1, playerRef.stamina / STAMINA.maxSeconds));
      const exhausted = playerRef.state?.exhausted === true;

      if (arc.current !== null) {
        arc.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - fraction));
        // Exhaustion is shown by a dashed stroke as well as a colour change,
        // because colour alone is never allowed to carry meaning here.
        arc.current.style.strokeDasharray = exhausted
          ? `${CIRCUMFERENCE / 24} ${CIRCUMFERENCE / 24}`
          : String(CIRCUMFERENCE);
        arc.current.setAttribute('stroke', exhausted ? '#e08a5a' : '#8fd0a8');
      }
      if (wrapper.current !== null) {
        const show = fraction < 0.995 || playerRef.gait === 'sprint';
        wrapper.current.style.opacity = show ? '1' : '0';
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="stamina" ref={wrapper} aria-hidden="true">
      <svg width={64} height={64} viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={RADIUS} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="5" />
        <circle
          ref={arc}
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke="#8fd0a8"
          strokeWidth="5"
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
          style={{ strokeDasharray: CIRCUMFERENCE, strokeDashoffset: 0 }}
        />
      </svg>
    </div>
  );
}
