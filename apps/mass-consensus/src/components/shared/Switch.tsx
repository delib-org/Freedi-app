'use client';

/**
 * Switch — an on/off control with its label and an optional one-line hint.
 * Styles: src/styles/atoms/_switch.scss (BEM block `switch`).
 */

import React, { useId } from 'react';
import clsx from 'clsx';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  /** A bigger, bolder switch that stands for the whole group under it. */
  prominent?: boolean;
  className?: string;
}

export default function Switch({ checked, onChange, label, hint, disabled = false, prominent = false, className }: SwitchProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={clsx('switch', prominent && 'switch--prominent', disabled && 'switch--disabled', className)}>
      <label className="switch__control" htmlFor={id}>
        <input
          id={id}
          className="switch__input"
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-checked={checked}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch__track" aria-hidden="true">
          <span className="switch__thumb" />
        </span>
        <span className="switch__label">{label}</span>
      </label>
      {hint && (
        <p id={hintId} className="switch__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
