/**
 * QuestionIntro Component
 * Welcome screen shown before starting to swipe through proposals
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Statement } from '@freedi/shared-types';
import clsx from 'clsx';

export interface QuestionIntroProps {
  question: Statement;
  onStart: () => void;
  className?: string;
}

const QuestionIntro: React.FC<QuestionIntroProps> = ({
  question,
  onStart,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div className={clsx('question-intro', className)}>
      <h1 className="question-intro__title">{question.statement}</h1>

      {(question as Statement & { description?: string }).description && (
        <p className="question-intro__description">{(question as Statement & { description?: string }).description}</p>
      )}

      <div className="question-intro__meta">
        <span>⏱️ {t('Takes about 2-3 minutes')}</span>
        <span>✨ {t('You can stop anytime')}</span>
      </div>

      <button
        onClick={onStart}
        className="question-intro__button"
      >
        {t("Let's Go")}
      </button>
    </div>
  );
};

export default QuestionIntro;
