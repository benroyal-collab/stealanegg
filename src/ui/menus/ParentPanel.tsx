/**
 * The Parent Panel.
 *
 * Written for an adult, in plain English, and it makes verifiable claims
 * rather than reassuring ones. Every promise on this page is enforced by a
 * test in the repository, and the page says which.
 */

import { ECONOMY } from '../../data/balance';
import { useGame } from '../../state/store';
import { formatDuration } from '../format';
import { Icon } from '../Icon';
import { Panel } from './Panel';
import { Choice, Field, Slider } from './controls';
import { useState } from 'react';

export function ParentPanel(): React.ReactElement {
  const save = useGame((s) => s.save);
  const sessionMs = useGame((s) => s.sessionMs);
  const update = useGame((s) => s.updateSettings);
  const close = useGame((s) => s.setMenu);
  const exportSave = useGame((s) => s.exportSave);
  const importSave = useGame((s) => s.importSave);
  const wipe = useGame((s) => s.wipe);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const download = (): void => {
    const blob = new Blob([exportSave()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'egg-heist-wildlands-save.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const upload = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    if (file === undefined) return;
    void file.text().then((text) => {
      setImportError(importSave(text) ? null : 'That file could not be read.');
    });
  };

  return (
    <Panel
      icon="parents"
      title="For grown-ups"
      intro="Everything you might want to check, and how to change it."
      onClose={() => close('none')}
    >
      <section>
        <h3>
          <Icon name="clock" size={22} /> Time
        </h3>
        <p>
          Played in this sitting: <strong>{formatDuration(sessionMs / 1000)}</strong>.
          <br />
          Played in total: <strong>{formatDuration(save.playSeconds)}</strong>.
        </p>

        <Field
          label="Break reminder"
          icon="clock"
          hint="A friendly, dismissible nudge. It never blocks play and never guilt-trips."
        >
          <Slider
            min={0}
            max={120}
            step={5}
            value={save.settings.breakReminderMinutes}
            format={(v) => (v === 0 ? 'Off' : `${v} min`)}
            onChange={(v) => update({ breakReminderMinutes: v })}
          />
        </Field>
      </section>

      <section>
        <h3>
          <Icon name="tick" size={22} /> What this game does not do
        </h3>
        <ul>
          <li>
            <strong>No accounts and no sign-in.</strong> The game never asks who your child is.
          </li>
          <li>
            <strong>No data leaves this device.</strong> There is no analytics, no telemetry and no
            third-party request of any kind. An automated test intercepts every network request the
            page makes and fails the build if one leaves the origin.
          </li>
          <li>
            <strong>No adverts, and nothing to buy.</strong> No in-app purchases, no currency packs,
            no loot boxes. Not stubbed out for later — there is no payment code in the project.
          </li>
          <li>
            <strong>No chat and no user content.</strong> Nobody can send your child a message.
          </li>
          <li>
            <strong>No dark patterns.</strong> No daily-login streaks, no countdown offers, no
            energy meters, nothing that punishes putting the game down.
          </li>
          <li>
            <strong>Idling is a bad strategy on purpose.</strong> Offline earnings are capped at{' '}
            {ECONOMY.offlineCapHours} hours and paid at half rate, so leaving the tab open is never
            better than playing.
          </li>
          <li>
            <strong>Nothing gets hurt.</strong> No weapons, no combat, no death, no jump-scares. The
            worst that happens is a guardian shoos your child away and they tumble over.
          </li>
          <li>
            <strong>Nothing flashes.</strong> No effect in the game pulses faster than three times a
            second, anywhere.
          </li>
        </ul>
      </section>

      <section>
        <h3>
          <Icon name="book" size={22} /> Your child's save
        </h3>
        <p className="field__hint">
          The save lives in this browser and nowhere else. You can take a copy or delete it
          entirely, at any time, without asking anyone.
        </p>
        <div className="button-row">
          <button type="button" className="button" onClick={download}>
            <Icon name="tick" size={20} /> Save a copy
          </button>
          <label className="button">
            <Icon name="book" size={20} /> Load a copy
            <input type="file" accept="application/json" onChange={upload} className="sr-only" />
          </label>
          {confirmWipe ? (
            <>
              <button
                type="button"
                className="button button--danger"
                onClick={() => {
                  wipe();
                  setConfirmWipe(false);
                }}
              >
                <Icon name="close" size={20} /> Yes, delete everything
              </button>
              <button type="button" className="button" onClick={() => setConfirmWipe(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button button--danger"
              onClick={() => setConfirmWipe(true)}
            >
              <Icon name="close" size={20} /> Delete the save
            </button>
          )}
        </div>
        {importError === null ? null : <p className="field__hint">{importError}</p>}
      </section>

      <section>
        <h3>
          <Icon name="star" size={22} /> How tricky it is
        </h3>
        <Field label="Difficulty" icon="star" hint="Changeable at any time, including mid-run.">
          <Choice
            options={[
              { value: 'relaxed', label: 'Relaxed' },
              { value: 'standard', label: 'Standard' },
              { value: 'ranger', label: 'Ranger' },
            ]}
            value={save.settings.difficulty}
            onChange={(v) => update({ difficulty: v as 'relaxed' | 'standard' | 'ranger' })}
          />
        </Field>
        <Field
          label="Less movement"
          icon="calm"
          hint="For motion sensitivity: turns off camera shake, motion blur and screen wobble."
        >
          <Choice
            options={[
              { value: 'off', label: 'Normal' },
              { value: 'on', label: 'Reduced' },
            ]}
            value={save.settings.reducedMotion ? 'on' : 'off'}
            onChange={(v) => update({ reducedMotion: v === 'on' })}
          />
        </Field>
      </section>
    </Panel>
  );
}
