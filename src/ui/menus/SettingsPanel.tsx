/**
 * Settings.
 *
 * Accessibility is not a submenu here -- it is the first three sections,
 * because the things in it are the difference between a child being able to
 * play at all and not.
 */

import { DEFAULT_BINDINGS } from '../../sim/save';
import { keyLabel } from '../../systems/input';
import { useGame } from '../../state/store';
import { Icon } from '../Icon';
import { Panel } from './Panel';
import { Choice, Field, Slider } from './controls';
import type { Difficulty, GameSettings } from '../../sim/types';
import { useState } from 'react';

const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  relaxed: 'Guardians are slower and give up quickly. Great for a first go.',
  standard: 'The way the sanctuary usually runs.',
  ranger: 'Guardians are sharper and more stubborn. A proper challenge.',
};

const REMAPPABLE = [
  ['forward', 'Run forwards'],
  ['back', 'Run backwards'],
  ['left', 'Go left'],
  ['right', 'Go right'],
  ['sprint', 'Sprint'],
  ['jump', 'Jump and vault'],
  ['crouch', 'Crouch and slide'],
  ['interact', 'Pick up / use'],
  ['tool', 'Throw a tool'],
  ['photo', 'Photo mode'],
  ['menu', 'Menu'],
] as const;

export function SettingsPanel(): React.ReactElement {
  const settings = useGame((s) => s.save.settings);
  const update = useGame((s) => s.updateSettings);
  const close = useGame((s) => s.setMenu);
  const [listening, setListening] = useState<string | null>(null);

  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]): void => {
    update({ [key]: value } as Partial<GameSettings>);
  };

  const rebind = (action: string): void => {
    setListening(action);
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      window.removeEventListener('keydown', onKey, true);
      setListening(null);
      if (event.code === 'Escape') return;
      update({ bindings: { ...settings.bindings, [action]: event.code } });
    };
    window.addEventListener('keydown', onKey, true);
  };

  return (
    <Panel
      icon="settings"
      title="Settings"
      intro="Change anything you like. Nothing here can break your sanctuary."
      onClose={() => close('none')}
    >
      <section>
        <h3>
          <Icon name="ear" size={22} /> Seeing and hearing
        </h3>

        <Field label="Captions" icon="ear" hint="Show words for every sound. On by default.">
          <Choice
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            value={settings.captions ? 'on' : 'off'}
            onChange={(v) => set('captions', v === 'on')}
          />
        </Field>

        <Field
          label="Colours"
          icon="star"
          hint="Rarity always shows a word and a row of dots too, so nothing depends on colour."
        >
          <Choice
            options={[
              { value: 'off', label: 'Standard' },
              { value: 'deuteranopia', label: 'Green-friendly' },
              { value: 'protanopia', label: 'Red-friendly' },
              { value: 'tritanopia', label: 'Blue-friendly' },
            ]}
            value={settings.colourblind}
            onChange={(v) => set('colourblind', v as GameSettings['colourblind'])}
          />
        </Field>

        <Field
          label="Less movement"
          icon="calm"
          hint="Turns off camera shake, motion blur, screen wobble and film grain."
        >
          <Choice
            options={[
              { value: 'off', label: 'Normal' },
              { value: 'on', label: 'Reduced' },
            ]}
            value={settings.reducedMotion ? 'on' : 'off'}
            onChange={(v) => set('reducedMotion', v === 'on')}
          />
        </Field>

        <Field label="Text size" icon="book" hint="Makes everything on screen bigger.">
          <Slider
            min={1}
            max={1.5}
            step={0.05}
            value={settings.uiScale}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set('uiScale', v)}
          />
        </Field>
      </section>

      <section>
        <h3>
          <Icon name="grab" size={22} /> Controls
        </h3>

        <Field label="Sprint" icon="sprint" hint="Hold the button, or press once to switch it on.">
          <Choice
            options={[
              { value: 'hold', label: 'Hold' },
              { value: 'toggle', label: 'Press once' },
            ]}
            value={settings.holdToSprint ? 'hold' : 'toggle'}
            onChange={(v) => set('holdToSprint', v === 'hold')}
          />
        </Field>

        <Field label="Crouch" icon="crouch" hint="Same choice for crouching.">
          <Choice
            options={[
              { value: 'hold', label: 'Hold' },
              { value: 'toggle', label: 'Press once' },
            ]}
            value={settings.holdToCrouch ? 'hold' : 'toggle'}
            onChange={(v) => set('holdToCrouch', v === 'hold')}
          />
        </Field>

        <Field label="Look speed" icon="camera">
          <Slider
            min={0.3}
            max={2.5}
            step={0.1}
            value={settings.lookSensitivity}
            format={(v) => `${v.toFixed(1)}x`}
            onChange={(v) => set('lookSensitivity', v)}
          />
        </Field>

        <Field label="Up is down" icon="camera" hint="Invert the camera's up and down.">
          <Choice
            options={[
              { value: 'off', label: 'Normal' },
              { value: 'on', label: 'Inverted' },
            ]}
            value={settings.invertY ? 'on' : 'off'}
            onChange={(v) => set('invertY', v === 'on')}
          />
        </Field>

        <p className="field__hint">
          Every button can be moved. You can put them all on one side of the keyboard if you play
          one-handed.
        </p>
        <div className="button-row">
          {REMAPPABLE.map(([action, label]) => (
            <button key={action} type="button" className="button" onClick={() => rebind(action)}>
              {label}
              <kbd className="prompt__key">
                {listening === action
                  ? 'press a key'
                  : keyLabel(settings.bindings[action] ?? DEFAULT_BINDINGS[action] ?? '')}
              </kbd>
            </button>
          ))}
          <button
            type="button"
            className="button"
            onClick={() => update({ bindings: { ...DEFAULT_BINDINGS } })}
          >
            <Icon name="tick" size={20} /> Put them all back
          </button>
        </div>
      </section>

      <section>
        <h3>
          <Icon name="star" size={22} /> How tricky?
        </h3>
        <Field label="Difficulty" icon="star" hint={DIFFICULTY_BLURB[settings.difficulty]}>
          <Choice
            options={[
              { value: 'relaxed', label: 'Relaxed' },
              { value: 'standard', label: 'Standard' },
              { value: 'ranger', label: 'Ranger' },
            ]}
            value={settings.difficulty}
            onChange={(v) => set('difficulty', v as Difficulty)}
          />
        </Field>
        <p className="field__hint">
          You can change this whenever you like, even in the middle of a run. Nothing is lost.
        </p>
      </section>

      <section>
        <h3>
          <Icon name="camera" size={22} /> Picture and sound
        </h3>

        <Field
          label="Detail"
          icon="settings"
          hint="Lower detail runs more smoothly on older computers."
        >
          <Choice
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'ultra', label: 'Ultra' },
            ]}
            value={settings.quality}
            onChange={(v) => set('quality', v as GameSettings['quality'])}
          />
        </Field>

        <Field label="Brightness" icon="settings">
          <Slider
            min={0.5}
            max={1.8}
            step={0.05}
            value={settings.exposure}
            format={(v) => `${v.toFixed(2)}`}
            onChange={(v) => set('exposure', v)}
          />
        </Field>

        <Field label="Camera wobble" icon="camera">
          <Choice
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            value={settings.cameraShake ? 'on' : 'off'}
            onChange={(v) => set('cameraShake', v === 'on')}
          />
        </Field>

        <Field label="All sound" icon="ear">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={settings.masterVolume}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set('masterVolume', v)}
          />
        </Field>

        <Field label="Music" icon="ear">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={settings.musicVolume}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set('musicVolume', v)}
          />
        </Field>

        <Field label="Sound effects" icon="ear">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={settings.sfxVolume}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set('sfxVolume', v)}
          />
        </Field>
      </section>
    </Panel>
  );
}
