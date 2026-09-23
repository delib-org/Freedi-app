'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import { CARD_COLOR_INTENSITY } from '@/constants/common';
import { cardColorIntensityStyle, clampCardColorIntensity } from '@/lib/utils/cardColorIntensity';
import styles from './CardColorIntensityControl.module.scss';

interface CardColorIntensityControlProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

const PERCENT = 100;
const PREVIEW_ZONES = [0, 1, 2, 3, 4] as const;

/**
 * Admin slider for how strongly the evaluation cards are tinted.
 * Only the card background fades; the preview shows the five rating colours.
 */
export default function CardColorIntensityControl({ value, onChange }: CardColorIntensityControlProps) {
  const { t } = useTranslation();
  const intensity = clampCardColorIntensity(value);
  const percent = Math.round(intensity * PERCENT);

  return (
    <div className={styles.control}>
      <div className={styles.header}>
        <label htmlFor="cardColorIntensity" className={styles.label}>
          {t('cardColorIntensity') || 'Card color intensity'}
        </label>
        <span className={styles.value}>{percent}%</span>
      </div>
      <input
        id="cardColorIntensity"
        type="range"
        className={styles.slider}
        min={CARD_COLOR_INTENSITY.MIN * PERCENT}
        max={CARD_COLOR_INTENSITY.MAX * PERCENT}
        step={CARD_COLOR_INTENSITY.STEP_PERCENT}
        value={percent}
        aria-valuetext={`${percent}%`}
        onChange={(e) => onChange(Number(e.target.value) / PERCENT)}
      />
      <div className={styles.preview} style={cardColorIntensityStyle(intensity)} aria-hidden="true">
        {PREVIEW_ZONES.map((zone) => (
          <span key={zone} className={`${styles.zone} ${styles[`zone${zone}`]}`} />
        ))}
      </div>
      <p className={styles.hint}>
        {t('cardColorIntensityHint') ||
          'Lower it to soften the colored background of the evaluation cards. Text, emoji and buttons keep their colors.'}
      </p>
    </div>
  );
}
