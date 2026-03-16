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
import { useTypingStatus } from '@/hooks/useTypingStatus';
import { useRefinementPhase } from '@/hooks/useRefinementPhase';
import { useAISynthesis } from '@/hooks/useAISynthesis';
import { logError } from '@/lib/utils/errorHandling';
import Suggestion from './Suggestion';
import SuggestionModal from './SuggestionModal';
import SortControls, { SortType } from './SortControls';
import TypingIndicator from './TypingIndicator';
import PhaseControls from './PhaseControls';
import AISynthesisPanel from './AISynthesisPanel';
import AIImprovePanel from './AIImprovePanel';
import HiddenSuggestions from './HiddenSuggestions';
import Modal from '../shared/Modal';
import styles from './SuggestionThread.module.scss';

interface SuggestionThreadProps {
  paragraphId: string;
  documentId: string;
  originalContent: string;
  onClose: () => void;
  /** When true, hide display names in suggestions */
  hideUserIdentity?: boolean;
  /** Heading number of the paragraph (e.g., "1.2.3") for suggestion numbering */
  headingNumber?: string;
  /** Whether the current user is an admin */
  isAdmin?: boolean;
  /** Whether refinement feature is enabled for this document */
  enableRefinement?: boolean;
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
  hideUserIdentity = false,
  headingNumber,
  isAdmin = false,
  enableRefinement = false,
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
  const [improvingSuggestionId, setImprovingSuggestionId] = useState<string | null>(null);

  // Refinement phase state
  const { refinement } = useRefinementPhase(paragraphId, enableRefinement);
  const {
    isLoading: isAILoading,
    synthesisResult,
    improveResult,
    synthesize,
    improve,
    setPhase,
    reset: resetAI,
  } = useAISynthesis();

  const isRefinementPhase = enableRefinement && refinement.phase === 'refinement';
  const consensusThreshold = refinement.consensusThreshold ?? 0.2;

  // Real-time suggestions from Firestore (updates instantly when anyone votes or creates suggestions)
  const { suggestions: suggestionStatements, isLoading: isSuggestionsLoading } = useParagraphSuggestions(paragraphId);

  // Real-time typing status
  const { typingUsers } = useTypingStatus({
    paragraphId,
    currentUserId: user?.uid || null,
    enabled: true,
  });

  // Fetch the official paragraph Statement (the current version)
  const [officialParagraph, setOfficialParagraph] = useState<Statement | null>(null);

  useEffect(() => {
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
        logError(error, {
          operation: 'SuggestionThread.onSnapshot',
          metadata: { paragraphId },
        });
      }
    );

    return () => unsubscribe();
  }, [paragraphId]);

  // Convert Statement[] to legacy Suggestion[] format for compatibility
  const suggestions: SuggestionType[] = useMemo(() => {
    const converted = suggestionStatements.map((statement: Statement) => {
      // Check for AI-generated marker on the statement
      const stmtDoc = statement.doc as Record<string, unknown> | undefined;
      const isAI = !!(stmtDoc?.isAIGenerated);
      const isLate = !!(stmtDoc?.isLateAddition);

      return {
        suggestionId: statement.statementId,
        paragraphId: paragraphId,
        documentId: documentId,
        topParentId: statement.topParentId || documentId,
        originalContent: originalContent,
        suggestedContent: statement.statement,
        reasoning: statement.reasoning || '',
        creatorId: statement.creatorId,
        creatorDisplayName: statement.creator?.displayName || 'Anonymous',
        createdAt: statement.createdAt,
        lastUpdate: statement.lastUpdate || statement.createdAt,
        consensus: statement.consensus || 0,
        hide: statement.hide || false,
        positiveEvaluations: statement.evaluation?.numberOfProEvaluators || 0,
        negativeEvaluations: statement.evaluation?.numberOfConEvaluators || 0,
        // AI + late addition fields
        isAIGenerated: isAI,
        isLateAddition: isLate,
      };
    });

    // Update frozen suggestions when new items arrive (but don't reorder)
    if (isFrozen) {
      const existingIds = new Set(frozenSuggestions.map(s => s.suggestionId));
      const newItems = converted.filter(s => !existingIds.has(s.suggestionId));
      if (newItems.length > 0) {
        setFrozenSuggestions(prev => [...newItems, ...prev]);
      }
      return frozenSuggestions;
    }

    return converted;
  }, [suggestionStatements, paragraphId, documentId, originalContent, isFrozen, frozenSuggestions]);

  // Phase-aware filtering: split visible vs hidden suggestions
  const { visibleSuggestions, hiddenSuggestions } = useMemo(() => {
    if (!isRefinementPhase) {
      return { visibleSuggestions: suggestions, hiddenSuggestions: [] };
    }

    const visible: SuggestionType[] = [];
    const hidden: SuggestionType[] = [];

    for (const s of suggestions) {
      // AI suggestions and late additions are always visible
      if (s.isAIGenerated || s.isLateAddition || s.consensus >= consensusThreshold) {
        visible.push(s);
      } else {
        hidden.push(s);
      }
    }

    // Sort: AI suggestions first, then by consensus, late additions at bottom
    visible.sort((a, b) => {
      if (a.isAIGenerated && !b.isAIGenerated) return -1;
      if (!a.isAIGenerated && b.isAIGenerated) return 1;
      if (a.isLateAddition && !b.isLateAddition) return 1;
      if (!a.isLateAddition && b.isLateAddition) return -1;
      return (b.consensus || 0) - (a.consensus || 0);
    });

    return { visibleSuggestions: visible, hiddenSuggestions: hidden };
  }, [suggestions, isRefinementPhase, consensusThreshold]);

  // Sort suggestions based on selected sort type (only for non-refinement phase)
  const sortedSuggestions = useMemo(() => {
    if (isRefinementPhase) {
      return visibleSuggestions; // Already sorted by phase logic
    }

    const sorted = [...visibleSuggestions];

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
  }, [visibleSuggestions, sortType, randomSeed, isRefinementPhase]);

  // Generate flip key from sorted order
  const flipKey = useMemo(
    () => sortedSuggestions.map((s) => s.suggestionId).join(','),
    [sortedSuggestions]
  );

  const isLoading = isSuggestionsLoading;

  // Convert the official paragraph Statement to a Suggestion for display
  const currentParagraphSuggestion = useMemo((): SuggestionType => {
    if (!officialParagraph) {
      return {
        suggestionId: paragraphId,
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
        consensus: 1.0,
        hide: false,
        positiveEvaluations: undefined,
        negativeEvaluations: undefined,
      };
    }

    return {
      suggestionId: officialParagraph.statementId,
      paragraphId: paragraphId,
      documentId: documentId,
      topParentId: officialParagraph.topParentId || documentId,
      originalContent: originalContent,
      suggestedContent: officialParagraph.statement,
      reasoning: officialParagraph.reasoning || '',
      creatorId: officialParagraph.creatorId,
      creatorDisplayName: officialParagraph.creator?.displayName || t('Official'),
      createdAt: officialParagraph.createdAt,
      lastUpdate: officialParagraph.lastUpdate || officialParagraph.createdAt,
      consensus: officialParagraph.consensus || 1.0,
      hide: officialParagraph.hide || false,
      positiveEvaluations: officialParagraph.evaluation?.numberOfProEvaluators || 0,
      negativeEvaluations: officialParagraph.evaluation?.numberOfConEvaluators || 0,
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
    if (isFrozen) {
      setIsFrozen(false);
    }
  }, [isFrozen]);

  // Handle freeze/unfreeze
  const handleToggleFreeze = useCallback(() => {
    if (!isFrozen) {
      setFrozenSuggestions(sortedSuggestions);
    }
    setIsFrozen(!isFrozen);
  }, [isFrozen, sortedSuggestions]);

  // Handle delete
  const handleDelete = async (suggestionId: string) => {
    try {
      const response = await fetch(API_ROUTES.SUGGESTIONS(paragraphId), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId }),
      });

      if (response.ok) {
        decrementSuggestionCount(paragraphId);
      }
    } catch (err) {
      logError(err, {
        operation: 'SuggestionThread.handleDelete',
        userId: user?.uid || undefined,
        metadata: { paragraphId, suggestionId },
      });
    }
  };

  // Handle edit
  const handleEdit = (suggestion: SuggestionType) => {
    setEditingSuggestion(suggestion);
    setShowAddModal(true);
  };

  // Handle accept suggestion (admin replaces paragraph content)
  const handleAccept = useCallback(async (suggestion: SuggestionType) => {
    if (!window.confirm(t('Are you sure you want to replace the paragraph with this suggestion?'))) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/paragraphs/${paragraphId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          content: suggestion.suggestedContent,
          type: 'paragraph',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept suggestion');
      }

      // Real-time listener will update the paragraph content automatically
    } catch (err) {
      logError(err, {
        operation: 'SuggestionThread.handleAccept',
        userId: user?.uid || undefined,
        metadata: { paragraphId, suggestionId: suggestion.suggestionId },
      });
    }
  }, [paragraphId, documentId, user, t]);

  // Handle add/edit success
  const handleModalSuccess = () => {
    setShowAddModal(false);
    setEditingSuggestion(null);
  };

  // Handle "Improve with AI" for a specific suggestion
  const handleImproveWithAI = useCallback(async (suggestionId: string) => {
    setImprovingSuggestionId(suggestionId);

    // Find the suggestion
    const suggestion = suggestions.find(s => s.suggestionId === suggestionId);
    if (!suggestion) return;

    // We need to fetch comments for this suggestion - they're loaded when CommentThread renders
    // For now, call the API which will fetch them server-side
    try {
      const commentsResponse = await fetch(`/api/comments/${suggestionId}`);
      if (!commentsResponse.ok) return;

      const commentsData = await commentsResponse.json();
      const comments = (commentsData.comments || []).map((c: { statementId: string; statement: string; consensus?: number; creator?: { displayName?: string } }) => ({
        commentId: c.statementId,
        content: c.statement,
        consensus: c.consensus || 0,
        creatorDisplayName: c.creator?.displayName || 'Anonymous',
      }));

      if (comments.length === 0) return;

      await improve(paragraphId, suggestionId, suggestion.suggestedContent, comments, originalContent);
    } catch (error) {
      logError(error, {
        operation: 'SuggestionThread.handleImproveWithAI',
        metadata: { paragraphId, suggestionId },
      });
    }
  }, [suggestions, paragraphId, originalContent, improve]);

  return (
    <div className={styles.container}>
      {/* Phase Controls - admin only when refinement is enabled */}
      {isAdmin && enableRefinement && (
        <PhaseControls
          paragraphId={paragraphId}
          refinement={refinement}
          suggestions={suggestions}
          originalContent={originalContent}
          onSynthesize={synthesize}
          onSetPhase={setPhase}
          isLoading={isAILoading}
        />
      )}

      {/* AI Synthesis Result Panel */}
      {synthesisResult && (
        <AISynthesisPanel
          synthesisResult={synthesisResult}
          paragraphId={paragraphId}
          documentId={documentId}
          originalContent={originalContent}
          onPublished={() => resetAI()}
          onDismiss={() => resetAI()}
        />
      )}

      {/* Sort Controls with Stop/Resume Button */}
      <div className={styles.controls}>
        <SortControls
          activeSort={sortType}
          onSortChange={handleSortChange}
          disabled={suggestions.length <= 1 || isFrozen || isRefinementPhase}
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
          documentId={documentId}
          onDelete={handleDelete}
          onEdit={handleEdit}
          isCurrent={true}
          hideUserIdentity={hideUserIdentity}
          suggestionNumber={headingNumber ? `#${headingNumber}` : undefined}
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
          sortedSuggestions.map((suggestion, index) => (
            <Flipped key={suggestion.suggestionId} flipId={suggestion.suggestionId}>
              <div>
                <Suggestion
                  suggestion={suggestion}
                  userId={user?.uid || null}
                  userDisplayName={user?.displayName || null}
                  paragraphId={paragraphId}
                  documentId={documentId}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  isCurrent={false}
                  hideUserIdentity={hideUserIdentity}
                  suggestionNumber={headingNumber ? `#${headingNumber}-${index + 1}` : undefined}
                  isAIGenerated={!!suggestion.isAIGenerated}
                  aiSourceCount={suggestion.aiSourceSuggestionIds?.length}
                  isLateAddition={!!suggestion.isLateAddition}
                  onImproveWithAI={handleImproveWithAI}
                  showImproveButton={
                    isRefinementPhase &&
                    (isAdmin || (!!user && suggestion.creatorId === user.uid))
                  }
                  showAcceptButton={isAdmin}
                  onAccept={handleAccept}
                />
                {/* AI Improve Panel inline below the suggestion being improved */}
                {improvingSuggestionId === suggestion.suggestionId && improveResult && (
                  <AIImprovePanel
                    improveResult={improveResult}
                    suggestionId={suggestion.suggestionId}
                    paragraphId={paragraphId}
                    onSaved={() => {
                      setImprovingSuggestionId(null);
                      resetAI();
                    }}
                    onDismiss={() => {
                      setImprovingSuggestionId(null);
                      resetAI();
                    }}
                  />
                )}
              </div>
            </Flipped>
          ))
        )}
      </Flipper>

      {/* Hidden suggestions section - admin only during refinement */}
      {isRefinementPhase && isAdmin && hiddenSuggestions.length > 0 && (
        <HiddenSuggestions
          suggestions={hiddenSuggestions}
          userId={user?.uid || null}
          userDisplayName={user?.displayName || null}
          paragraphId={paragraphId}
          documentId={documentId}
          onDelete={handleDelete}
          onEdit={handleEdit}
          hideUserIdentity={hideUserIdentity}
        />
      )}

      {/* Typing indicator - shows when others are writing */}
      {typingUsers.length > 0 && (
        <TypingIndicator typingUsers={typingUsers} currentUserId={user?.uid || null} hideUserIdentity={hideUserIdentity} />
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
          {isRefinementPhase ? t('Add Late Suggestion') : t('Add Your Suggestion')}
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
            userId={user?.uid || null}
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
