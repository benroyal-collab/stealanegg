/**
 * On-screen controls for touch.
 *
 * A first-class input, not a fallback: the left half of the screen is a
 * virtual stick that appears wherever the thumb lands, the right half is a
 * drag-to-look area, and the buttons sit inside the safe area at a minimum of
 * 64px. Sprint is "hold anywhere on the right", per the brief.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { pressVirtual, setVirtualStick } from '../systems/deviceHint';

const STICK_RADIUS = 62;

export function TouchControls(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);
  const stick = useRef<HTMLDivElement>(null);
  const nub = useRef<HTMLDivElement>(null);
  const movePointer = useRef<number | null>(null);
  const lookPointer = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });

  // Only appear once the player actually touches the screen. A tablet with a
  // keyboard attached should not get thumbsticks it never asked for.
  useEffect(() => {
    const onTouch = (): void => setVisible(true);
    window.addEventListener('touchstart', onTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const onDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') return;
      const leftHalf = event.clientX < window.innerWidth * 0.5;

      if (leftHalf && movePointer.current === null) {
        movePointer.current = event.pointerId;
        origin.current = { x: event.clientX, y: event.clientY };
        if (stick.current !== null) {
          stick.current.style.left = `${event.clientX - STICK_RADIUS}px`;
          stick.current.style.top = `${event.clientY - STICK_RADIUS}px`;
          stick.current.style.bottom = 'auto';
          stick.current.style.opacity = '1';
        }
      } else if (!leftHalf && lookPointer.current === null) {
        lookPointer.current = event.pointerId;
        lookLast.current = { x: event.clientX, y: event.clientY };
      }
    };

    const onMove = (event: PointerEvent): void => {
      if (event.pointerId === movePointer.current) {
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        const distance = Math.min(STICK_RADIUS, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        const nx = (Math.cos(angle) * distance) / STICK_RADIUS;
        const ny = (Math.sin(angle) * distance) / STICK_RADIUS;

        setVirtualStick({ moveX: nx, moveY: ny, sprint: distance > STICK_RADIUS * 0.85 });
        if (nub.current !== null) {
          nub.current.style.transform = `translate(${nx * STICK_RADIUS}px, ${ny * STICK_RADIUS}px)`;
        }
      } else if (event.pointerId === lookPointer.current) {
        setVirtualStick({
          lookX: event.clientX - lookLast.current.x,
          lookY: event.clientY - lookLast.current.y,
        });
        lookLast.current = { x: event.clientX, y: event.clientY };
      }
    };

    const onUp = (event: PointerEvent): void => {
      if (event.pointerId === movePointer.current) {
        movePointer.current = null;
        setVirtualStick({ moveX: 0, moveY: 0, sprint: false });
        if (nub.current !== null) nub.current.style.transform = 'translate(0,0)';
        if (stick.current !== null) stick.current.style.opacity = '0.45';
      }
      if (event.pointerId === lookPointer.current) {
        lookPointer.current = null;
        setVirtualStick({ lookX: 0, lookY: 0 });
      }
    };

    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="touch">
      <div className="touch__stick" ref={stick} style={{ opacity: 0.45 }}>
        <div className="touch__nub" ref={nub} style={{ left: '50%', top: '50%' }} />
      </div>

      <div className="touch__buttons">
        <button
          type="button"
          className="touch__button"
          aria-label="Crouch"
          onPointerDown={() => pressVirtual('crouch')}
        >
          <Icon name="crouch" size={28} />
        </button>
        <button
          type="button"
          className="touch__button"
          aria-label="Throw a tool"
          onPointerDown={() => pressVirtual('tool')}
        >
          <Icon name="seeds" size={28} />
        </button>
        <button
          type="button"
          className="touch__button"
          aria-label="Jump"
          onPointerDown={() => pressVirtual('jump')}
        >
          <Icon name="sprint" size={28} />
        </button>
      </div>
    </div>
  );
}
