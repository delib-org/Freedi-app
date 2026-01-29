'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Suggestion as SuggestionType, Statement, Collections } from '@freedi/shared-types';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { useUIStore } from '@/store/uiStore';
import { API_ROUTES } from '@/constants/common';
import { useParagraphSuggestions } from '@/hooks/useParagraphSuggestions';
import { useAutoLogin } from '@/hooks/useAutoLogin';
import Suggestion from './Suggestion';
import SuggestionModal from './SuggestionModal';
import SortControls, { SortType } from './SortControls';
import Modal from '../shared/Modal';
import styles from './SuggestionThread.module.scss';

interface SuggestionThreadProps {
  paragraphId: string;
  documentId: string;
  originalContent: string;
  onClose: () => void;
}

// Seeded random for consistent random order during session
function seededRandom(seed: number): () => number {
  return function () {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
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
  const [sortType, setSortType] = useState<SortType>('newest'); // Default to newest
  const [randomSeed] = useState(() => Date.now());
  const [isFrozen, setIsFrozen] = useState(false); // Stop real-time reordering
  const [frozenSuggestions, setFrozenSuggestions] = useState<SuggestionType[]>([]);

  // Real-time suggestions from Firestore (updates instantly when anyone votes or creates suggestions)
  const suggestionStatements = useParagraphSuggestions(paragraphId);

  // Fetch the official paragraph Statement (the current version)
  const [officialParagraph, setOfficialParagraph] = useState<Statement | null>(null);

  useEffect(() => {
    // Real-time listener for the official paragraph Statement
    // Updates instantly when consensus changes from voting
    const firestore = getFirebaseFirestore();
    const statementRef = doc(firestore, Collections.statements, paragraphId);

    const unsubscribe = onSnapshot(
      statementRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setOfficialParagraph(docSnap.data() as Statement);
        }
      },
      (error) => {
        console.error('[SuggestionThread] Error listening to official paragraph:', error);
      }
    );

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, [paragraphId]);

  // Convert Statement[] to legacy Suggestion[] format for compatibility
  const suggestions: SuggestionType[] = useMemo(() => {
    const converted = suggestionStatements.map((statement: Statement) => ({
      suggestionId: statement.statementId,
      paragraphId: paragraphId,
      documentId: documentId,
      topParentId: statement.topParentId || documentId,
      originalContent: originalContent,
      suggestedContent: statement.statement,
      reasoning: '',
      creatorId: statement.creatorId,
      creatorDisplayName: statement.creator?.displayName || 'Anonymous',
      createdAt: statement.createdAt,
      lastUpdate: statement.lastUpdate || statement.createdAt,
      consensus: statement.consensus || 0,
      hide: statement.hide || false,
      // Include evaluation counts for vote breakdown display
      positiveEvaluations: (statement as Statement & { positiveEvaluations?: number }).positiveEvaluations,
      negativeEvaluations: (statement as Statement & { negativeEvaluations?: number }).negativeEvaluations,
    }));

    // Update frozen suggestions when new items arrive (but don't reorder)
    if (isFrozen) {
      const existingIds = new Set(frozenSuggestions.map(s => s.suggestionId));
      const newItems = converted.filter(s => !existingIds.has(s.suggestionId));
      if (newItems.length > 0) {
        setFrozenSuggestions(prev => [...newItems, ...prev]); // Add new items at top
      }
      return frozenSuggestions;
    }

    return converted;
  }, [suggestionStatements, paragraphId, documentId, originalContent, isFrozen, frozenSuggestions]);

  // Sort suggestions based on selected sort type
  const sortedSuggestions = useMemo(() => {
    const sorted = [...suggestions];

    switch (sortType) {
      case 'consensus':
        return sorted.sort((a, b) => (b.consensus || 0) - (a.consensus || 0));

      case 'newest':
        return sorted.sort((a, b) => b.createdAt - a.createdAt);

      case 'random': {
        const random = seededRandom(randomSeed);
        return sorted.sort(() => random() - 0.5);
      }

      default:
        return sorted;
    }
  }, [suggestions, sortType, randomSeed]);

  // Generate flip key from sorted order
  const flipKey = useMemo(
    () => sortedSuggestions.map((s) => s.suggestionId).join(','),
    [sortedSuggestions]
  );

  const isLoading = false; // Real-time hook handles loading internally

  // Convert the official paragraph Statement to a Suggestion for display
  // This allows users to vote on the current version alongside alternatives
  const currentParagraphSuggestion = useMemo((): SuggestionType => {
    if (!officialParagraph) {
      // Fallback: create pseudo-suggestion if official paragraph not loaded yet
      return {
        suggestionId: paragraphId, // Use actual paragraphId (which is the statementId)
        paragraphId: paragraphId,
        documentId: documentId,
        topParentId: documentId,
        originalContent: originalContent,
        suggestedContent: originalContent,
        reasoning: '',
        creatorId: 'official',
        creatorDisplayName: t('Official'),
        createdAt: Date.now(),
        lastUpdate: Date.now(),
        consensus: 1.0, // Official paragraphs start with full consensus
        hide: false,
        positiveEvaluations: undefined,
        negativeEvaluations: undefined,
      };
    }

    // Use the actual official paragraph Statement
    return {
      suggestionId: officialParagraph.statementId,
      paragraphId: paragraphId,
      documentId: documentId,
      topParentId: officialParagraph.topParentId || documentId,
      originalContent: originalContent,
      suggestedContent: officialParagraph.statement,
      reasoning: '',
      creatorId: officialParagraph.creatorId,
      creatorDisplayName: officialParagraph.creator?.displayName || t('Official'),
      createdAt: officialParagraph.createdAt,
      lastUpdate: officialParagraph.lastUpdate || officialParagraph.createdAt,
      consensus: officialParagraph.consensus || 1.0,
      hide: officialParagraph.hide || false,
      // Include evaluation counts for vote breakdown display
      positiveEvaluations: (officialParagraph as Statement & { positiveEvaluations?: number }).positiveEvaluations,
      negativeEvaluations: (officialParagraph as Statement & { negativeEvaluations?: number }).negativeEvaluations,
    };
  }, [officialParagraph, paragraphId, documentId, originalContent, t]);

  // Check if user already has a suggestion
  const userSuggestion = useMemo(() => {
    if (!user) return null;
    return suggestions.find((s) => s.creatorId === user.uid) || null;
  }, [suggestions, user]);

  // Handle sort change
  const handleSortChange = useCallback((newSort: SortType) => {
    setSortType(newSort);
    // Unfreezeif changing sort order
    if (isFrozen) {
      setIsFrozen(false);
    }
  }, [isFrozen]);

  // Handle freeze/unfreeze
  const handleToggleFreeze = useCallback(() => {
    if (!isFrozen) {
      // Freeze: Save current sorted order
      setFrozenSuggestions(sortedSuggestions);
    }
    setIsFrozen(!isFrozen);
  }, [isFrozen, sortedSuggestions]);

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
      {/* Sort Controls with Stop/Resume Button */}
      <div className={styles.controls}>
        <SortControls
          activeSort={sortType}
          onSortChange={handleSortChange}
          disabled={suggestions.length <= 1 || isFrozen}
        />
        <button
          type="button"
          className={`${styles.freezeButton} ${isFrozen ? styles.frozen : ''}`}
          onClick={handleToggleFreeze}
          disabled={suggestions.length === 0}
          title={isFrozen ? t('Resume live updates') : t('Stop live updates')}
        >
          {isFrozen ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {t('Resume')}
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              {t('Stop')}
            </>
          )}
        </button>
      </div>

      {/* Current version section */}
      <div className={styles.currentSection}>
        <Suggestion
          suggestion={currentParagraphSuggestion}
          userId={user?.uid || null}
          userDisplayName={user?.displayName || null}
          paragraphId={paragraphId}
          onDelete={handleDelete}
          onEdit={handleEdit}
          isCurrent={true}
        />
      </div>

      {/* Divider between current and alternatives */}
      {sortedSuggestions.length > 0 && (
        <div className={styles.sectionDivider}>
          <span className={styles.dividerLabel}>{t('Suggested Alternatives')}</span>
        </div>
      )}

      {/* Animated Suggestion List */}
      <Flipper
        flipKey={flipKey}
        spring={{ stiffness: 300, damping: 30 }}
        className={styles.list}
      >
        {isLoading ? (
          <div className={styles.loading}>
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        ) : sortedSuggestions.length === 0 ? (
          <p className={styles.empty}>{t('No suggestions yet')}</p>
        ) : (
          sortedSuggestions.map((suggestion) => (
            <Flipped key={suggestion.suggestionId} flipId={suggestion.suggestionId}>
              <div>
                <Suggestion
                  suggestion={suggestion}
                  userId={user?.uid || null}
                  userDisplayName={user?.displayName || null}
                  paragraphId={paragraphId}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  isCurrent={false}
                />
              </div>
            </Flipped>
          ))
        )}
      </Flipper>

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
