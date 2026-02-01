'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Suggestion as SuggestionType } from '@freedi/shared-types';
import { useUIStore } from '@/store/uiStore';
import { API_ROUTES } from '@/constants/common';
import { useRealtimeSuggestions } from '@/hooks/useRealtimeSuggestions';
import { useTypingStatus } from '@/hooks/useTypingStatus';
import { logError } from '@/lib/utils/errorHandling';
import Suggestion from './Suggestion';
import SuggestionModal from './SuggestionModal';
import TypingIndicator from './TypingIndicator';
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

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState<SuggestionType | null>(null);

  // Real-time suggestions listener (replaces polling)
  const { suggestions, isLoading } = useRealtimeSuggestions({
    paragraphId,
    enabled: true,
  });

  // Log when suggestions change
  console.info('[SuggestionThread] Render - suggestions:', suggestions.length, 'isLoading:', isLoading);
  if (suggestions.length > 0) {
    console.info('[SuggestionThread] Suggestions list:', suggestions.map(s => ({
      id: s.suggestionId,
      creator: s.creatorDisplayName,
    })));
  }

  // Real-time typing status
  const { typingUsers } = useTypingStatus({
    paragraphId,
    currentUserId: userId,
    enabled: true,
  });

  // Check if user already has a suggestion
  const userSuggestion = useMemo(() => {
    if (!userId) return null;

    return suggestions.find((s) => s.creatorId === userId) || null;
  }, [suggestions, userId]);

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
        decrementSuggestionCount(paragraphId);
        // Note: Real-time listener will automatically remove the suggestion from the list
      }
    } catch (err) {
      logError(err, {
        operation: 'SuggestionThread.handleDelete',
        userId: userId || undefined,
        metadata: { paragraphId, suggestionId },
      });
    }
  };

  // Handle edit
  const handleEdit = (suggestion: SuggestionType) => {
    setEditingSuggestion(suggestion);
    setShowAddModal(true);
  };

  // Handle add/edit success
  const handleModalSuccess = () => {
    // Real-time listener will automatically update the list
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

      {/* Typing indicator - shows when others are writing */}
      {typingUsers.length > 0 && (
        <TypingIndicator typingUsers={typingUsers} currentUserId={userId} />
      )}

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
            userId={userId}
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
