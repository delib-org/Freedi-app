/**
 * QuestionIntro Component
 * Welcome screen shown before starting to swipe through proposals
 */

import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Statement } from '@freedi/shared-types';
import { Button } from '@/components/atomic/atoms/Button';
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

      {question.description && (
        <p className="question-intro__description">{question.description}</p>
      )}

      <div className="question-intro__meta">
        <span>⏱️ {t('Takes about 2-3 minutes')}</span>
        <span>✨ {t('You can stop anytime')}</span>
      </div>

      <Button
        text={t("Let's Go")}
        variant="primary"
        size="large"
        onClick={onStart}
        className="question-intro__button"
      />
    </div>
  );
};

export default QuestionIntro;
