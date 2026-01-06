'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Suggestion as SuggestionType } from '@freedi/shared-types';
import { useUIStore } from '@/store/uiStore';
import { API_ROUTES, SUGGESTIONS } from '@/constants/common';
import Suggestion from './Suggestion';
import SuggestionModal from './SuggestionModal';
import Modal from '../shared/Modal';
import styles from './SuggestionThread.module.scss';

interface SuggestionThreadProps {
  paragraphId: string;
  documentId: string;
  originalContent: string;
  userId: string | null;
  onClose: () => void;
}

export default function SuggestionThread({
  paragraphId,
  documentId,
  originalContent,
  userId,
  onClose: _onClose,
}: SuggestionThreadProps) {
  const { t } = useTranslation();
  const { decrementSuggestionCount } = useUIStore();

  const [suggestions, setSuggestions] = useState<SuggestionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState<SuggestionType | null>(null);

  // Check if user already has a suggestion
  const userSuggestion = useMemo(() => {
    if (!userId) return null;

    return suggestions.find((s) => s.creatorId === userId) || null;
  }, [suggestions, userId]);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    try {
      const response = await fetch(API_ROUTES.SUGGESTIONS(paragraphId));
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [paragraphId]);

  // Initial fetch and polling for real-time updates
  useEffect(() => {
    fetchSuggestions();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchSuggestions, SUGGESTIONS.REALTIME_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchSuggestions]);

  // Handle delete
  const handleDelete = async (suggestionId: string) => {
    try {
      const response = await fetch(API_ROUTES.SUGGESTIONS(paragraphId), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ suggestionId }),
      });

      if (response.ok) {
        setSuggestions((prev) => prev.filter((s) => s.suggestionId !== suggestionId));
        decrementSuggestionCount(paragraphId);
      }
    } catch (err) {
      console.error('Error deleting suggestion:', err);
    }
  };

  // Handle edit
  const handleEdit = (suggestion: SuggestionType) => {
    setEditingSuggestion(suggestion);
    setShowAddModal(true);
  };

  // Handle add/edit success
  const handleModalSuccess = () => {
    fetchSuggestions();
    setShowAddModal(false);
    setEditingSuggestion(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.list}>
        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        ) : suggestions.length === 0 ? (
          <p className={styles.empty}>{t('No suggestions yet')}</p>
        ) : (
          suggestions.map((suggestion) => (
            <Suggestion
              key={suggestion.suggestionId}
              suggestion={suggestion}
              userId={userId}
              paragraphId={paragraphId}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ))
        )}
      </div>

      {/* Add suggestion button or notice */}
      {userSuggestion ? (
        <div className={styles.hasNotice}>
          <p>{t('You have already suggested an alternative. You can edit your suggestion above.')}</p>
        </div>
      ) : (
        <button
          type="button"
          className={styles.addButton}
          onClick={() => setShowAddModal(true)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('Add Your Suggestion')}
        </button>
      )}

      {/* Suggestion modal */}
      {showAddModal && (
        <Modal
          title={editingSuggestion ? t('Edit Suggestion') : t('Suggest Alternative')}
          onClose={() => {
            setShowAddModal(false);
            setEditingSuggestion(null);
          }}
          size="large"
        >
          <SuggestionModal
            paragraphId={paragraphId}
            documentId={documentId}
            originalContent={originalContent}
            existingSuggestion={editingSuggestion}
            onClose={() => {
              setShowAddModal(false);
              setEditingSuggestion(null);
            }}
            onSuccess={handleModalSuccess}
          />
        </Modal>
      )}
    </div>
  );
}
