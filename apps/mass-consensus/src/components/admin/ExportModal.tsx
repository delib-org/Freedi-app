'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { logError } from '@/lib/utils/errorHandling';
import styles from './Admin.module.scss';

interface ExportModalProps {
  surveyId: string;
  surveyTitle: string;
  onClose: () => void;
  onExport: (includeTestData: boolean) => Promise<void>;
}

/**
 * Modal for exporting survey data with options
 */
export default function ExportModal({
  surveyTitle,
  onClose,
  onExport,
}: ExportModalProps) {
  const { t } = useTranslation();
  const [includeTestData, setIncludeTestData] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport(includeTestData);
      onClose();
    } catch (error) {
      logError(error, {
        operation: 'ExportModal.handleExport',
        metadata: { context: 'Export failed' },
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={styles.confirmModal} onClick={onClose}>
      <div className={styles.confirmContent} onClick={(e) => e.stopPropagation()}>
        <h3>{t('exportSurveyData')}</h3>
        <p className={styles.exportSurveyName}>{surveyTitle}</p>

        <div className={styles.exportOptions}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includeTestData}
              onChange={(e) => setIncludeTestData(e.target.checked)}
              disabled={isExporting}
            />
            <span>{t('includeTestData')}</span>
          </label>
          <p className={styles.hint}>{t('includeTestDataHint')}</p>
        </div>

        <div className={styles.confirmActions}>
          <button
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isExporting}
          >
            {t('cancel')}
          </button>
          <button
            className={styles.submitButton}
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? t('downloading') : t('downloadData')}
          </button>
        </div>
      </div>
    </div>
  );
}
