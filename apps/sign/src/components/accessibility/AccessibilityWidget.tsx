'use client';

import { useEffect, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import {
  useAccessibilityStore,
  FontSizeLevel,
  ContrastMode,
  FONT_SIZE_SCALE,
} from '@/store/accessibilityStore';
import styles from './AccessibilityWidget.module.scss';

interface AccessibilityWidgetProps {
  documentId: string;
}

export default function AccessibilityWidget({ documentId }: AccessibilityWidgetProps) {
  const { t } = useTranslation();
  const {
    fontSize,
    setFontSize,
    contrastMode,
    setContrastMode,
    reduceMotion,
    setReduceMotion,
    isPanelOpen,
    togglePanel,
    closePanel,
    isKeyboardModalOpen,
    openKeyboardModal,
    closeKeyboardModal,
    resetSettings,
  } = useAccessibilityStore();

  // Close panel on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isKeyboardModalOpen) {
          closeKeyboardModal();
        } else if (isPanelOpen) {
          closePanel();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isPanelOpen, isKeyboardModalOpen, closePanel, closeKeyboardModal]);

  // Apply accessibility classes to document body
  useEffect(() => {
    const body = document.body;

    // Font size
    body.classList.remove('a11y-text-normal', 'a11y-text-large', 'a11y-text-larger', 'a11y-text-largest');
    if (fontSize !== 'normal') {
      body.classList.add(`a11y-text-${fontSize}`);
    }

    // Contrast mode
    body.classList.remove('a11y-contrast-light', 'a11y-contrast-dark');
    if (contrastMode === 'high-light') {
      body.classList.add('a11y-contrast-light');
    } else if (contrastMode === 'high-dark') {
      body.classList.add('a11y-contrast-dark');
    }

    // Reduce motion
    if (reduceMotion) {
      body.classList.add('a11y-reduce-motion');
    } else {
      body.classList.remove('a11y-reduce-motion');
    }
  }, [fontSize, contrastMode, reduceMotion]);

  const fontSizeLevels: { level: FontSizeLevel; label: string }[] = [
    { level: 'normal', label: t('Normal') },
    { level: 'large', label: t('Large') },
    { level: 'larger', label: t('Larger') },
    { level: 'largest', label: t('Largest') },
  ];

  const contrastModes: { mode: ContrastMode; label: string }[] = [
    { mode: 'default', label: t('Default') },
    { mode: 'high-light', label: t('High Contrast Light') },
    { mode: 'high-dark', label: t('High Contrast Dark') },
  ];

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(`.${styles.widget}`)) {
      closePanel();
    }
  }, [closePanel]);

  useEffect(() => {
    if (isPanelOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isPanelOpen, handleClickOutside]);

  return (
    <div className={styles.widget}>
      {/* Floating accessibility button */}
      <button
        type="button"
        className={styles.floatingButton}
        onClick={(e) => {
          e.stopPropagation();
          togglePanel();
        }}
        aria-label={t('Accessibility options')}
        aria-expanded={isPanelOpen}
        aria-haspopup="dialog"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Accessibility icon (person with arms out) */}
          <circle cx="12" cy="4" r="2" />
          <path d="M12 6v6" />
          <path d="M6 10l6 2 6-2" />
          <path d="M8 22l4-10 4 10" />
        </svg>
      </button>

      {/* Accessibility panel */}
      {isPanelOpen && (
        <div
          className={styles.panel}
          role="dialog"
          aria-label={t('Accessibility options')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t('Accessibility')}</h2>
            <button
              type="button"
              className={styles.closeButton}
              onClick={closePanel}
              aria-label={t('Close')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className={styles.panelContent}>
            {/* Font Size Section */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>{t('Text Size')}</h3>
              <div className={styles.fontSizeButtons}>
                {fontSizeLevels.map(({ level, label }) => (
                  <button
                    key={level}
                    type="button"
                    className={clsx(
                      styles.fontSizeButton,
                      fontSize === level && styles.active
                    )}
                    onClick={() => setFontSize(level)}
                    aria-pressed={fontSize === level}
                    style={{ fontSize: `${FONT_SIZE_SCALE[level] * 14}px` }}
                  >
                    <span className={styles.fontSizeLabel}>A</span>
                    <span className={styles.fontSizeName}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Contrast Mode Section */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>{t('High Contrast')}</h3>
              <div className={styles.contrastButtons}>
                {contrastModes.map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    className={clsx(
                      styles.contrastButton,
                      contrastMode === mode && styles.active
                    )}
                    onClick={() => setContrastMode(mode)}
                    aria-pressed={contrastMode === mode}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reduce Motion Toggle */}
            <div className={styles.section}>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>{t('Stop Animations')}</span>
                <button
                  type="button"
                  className={clsx(styles.toggle, reduceMotion && styles.active)}
                  onClick={() => setReduceMotion(!reduceMotion)}
                  aria-pressed={reduceMotion}
                  role="switch"
                />
              </div>
            </div>

            {/* Keyboard Shortcuts Link */}
            <div className={styles.section}>
              <button
                type="button"
                className={styles.linkButton}
                onClick={openKeyboardModal}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
                  <path d="M6 8h.001" />
                  <path d="M10 8h.001" />
                  <path d="M14 8h.001" />
                  <path d="M18 8h.001" />
                  <path d="M8 12h.001" />
                  <path d="M12 12h.001" />
                  <path d="M16 12h.001" />
                  <path d="M7 16h10" />
                </svg>
                {t('Keyboard Shortcuts')}
              </button>
            </div>

            {/* Accessibility Statement Link */}
            <div className={styles.section}>
              <a
                href="/accessibility"
                className={styles.linkButton}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                {t('Accessibility Statement')}
              </a>
            </div>

            {/* Reset Button */}
            <div className={styles.section}>
              <button
                type="button"
                className={styles.resetButton}
                onClick={resetSettings}
              >
                {t('Reset to Default')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {isKeyboardModalOpen && (
        <div className={styles.modalOverlay} onClick={closeKeyboardModal}>
          <div
            className={styles.modal}
            role="dialog"
            aria-label={t('Keyboard Shortcuts')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{t('Keyboard Shortcuts')}</h2>
              <button
                type="button"
                className={styles.closeButton}
                onClick={closeKeyboardModal}
                aria-label={t('Close')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className={styles.modalContent}>
              <table className={styles.shortcutsTable}>
                <thead>
                  <tr>
                    <th>{t('Action')}</th>
                    <th>{t('Shortcut')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{t('Navigate to next section')}</td>
                    <td><kbd>Tab</kbd></td>
                  </tr>
                  <tr>
                    <td>{t('Navigate to previous section')}</td>
                    <td><kbd>Shift</kbd> + <kbd>Tab</kbd></td>
                  </tr>
                  <tr>
                    <td>{t('Expand/collapse section')}</td>
                    <td><kbd>Enter</kbd> / <kbd>Space</kbd></td>
                  </tr>
                  <tr>
                    <td>{t('Close modal/panel')}</td>
                    <td><kbd>Escape</kbd></td>
                  </tr>
                  <tr>
                    <td>{t('Scroll up')}</td>
                    <td><kbd>Arrow Up</kbd> / <kbd>Page Up</kbd></td>
                  </tr>
                  <tr>
                    <td>{t('Scroll down')}</td>
                    <td><kbd>Arrow Down</kbd> / <kbd>Page Down</kbd></td>
                  </tr>
                  <tr>
                    <td>{t('Go to top of page')}</td>
                    <td><kbd>Home</kbd></td>
                  </tr>
                  <tr>
                    <td>{t('Go to bottom of page')}</td>
                    <td><kbd>End</kbd></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
