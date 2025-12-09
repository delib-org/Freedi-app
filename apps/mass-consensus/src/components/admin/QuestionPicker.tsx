'use client';

import { useState, useEffect } from 'react';
import { Statement } from 'delib-npm';
import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './Admin.module.scss';

interface QuestionPickerProps {
  selectedQuestions: Statement[];
  onQuestionsChange: (questions: Statement[]) => void;
}

/**
 * Component for selecting questions to add to a survey
 */
export default function QuestionPicker({
  selectedQuestions,
  onQuestionsChange,
}: QuestionPickerProps) {
  const { t } = useTranslation();
  const [availableQuestions, setAvailableQuestions] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('firebase_token');

      if (!token) {
        setError('Please log in to view questions');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/questions', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }

      const data = await response.json();
      setAvailableQuestions(data.questions);
    } catch (err) {
      console.error('[QuestionPicker] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleQuestion = (question: Statement) => {
    const isSelected = selectedQuestions.some(
      (q) => q.statementId === question.statementId
    );

    if (isSelected) {
      onQuestionsChange(
        selectedQuestions.filter((q) => q.statementId !== question.statementId)
      );
    } else {
      onQuestionsChange([...selectedQuestions, question]);
    }
  };

  const filteredQuestions = availableQuestions.filter((q) =>
    q.statement.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className={styles.questionPicker}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>{t('loadingQuestions')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.questionPicker}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={fetchQuestions} className={styles.retryButton}>
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.questionPicker}>
      <input
        type="text"
        className={styles.searchInput}
        placeholder={t('searchQuestions')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {filteredQuestions.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
          {searchQuery ? t('noMatchingQuestions') : t('noQuestionsAvailable')}
        </p>
      ) : (
        <div className={styles.questionList}>
          {filteredQuestions.map((question) => {
            const isSelected = selectedQuestions.some(
              (q) => q.statementId === question.statementId
            );

            return (
              <div
                key={question.statementId}
                className={`${styles.questionItem} ${isSelected ? styles.selected : ''}`}
                onClick={() => handleToggleQuestion(question)}
              >
                <input
                  type="checkbox"
                  className={styles.questionCheckbox}
                  checked={isSelected}
                  onChange={() => handleToggleQuestion(question)}
                />
                <span className={styles.questionText}>{question.statement}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
        {selectedQuestions.length} {t('questionsSelected')}
      </div>
    </div>
  );
}
