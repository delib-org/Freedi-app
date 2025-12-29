'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useAuth } from '@/components/auth/AuthProvider';
import styles from './Admin.module.scss';

interface QuestionPickerProps {
  selectedQuestions: Statement[];
  onQuestionsChange: (questions: Statement[]) => void;
}

interface QuestionsResponse {
  questions: Statement[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Component for selecting questions to add to a survey
 * Features server-side search and pagination for large datasets
 */
export default function QuestionPicker({
  selectedQuestions,
  onQuestionsChange,
}: QuestionPickerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refreshToken } = useAuth();
  const [questions, setQuestions] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // Track current search to avoid race conditions
  const currentSearchRef = useRef<string>('');

  const fetchQuestions = useCallback(async (
    search: string = '',
    cursor?: string,
    append: boolean = false
  ) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setQuestions([]);
      }
      setError(null);

      // Get fresh token (refreshes if expired)
      const token = await refreshToken();

      if (!token) {
        // Redirect to login if no valid token
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      // Build query params
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '20');

      const response = await fetch(`/api/questions?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('failedToFetchQuestions') || 'Failed to fetch questions');
      }

      const data: QuestionsResponse = await response.json();

      // Only update if this is still the current search
      if (search === currentSearchRef.current || (!search && !currentSearchRef.current)) {
        if (append) {
          setQuestions((prev) => [...prev, ...data.questions]);
        } else {
          setQuestions(data.questions);
        }
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      }
    } catch (err) {
      console.error('[QuestionPicker] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load questions');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t, refreshToken, router]);

  // Initial load
  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    currentSearchRef.current = value;

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce search by 300ms
    debounceRef.current = setTimeout(() => {
      fetchQuestions(value);
    }, 300);
  };

  // Load more handler
  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchQuestions(searchQuery, nextCursor, true);
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

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (error && questions.length === 0) {
    return (
      <div className={styles.questionPicker}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={() => fetchQuestions()} className={styles.retryButton}>
            {t('retry') || 'Retry'}
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
        placeholder={t('searchQuestions') || 'Search questions...'}
        value={searchQuery}
        onChange={(e) => handleSearchChange(e.target.value)}
      />

      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>{t('searchingQuestions') || 'Searching questions...'}</p>
        </div>
      ) : questions.length === 0 && selectedQuestions.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
          {searchQuery
            ? (t('noMatchingQuestions') || 'No matching questions found')
            : (t('noQuestionsAvailable') || 'No questions available')}
        </p>
      ) : (
        <>
          <div className={styles.questionList}>
            {/* First show selected questions that aren't in the fetched list */}
            {selectedQuestions
              .filter((sq) => !questions.some((q) => q.statementId === sq.statementId))
              .map((question) => (
                <div
                  key={question.statementId}
                  className={`${styles.questionItem} ${styles.selected}`}
                  onClick={() => handleToggleQuestion(question)}
                >
                  <input
                    type="checkbox"
                    className={styles.questionCheckbox}
                    checked={true}
                    onChange={() => handleToggleQuestion(question)}
                  />
                  <span className={styles.questionText}>{question.statement}</span>
                </div>
              ))}
            {/* Then show fetched questions */}
            {questions.map((question) => {
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

          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className={styles.loadMoreButton}
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1.5rem',
                background: loadingMore ? 'var(--bg-muted)' : 'var(--btn-secondary)',
                color: 'var(--text-body)',
                border: 'none',
                borderRadius: '8px',
                cursor: loadingMore ? 'not-allowed' : 'pointer',
                width: '100%',
                fontWeight: 500,
              }}
            >
              {loadingMore
                ? (t('loading') || 'Loading...')
                : (t('loadMore') || 'Load More')}
            </button>
          )}
        </>
      )}

      <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
        {selectedQuestions.length} {t('questionsSelected') || 'questions selected'}
        {questions.length > 0 && ` • ${questions.length} ${t('shown') || 'shown'}`}
      </div>
    </div>
  );
}
