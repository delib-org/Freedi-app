'use client';

import { useState, useEffect } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './QuestionHeader.module.css';

interface QuestionHeaderProps {
  question: Statement;
}

/**
 * Client Component - Question header
 * Displays question title and description with translations
 */
export default function QuestionHeader({ question }: QuestionHeaderProps) {
  const { t, tWithParams, currentLanguage } = useTranslation();
  const solutionCount = question.totalSubStatements || question.suggestions || 0;

  // Use state for date to avoid hydration mismatch (server doesn't know user's locale)
  const [formattedDate, setFormattedDate] = useState<string>('');

  useEffect(() => {
    // Format date according to current language on client side only
    const locale = currentLanguage === 'he' ? 'he-IL' : currentLanguage === 'ar' ? 'ar-SA' : 'en-US';
    setFormattedDate(new Date(question.createdAt).toLocaleDateString(locale));
  }, [question.createdAt, currentLanguage]);

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{question.statement}</h1>
      {question.description && (
        <p className={styles.description}>{question.description}</p>
      )}
      <div className={styles.meta}>
        <span className={styles.metaItem}>
          {tWithParams('{{count}} suggestions', { count: solutionCount })}
        </span>
        <span className={styles.metaItem}>
          {t('Created')} {formattedDate}
        </span>
      </div>
    </header>
  );
}
