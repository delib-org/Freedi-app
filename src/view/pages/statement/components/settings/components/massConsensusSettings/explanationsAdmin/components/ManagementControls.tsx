import React, { FC } from 'react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import styles from './ManagementControls.module.scss';

interface ManagementControlsProps {
  onReset: () => void;
  onExport: () => void;
  onImport: () => void;
  onBulkToggle: (enabled: boolean) => void;
}

const ManagementControls: FC<ManagementControlsProps> = ({
  onReset,
  onExport,
  onImport,
  onBulkToggle
}) => {
  const { t } = useUserConfig();

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const config = JSON.parse(event.target?.result as string);
            onImport();
            console.info('Imported configuration:', config);
          } catch (error) {
            console.error('Error parsing imported file:', error);
            alert(t('Invalid configuration file'));
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className={styles.managementControls}>
      <h3 className={styles.controlsTitle}>{t('Management')}</h3>

      <div className={styles.controlsGrid}>
        {/* Bulk Actions */}
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>{t('Bulk Actions')}</span>
          <div className={styles.bulkActions}>
            <button
              className={styles.controlButton}
              onClick={() => onBulkToggle(true)}
              title={t('Enable all stage explanations')}
            >
              <span className={styles.buttonIcon}>✅</span>
              <span className={styles.buttonText}>{t('Enable All')}</span>
            </button>
            <button
              className={styles.controlButton}
              onClick={() => onBulkToggle(false)}
              title={t('Disable all stage explanations')}
            >
              <span className={styles.buttonIcon}>🚫</span>
              <span className={styles.buttonText}>{t('Disable All')}</span>
            </button>
          </div>
        </div>

        {/* Import/Export */}
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>{t('Configuration')}</span>
          <div className={styles.configActions}>
            <button
              className={`${styles.controlButton} ${styles.export}`}
              onClick={onExport}
              title={t('Export current configuration to file')}
            >
              <span className={styles.buttonIcon}>📤</span>
              <span className={styles.buttonText}>{t('Export')}</span>
            </button>
            <button
              className={`${styles.controlButton} ${styles.import}`}
              onClick={handleImportClick}
              title={t('Import configuration from file')}
            >
              <span className={styles.buttonIcon}>📥</span>
              <span className={styles.buttonText}>{t('Import')}</span>
            </button>
          </div>
        </div>

        {/* Reset */}
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>{t('Defaults')}</span>
          <button
            className={`${styles.controlButton} ${styles.reset}`}
            onClick={onReset}
            title={t('Reset all settings to default values')}
          >
            <span className={styles.buttonIcon}>🔄</span>
            <span className={styles.buttonText}>{t('Reset to Defaults')}</span>
          </button>
        </div>
      </div>

      {/* Quick Tips */}
      <div className={styles.quickTips}>
        <h4 className={styles.tipsTitle}>{t('Quick Tips')}</h4>
        <ul className={styles.tipsList}>
          <li>
            <span className={styles.tipIcon}>💾</span>
            <span>{t('Export your configuration before making major changes')}</span>
          </li>
          <li>
            <span className={styles.tipIcon}>🔄</span>
            <span>{t('Use reset to quickly restore default explanations')}</span>
          </li>
          <li>
            <span className={styles.tipIcon}>📋</span>
            <span>{t('Import configurations to share across statements')}</span>
          </li>
        </ul>
      </div>

      {/* Keyboard Shortcuts */}
      <div className={styles.shortcuts}>
        <h4 className={styles.shortcutsTitle}>{t('Shortcuts')}</h4>
        <div className={styles.shortcutsList}>
          <div className={styles.shortcut}>
            <kbd>Ctrl</kbd> + <kbd>S</kbd>
            <span>{t('Save')}</span>
          </div>
          <div className={styles.shortcut}>
            <kbd>Ctrl</kbd> + <kbd>P</kbd>
            <span>{t('Preview')}</span>
          </div>
          <div className={styles.shortcut}>
            <kbd>Esc</kbd>
            <span>{t('Exit Preview')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagementControls;