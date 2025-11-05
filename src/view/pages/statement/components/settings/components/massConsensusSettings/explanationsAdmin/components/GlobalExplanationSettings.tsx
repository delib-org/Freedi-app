import React, { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { ExplanationDisplayMode } from 'delib-npm';
import styles from './GlobalExplanationSettings.module.scss';

interface GlobalSettings {
  enabled: boolean;
  defaultDisplayMode: ExplanationDisplayMode;
  showProgressIndicator: boolean;
  allowUserDismiss: boolean;
}

interface GlobalExplanationSettingsProps {
  settings: GlobalSettings;
  onChange: (updates: Partial<GlobalSettings>) => void;
}

const DISPLAY_MODES: { value: ExplanationDisplayMode; label: string; icon: string; description: string }[] = [
  {
    value: 'card',
    label: 'Card',
    icon: '🗂️',
    description: 'Prominent card with title and content'
  },
  {
    value: 'inline',
    label: 'Inline',
    icon: '📝',
    description: 'Subtle inline message'
  },
  {
    value: 'tooltip',
    label: 'Tooltip',
    icon: '💬',
    description: 'Small floating tooltip'
  },
  {
    value: 'modal',
    label: 'Modal',
    icon: '🪟',
    description: 'Full attention modal dialog'
  },
  {
    value: 'toast',
    label: 'Toast',
    icon: '🍞',
    description: 'Temporary notification'
  },
  {
    value: 'banner',
    label: 'Banner',
    icon: '🏷️',
    description: 'Top or bottom banner'
  }
];

const GlobalExplanationSettings: FC<GlobalExplanationSettingsProps> = ({ settings, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.globalSettings}>
      {/* Master enable/disable toggle */}
      <div className={styles.settingGroup}>
        <label className={styles.toggleSetting}>
          <div className={styles.toggleContent}>
            <span className={styles.toggleLabel}>{t('Enable Explanations')}</span>
            <span className={styles.toggleDescription}>
              {t('Show help text and feedback throughout the process')}
            </span>
          </div>
          <div className={styles.switchWrapper}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className={styles.switch}
            />
            <span className={styles.switchSlider}></span>
          </div>
        </label>
      </div>

      {/* Default display mode selector */}
      <div className={`${styles.settingGroup} ${!settings.enabled ? styles.disabled : ''}`}>
        <label className={styles.settingLabel}>
          {t('Default Display Mode')}
        </label>
        <p className={styles.settingDescription}>
          {t('How explanations appear by default')}
        </p>
        <div className={styles.displayModeGrid}>
          {DISPLAY_MODES.map(mode => (
            <button
              key={mode.value}
              className={`${styles.displayModeOption} ${settings.defaultDisplayMode === mode.value ? styles.selected : ''}`}
              onClick={() => onChange({ defaultDisplayMode: mode.value })}
              disabled={!settings.enabled}
            >
              <span className={styles.modeIcon}>{mode.icon}</span>
              <span className={styles.modeName}>{t(mode.label)}</span>
              <span className={styles.modeDescription}>{t(mode.description)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Progress indicator toggle */}
      <div className={`${styles.settingGroup} ${!settings.enabled ? styles.disabled : ''}`}>
        <label className={styles.toggleSetting}>
          <div className={styles.toggleContent}>
            <span className={styles.toggleLabel}>{t('Show Progress')}</span>
            <span className={styles.toggleDescription}>
              {t('Display stage progress indicator')}
            </span>
          </div>
          <div className={styles.switchWrapper}>
            <input
              type="checkbox"
              checked={settings.showProgressIndicator}
              onChange={(e) => onChange({ showProgressIndicator: e.target.checked })}
              disabled={!settings.enabled}
              className={styles.switch}
            />
            <span className={styles.switchSlider}></span>
          </div>
        </label>
      </div>

      {/* Allow user dismiss toggle */}
      <div className={`${styles.settingGroup} ${!settings.enabled ? styles.disabled : ''}`}>
        <label className={styles.toggleSetting}>
          <div className={styles.toggleContent}>
            <span className={styles.toggleLabel}>{t('User Can Dismiss')}</span>
            <span className={styles.toggleDescription}>
              {t('Allow users to close explanations')}
            </span>
          </div>
          <div className={styles.switchWrapper}>
            <input
              type="checkbox"
              checked={settings.allowUserDismiss}
              onChange={(e) => onChange({ allowUserDismiss: e.target.checked })}
              disabled={!settings.enabled}
              className={styles.switch}
            />
            <span className={styles.switchSlider}></span>
          </div>
        </label>
      </div>

      {/* Visual preview of current settings */}
      <div className={`${styles.previewIndicator} ${!settings.enabled ? styles.disabled : ''}`}>
        <div className={styles.previewHeader}>
          <span className={styles.previewTitle}>{t('Current Configuration')}</span>
        </div>
        <div className={styles.previewItems}>
          <div className={styles.previewItem}>
            <span className={styles.previewIcon}>
              {settings.enabled ? '✅' : '🚫'}
            </span>
            <span className={styles.previewText}>
              {settings.enabled ? t('Explanations Active') : t('Explanations Disabled')}
            </span>
          </div>
          {settings.enabled && (
            <>
              <div className={styles.previewItem}>
                <span className={styles.previewIcon}>
                  {DISPLAY_MODES.find(m => m.value === settings.defaultDisplayMode)?.icon}
                </span>
                <span className={styles.previewText}>
                  {t('Default')}: {t(DISPLAY_MODES.find(m => m.value === settings.defaultDisplayMode)?.label || '')}
                </span>
              </div>
              {settings.showProgressIndicator && (
                <div className={styles.previewItem}>
                  <span className={styles.previewIcon}>📊</span>
                  <span className={styles.previewText}>{t('Progress Shown')}</span>
                </div>
              )}
              {settings.allowUserDismiss && (
                <div className={styles.previewItem}>
                  <span className={styles.previewIcon}>❌</span>
                  <span className={styles.previewText}>{t('Dismissible')}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalExplanationSettings;