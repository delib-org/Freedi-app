'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import { ACCESSIBILITY } from '@/constants/common';
import {
  A11yPrefs,
  A11yTheme,
  DEFAULT_A11Y_PREFS,
  applyA11yPrefs,
  stepFontScale,
} from '@/lib/accessibility/a11yPrefs';
import styles from './AccessibilityButton.module.scss';

interface AccessibilityButtonProps {
  /** Prefs the server already rendered onto <html> */
  initialPrefs: A11yPrefs;
}

const THEME_LABEL_KEYS: Record<A11yTheme, string> = {
  system: 'a11yThemeSystem',
  light: 'a11yThemeLight',
  dark: 'a11yThemeDark',
};

const FONT_STEPS: readonly number[] = ACCESSIBILITY.FONT_SCALE_STEPS;

/**
 * Floating accessibility control for participants: theme, high contrast and
 * text size. Hidden on admin screens.
 */
export default function AccessibilityButton({ initialPrefs }: AccessibilityButtonProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [prefs, setPrefs] = useState<A11yPrefs>(initialPrefs);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  const update = useCallback((next: A11yPrefs) => {
    setPrefs(next);
    applyA11yPrefs(document, next);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Esc closes; a click outside closes
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [isOpen, close]);

  // Move focus into the panel when it opens
  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [isOpen]);

  if (pathname?.startsWith('/admin')) return null;

  const scaleIndex = FONT_STEPS.indexOf(prefs.fontScale);

  return (
    <div className={styles['a11y']}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx(styles['a11y__trigger'], isOpen && styles['a11y__trigger--open'])}
        aria-label={t('a11yTitle') || 'Accessibility'}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="4" r="2" fill="currentColor" />
          <path
            d="M4 7.5 12 9l8-1.5M12 9v5m0 0-3.5 7M12 14l3.5 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          className={styles['a11y__panel']}
        >
          <div className={styles['a11y__header']}>
            <h2 id={titleId} className={styles['a11y__title']}>
              {t('a11yTitle') || 'Accessibility'}
            </h2>
            <button
              type="button"
              className={styles['a11y__close']}
              aria-label={t('a11yClose') || 'Close'}
              onClick={close}
            >
              ×
            </button>
          </div>

          <fieldset className={styles['a11y__group']}>
            <legend className={styles['a11y__label']}>{t('a11yTheme') || 'Theme'}</legend>
            <div className={styles['a11y__segmented']}>
              {ACCESSIBILITY.THEMES.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={clsx(
                    styles['a11y__segment'],
                    prefs.theme === theme && styles['a11y__segment--active']
                  )}
                  aria-pressed={prefs.theme === theme}
                  onClick={() => update({ ...prefs, theme })}
                >
                  {t(THEME_LABEL_KEYS[theme])}
                </button>
              ))}
            </div>
          </fieldset>

          <div className={styles['a11y__group']}>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.highContrast}
              className={styles['a11y__switch-row']}
              onClick={() => update({ ...prefs, highContrast: !prefs.highContrast })}
            >
              <span className={styles['a11y__label']}>
                {t('a11yHighContrast') || 'High contrast'}
              </span>
              <span
                className={clsx(
                  styles['a11y__switch'],
                  prefs.highContrast && styles['a11y__switch--on']
                )}
                aria-hidden="true"
              />
            </button>
          </div>

          <div className={styles['a11y__group']}>
            <span className={styles['a11y__label']} id={`${titleId}-size`}>
              {t('a11yTextSize') || 'Text size'}
            </span>
            <div className={styles['a11y__stepper']} role="group" aria-labelledby={`${titleId}-size`}>
              <button
                type="button"
                className={styles['a11y__step']}
                aria-label={t('a11yDecreaseText') || 'Smaller text'}
                disabled={scaleIndex <= 0}
                onClick={() => update({ ...prefs, fontScale: stepFontScale(prefs.fontScale, -1) })}
              >
                <span className={styles['a11y__step-small']} aria-hidden="true">A</span>−
              </button>
              <output className={styles['a11y__value']} aria-live="polite">
                {prefs.fontScale}%
              </output>
              <button
                type="button"
                className={styles['a11y__step']}
                aria-label={t('a11yIncreaseText') || 'Larger text'}
                disabled={scaleIndex >= FONT_STEPS.length - 1}
                onClick={() => update({ ...prefs, fontScale: stepFontScale(prefs.fontScale, 1) })}
              >
                <span className={styles['a11y__step-large']} aria-hidden="true">A</span>+
              </button>
            </div>
          </div>

          <button
            type="button"
            className={styles['a11y__reset']}
            onClick={() => update({ ...DEFAULT_A11Y_PREFS })}
          >
            {t('a11yReset') || 'Reset'}
          </button>
        </div>
      )}
    </div>
  );
}
