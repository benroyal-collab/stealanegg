/**
 * Photo Mode.
 *
 * A free camera, a few filters, and a button that saves a PNG. Children love
 * it and it is the cheapest possible way to show off the renderer.
 *
 * Depth of field lives here and in menus only -- never during play, where it
 * would cost the legibility a stealth game depends on.
 */

import { useEffect, useState } from 'react';
import { useGame } from '../state/store';
import { Icon } from './Icon';
import { Choice, Field, Slider } from './menus/controls';
import { photoSettings } from '../render/photoSettings';

const FILTERS = [
  { value: 'none', label: 'Natural' },
  { value: 'warm', label: 'Golden' },
  { value: 'cool', label: 'Frosty' },
  { value: 'storybook', label: 'Storybook' },
  { value: 'mono', label: 'Black and white' },
] as const;

export function PhotoMode(): React.ReactElement | null {
  const phase = useGame((s) => s.phase);
  const setPhase = useGame((s) => s.setPhase);
  const [filter, setFilter] = useState<string>('none');
  const [blur, setBlur] = useState(0.5);
  const [hideUi, setHideUi] = useState(true);

  useEffect(() => {
    photoSettings.filter = filter;
    photoSettings.blur = blur;
    photoSettings.active = phase === 'photo';
  }, [filter, blur, phase]);

  useEffect(() => {
    if (phase !== 'photo') return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPhase('playing');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, setPhase]);

  if (phase !== 'photo') return null;

  const capture = (): void => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) return;
    // The renderer keeps its drawing buffer, so this reads the frame that is
    // actually on screen rather than a blank one.
    canvas.toBlob((blob) => {
      if (blob === null) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wildlands-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className={`photo${hideUi ? ' photo--minimal' : ''}`}>
      <div className="photo__bar">
        <Icon name="camera" size={26} />
        <strong>Photo mode</strong>

        <Field label="Look" icon="star">
          <Choice options={FILTERS} value={filter} onChange={setFilter} />
        </Field>

        <Field label="Blurry background" icon="camera">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={blur}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={setBlur}
          />
        </Field>

        <div className="button-row">
          <button type="button" className="button button--primary" onClick={capture}>
            <Icon name="camera" size={22} /> Take the photo
          </button>
          <button type="button" className="button" onClick={() => setHideUi((v) => !v)}>
            <Icon name="tick" size={20} /> {hideUi ? 'Show' : 'Hide'} the panel
          </button>
          <button type="button" className="button" onClick={() => setPhase('playing')}>
            <Icon name="close" size={20} /> Back to playing
          </button>
        </div>
      </div>
    </div>
  );
}
