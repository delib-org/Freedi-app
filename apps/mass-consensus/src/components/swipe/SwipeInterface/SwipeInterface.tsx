'use client';

/**
 * SwipeInterface - Main swipe interaction component
 *
 * Integrates all swipe components into a cohesive interface.
 * Uses button-only interaction for precise 5-level agreement ratings.
 *
 * Rating Scale: -1 (Strongly Disagree) to +1 (Strongly Agree)
 * - Negative ratings throw cards left
 * - Neutral and positive ratings throw cards right
 */

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import SwipeCard from '../SwipeCard';
import RatingButton from '../RatingButton';
import SurveyProgress from '../SurveyProgress';
import CommentModal from '../CommentModal';
import SolutionPromptModal from '@/components/question/SolutionPromptModal';
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';
import {
  setCardStack,
  cardEvaluated,
  proposalSubmitted,
  dismissProposalPrompt,
  setError,
} from '@/store/slices/swipeSlice';
import {
  selectCurrentCard,
  selectEvaluatedCardsCount,
  selectTotalCardsCount,
  selectShowProposalPrompt,
} from '@/store/slices/swipeSelectors';
import { submitRating } from '@/controllers/swipeController';
import { submitComment } from '@/controllers/commentController';
import { RATING, RATING_CONFIG } from '@/constants/common';
import type { RatingValue } from '../RatingButton';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useToast } from '@/components/shared/Toast';
import {
  trackProposalPromptShown,
  trackProposalPromptDismissed,
} from '@/lib/analytics';

export interface SwipeInterfaceProps {
  question: Statement;
  initialSolutions: Statement[];
  userId: string;
  userName: string;
  mergedSettings?: MergedQuestionSettings;
  onComplete?: () => void;
}

const SwipeInterface: React.FC<SwipeInterfaceProps> = ({
  question,
  initialSolutions,
  userId,
  userName,
  mergedSettings,
  onComplete,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const currentCard = useSelector(selectCurrentCard);
  const evaluatedCount = useSelector(selectEvaluatedCardsCount);
  const totalCount = useSelector(selectTotalCardsCount);
  const showProposalPrompt = useSelector(selectShowProposalPrompt);

  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [programmaticThrow, setProgrammaticThrow] = useState<{
    rating: RatingValue;
    direction: 'left' | 'right';
  } | null>(null);

  // Check if user must add solution first
  const requiresSolution = mergedSettings?.askUserForASolutionBeforeEvaluation ?? true;
  const [hasCheckedUserSolutions, setHasCheckedUserSolutions] = useState(false);
  const [, setHasSubmittedSolution] = useState(false);
  const [showSolutionPrompt, setShowSolutionPrompt] = useState(false);

  console.info('[SwipeInterface Debug] Settings check:', {
    mergedSettings: mergedSettings?.askUserForASolutionBeforeEvaluation,
    finalRequiresSolution: requiresSolution
  });

  // Check if user has submitted solutions (for "add solution first" feature)
  useEffect(() => {
    if (!userId || hasCheckedUserSolutions) return;

    const checkUserSolutions = async () => {
      try {
        console.info('[SwipeInterface Debug] Checking user solutions for questionId:', question.statementId);
        const response = await fetch(`/api/user-solutions/${question.statementId}?userId=${userId}`);
        if (response.ok) {
          const data = await response.json();
          console.info('[SwipeInterface Debug] API response:', data);
          setHasSubmittedSolution(data.hasSubmitted);

          const shouldShowModal = !data.hasSubmitted && requiresSolution;
          console.info('[SwipeInterface Debug] Should show modal?', shouldShowModal, '(hasSubmitted:', data.hasSubmitted, 'requiresSolution:', requiresSolution, ')');
          if (shouldShowModal) {
            setShowSolutionPrompt(true);
          }
        }
        setHasCheckedUserSolutions(true);
      } catch (error) {
        console.error('Failed to check user solutions:', error);
        setHasCheckedUserSolutions(true);
      }
    };

    checkUserSolutions();
  }, [userId, question.statementId, requiresSolution, hasCheckedUserSolutions]);

  // Listen for footer "add suggestion" button event
  useEffect(() => {
    const handleTriggerAdd = () => {
      setShowProposalModal(true);
    };

    window.addEventListener('trigger-add-suggestion', handleTriggerAdd);
    return () => {
      window.removeEventListener('trigger-add-suggestion', handleTriggerAdd);
    };
  }, []);

  // Initialize cards on mount
  useEffect(() => {
    dispatch(setCardStack(initialSolutions));

    // Dispatch event to notify wrapper of available solutions count
    window.dispatchEvent(
      new CustomEvent('solutions-loaded', {
        detail: {
          count: initialSolutions.length,
          questionId: question.statementId,
        },
      })
    );
  }, [initialSolutions, dispatch, question.statementId]);

  // Handle showing proposal prompt
  useEffect(() => {
    if (showProposalPrompt) {
      setShowProposalModal(true);
      // Track that prompt was shown
      trackProposalPromptShown(question.statementId, userId, evaluatedCount);
    }
  }, [showProposalPrompt, question.statementId, userId, evaluatedCount]);

  // Handle completion
  useEffect(() => {
    if (totalCount > 0 && evaluatedCount >= totalCount && onComplete) {
      onComplete();
    }
  }, [evaluatedCount, totalCount, onComplete]);

  const handleSwipe = async (rating: RatingValue) => {
    if (!currentCard) return;

    // Get throw direction from rating config
    const config = RATING_CONFIG[rating];
    const rawDirection = config?.direction || 'right';
    const direction: 'left' | 'right' = rawDirection === 'up' ? 'right' : rawDirection;

    // Trigger throw animation
    setProgrammaticThrow({ rating, direction });

    // Wait for animation to complete, then submit
    setTimeout(async () => {
      try {
        // Save rating to Firebase
        await submitRating(question.statementId, currentCard.statementId, rating, userId);

        // Update Redux state
        dispatch(
          cardEvaluated({ statementId: currentCard.statementId, rating })
        );

        // Dispatch custom event for SurveyQuestionWrapper to track progress
        window.dispatchEvent(
          new CustomEvent('solution-evaluated', {
            detail: { questionId: question.statementId },
          })
        );

        // Reset programmaticThrow for next card
        setProgrammaticThrow(null);
      } catch (err) {
        console.error('Failed to submit rating:', err);
        dispatch(setError(t('Failed to submit rating. Please try again.')));
        setProgrammaticThrow(null);
      }
    }, 300); // Wait for animation to complete
  };

  const handleProposalSuccess = () => {
    dispatch(proposalSubmitted());
    setShowProposalModal(false);

    showToast({
      type: 'success',
      title: t('Proposal Submitted!'),
      message: t('Thank you for sharing your idea with the community.'),
      duration: 5000,
    });
  };

  const handleProposalDismiss = () => {
    setShowProposalModal(false);
    dispatch(dismissProposalPrompt());

    // Track that prompt was dismissed
    trackProposalPromptDismissed(question.statementId, userId);
  };

  const handleOpenComment = () => {
    setShowCommentModal(true);
  };

  const handleCommentSubmit = async (originalText: string, rewrittenText: string) => {
    if (!currentCard) return;

    try {
      const reasoning = rewrittenText !== originalText ? rewrittenText : undefined;
      await submitComment({
        commentText: rewrittenText,
        suggestionStatement: currentCard,
        userId,
        userName,
        reasoning,
      });

      showToast({
        type: 'success',
        title: t('Comment submitted'),
        message: t('Thank you for your feedback!'),
        duration: 4000,
      });

      setShowCommentModal(false);
    } catch {
      showToast({
        type: 'error',
        title: t('Submission Failed'),
        message: t('Failed to submit comment. Please try again.'),
        duration: 5000,
      });
      throw new Error('Comment submission failed');
    }
  };

  return (
    <div className="swipe-interface">
      {/* Progress indicator */}
      <div className="swipe-interface__progress">
        <SurveyProgress current={evaluatedCount} total={totalCount} />
      </div>

      {/* Current card or completion message */}
      {currentCard ? (
        <>
          <div className="swipe-interface__card">
            <SwipeCard
              statement={currentCard}
              onSwipe={handleSwipe}
              totalCards={totalCount}
              currentIndex={evaluatedCount}
              programmaticThrow={programmaticThrow}
              onCommentClick={handleOpenComment}
            />
          </div>

          {/* Rating buttons - universal layout (negative to positive, left to right)
              - Left side = negative (strongly disagree, red)
              - Right side = positive (strongly agree, green)
              Matches the zone strip colors on the card
          */}
          <div className="swipe-interface__rating-buttons">
            <RatingButton
              rating={RATING.STRONGLY_DISAGREE}
              onClick={handleSwipe}
            />
            <RatingButton rating={RATING.DISAGREE} onClick={handleSwipe} />
            <RatingButton rating={RATING.NEUTRAL} onClick={handleSwipe} />
            <RatingButton rating={RATING.AGREE} onClick={handleSwipe} />
            <RatingButton rating={RATING.STRONGLY_AGREE} onClick={handleSwipe} />
          </div>
        </>
      ) : (
        <div className="swipe-interface__completion">
          <div className="swipe-interface__completion-emoji">🎉</div>
          <h2 className="swipe-interface__completion-title">{t('All done!')}</h2>
          <p className="swipe-interface__completion-message">
            {t("You've evaluated all proposals.")}
          </p>
          <button
            className="swipe-interface__completion-button"
            onClick={() => setShowProposalModal(true)}
          >
            {t('Submit Your Own Idea')}
          </button>
        </div>
      )}

      {/* Proposal Modal - uses SolutionPromptModal for full AI check + similarity search */}
      <SolutionPromptModal
        isOpen={showProposalModal}
        onClose={handleProposalDismiss}
        onSubmitSuccess={handleProposalSuccess}
        questionId={question.statementId}
        questionText={question.statement}
        userId={userId}
        userName={userName}
      />

      {/* Comment Modal */}
      {currentCard && (
        <CommentModal
          isOpen={showCommentModal}
          onClose={() => setShowCommentModal(false)}
          suggestionText={currentCard.statement}
          questionText={question.statement}
          onSubmit={handleCommentSubmit}
        />
      )}

      {/* Solution Prompt Modal - "Add solution first" feature */}
      <SolutionPromptModal
        isOpen={showSolutionPrompt}
        onClose={() => setShowSolutionPrompt(false)}
        onSubmitSuccess={() => {
          setShowSolutionPrompt(false);
          setHasSubmittedSolution(true);
        }}
        questionId={question.statementId}
        questionText={question.statement}
        userId={userId}
        userName={userName}
        requiresSolution={requiresSolution}
        hasCheckedUserSolutions={hasCheckedUserSolutions}
      />
    </div>
  );
};

export default SwipeInterface;
