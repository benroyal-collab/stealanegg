/**
 * Form controls.
 *
 * Every one of them is at least 48px tall, has a visible label with an icon,
 * and shows its selected state with a tick as well as a colour.
 */

import { Icon } from '../Icon';

export function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon: string;
  hint?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="field">
      <span className="field__label">
        <Icon name={icon} size={20} />
        {label}
      </span>
      <div>{children}</div>
      {hint === undefined ? null : <p className="field__hint">{hint}</p>}
    </div>
  );
}

export interface ChoiceOption {
  value: string;
  label: string;
}

export function Choice({
  options,
  value,
  onChange,
}: {
  options: readonly ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className="choices" role="group">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className="choice"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {/* A tick, not just a highlight: selection never depends on colour. */}
            {selected ? <Icon name="tick" size={18} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      <span style={{ minWidth: 62, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {format(value)}
      </span>
    </div>
  );
}
