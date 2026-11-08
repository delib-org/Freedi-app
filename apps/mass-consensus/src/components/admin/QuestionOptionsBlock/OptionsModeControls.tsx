'use client';

/**
 * OptionsModeControls — "Admin options only" and the two switches it stands
 * for: the admin writes the options (with pictures), and participants cannot
 * add their own. The master switch is on only when both are on, so a mixed
 * state is visible in the two switches under it.
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import Switch from '@/components/shared/Switch';

export interface OptionsMode {
  adminProvidesOptions: boolean;
  blockParticipantOptions: boolean;
}

export interface OptionsModeControlsProps {
  mode: OptionsMode;
  onChange: (mode: OptionsMode) => void;
  disabled?: boolean;
}

export default function OptionsModeControls({ mode, onChange, disabled = false }: OptionsModeControlsProps) {
  const { t } = useTranslation();
  const adminOnly = mode.adminProvidesOptions && mode.blockParticipantOptions;

  return (
    <div className="question-options__mode">
      <Switch
        prominent
        checked={adminOnly}
        disabled={disabled}
        onChange={(on) => onChange({ adminProvidesOptions: on, blockParticipantOptions: on })}
        label={t('Admin options only')}
        hint={t("You write the options. Participants rate them and can't add their own.")}
      />

      <div className="question-options__switches">
        <Switch
          checked={mode.adminProvidesOptions}
          disabled={disabled}
          onChange={(on) => onChange({ ...mode, adminProvidesOptions: on })}
          label={t('I add the options, with pictures')}
        />
        <Switch
          checked={mode.blockParticipantOptions}
          disabled={disabled}
          onChange={(on) => onChange({ ...mode, blockParticipantOptions: on })}
          label={t("Participants can't add options")}
        />
      </div>
    </div>
  );
}
