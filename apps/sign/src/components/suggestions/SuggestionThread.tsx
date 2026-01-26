'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Suggestion as SuggestionType, Statement } from '@freedi/shared-types';
import { useUIStore } from '@/store/uiStore';
import { API_ROUTES } from '@/constants/common';
import { useParagraphSuggestions } from '@/hooks/useParagraphSuggestions';
import { useAutoLogin } from '@/hooks/useAutoLogin';
import Suggestion from './Suggestion';
import SuggestionModal from './SuggestionModal';
import Modal from '../shared/Modal';
import styles from './SuggestionThread.module.scss';

interface SuggestionThreadProps {
  paragraphId: string;
  documentId: string;
  originalContent: string;
  onClose: () => void;
}

export default function SuggestionThread({
  paragraphId,
  documentId,
  originalContent,
  onClose: _onClose,
}: SuggestionThreadProps) {
  const { t } = useTranslation();
  const { decrementSuggestionCount } = useUIStore();
  const user = useAutoLogin(); // Auto-login anonymously if not logged in

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState<SuggestionType | null>(null);

  // Real-time suggestions from Firestore (updates instantly when anyone votes or creates suggestions)
  const suggestionStatements = useParagraphSuggestions(paragraphId);

  // Convert Statement[] to legacy Suggestion[] format for compatibility
  const suggestions: SuggestionType[] = useMemo(() => {
    return suggestionStatements.map((statement: Statement) => ({
      suggestionId: statement.statementId,
      paragraphId: paragraphId,
      documentId: documentId,
      suggestedContent: statement.statement,
      reasoning: '', // TODO: Add reasoning field to Statement if needed
      creatorId: statement.creatorId,
      creatorName: statement.creator?.displayName || 'Anonymous',
      createdAt: statement.createdAt,
      votes: statement.evaluation || 0,
      consensus: statement.consensus || 0,
    }));
  }, [suggestionStatements, paragraphId, documentId]);

  const isLoading = false; // Real-time hook handles loading internally

  // Check if user already has a suggestion
  const userSuggestion = useMemo(() => {
    if (!user) return null;
    return suggestions.find((s) => s.creatorId === user.uid) || null;
  }, [suggestions, user]);

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
        // Real-time listener will update suggestions automatically
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
    // No need to fetch - real-time listener will update automatically
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
              userId={user?.uid || null}
              userDisplayName={user?.displayName || null}
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
          onClick={() => user ? setShowAddModal(true) : alert(t('Please sign in to suggest alternatives'))}
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
