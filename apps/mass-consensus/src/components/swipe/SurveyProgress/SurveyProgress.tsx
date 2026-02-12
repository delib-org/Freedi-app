/**
 * SurveyProgress Component
 * Shows progress through the survey with a progress bar
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';

export interface SurveyProgressProps {
  current: number;
  total: number;
  className?: string;
}

const SurveyProgress: React.FC<SurveyProgressProps> = ({
  current,
  total,
  className,
}) => {
  const { t } = useTranslation();

  // Calculate percentage (0-100)
  const percentage = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;

  return (
    <div className={clsx('survey-progress', className)}>
      <div className="survey-progress__bar-container">
        <div
          className="survey-progress__bar-fill"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={t('Survey progress')}
        />
      </div>

      <div className="survey-progress__text">
        <span className="survey-progress__count">
          {current} {t('of')} {total}
        </span>
        <span>{Math.round(percentage)}%</span>
      </div>
    </div>
  );
};

export default SurveyProgress;
