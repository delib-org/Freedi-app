'use client';

/**
 * SwipeInterface - Main swipe interaction component
 * Integrates all swipe components into a cohesive interface
 */

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import SwipeCard from '../SwipeCard';
import RatingButton from '../RatingButton';
import SurveyProgress from '../SurveyProgress';
import ProposalModal from '../ProposalModal';
import {
  setCardStack,
  cardEvaluated,
  proposalSubmitted,
  dismissProposalPrompt,
  setLoading,
  setError,
} from '@/store/slices/swipeSlice';
import {
  selectCurrentCard,
  selectEvaluatedCardsCount,
  selectTotalCardsCount,
  selectShowProposalPrompt,
  selectIsLoading,
} from '@/store/slices/swipeSelectors';
import { submitRating } from '@/controllers/swipeController';
import { submitProposal } from '@/controllers/proposalController';
import { RATING } from '@/constants/common';
import type { RatingValue } from '../RatingButton';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useToast } from '@/components/shared/Toast';
import {
  trackProposalSubmitted,
  trackProposalPromptShown,
  trackProposalPromptDismissed,
} from '@/lib/analytics';

export interface SwipeInterfaceProps {
  question: Statement;
  initialSolutions: Statement[];
  userId: string;
  userName: string;
  onComplete?: () => void;
}

const SwipeInterface: React.FC<SwipeInterfaceProps> = ({
  question,
  initialSolutions,
  userId,
  userName,
  onComplete,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const currentCard = useSelector(selectCurrentCard);
  const evaluatedCount = useSelector(selectEvaluatedCardsCount);
  const totalCount = useSelector(selectTotalCardsCount);
  const showProposalPrompt = useSelector(selectShowProposalPrompt);
  const isLoading = useSelector(selectIsLoading);

  const [showProposalModal, setShowProposalModal] = useState(false);

  // Initialize cards on mount
  useEffect(() => {
    dispatch(setCardStack(initialSolutions));

    // Dispatch event to notify wrapper of available solutions count
    window.dispatchEvent(new CustomEvent('solutions-loaded', {
      detail: {
        count: initialSolutions.length,
        questionId: question.statementId
      }
    }));
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

    try {
      // Save rating to Firebase
      await submitRating(currentCard.statementId, rating, userId);

      // Update Redux state
      dispatch(cardEvaluated({ statementId: currentCard.statementId, rating }));

      // Dispatch custom event for SurveyQuestionWrapper to track progress
      window.dispatchEvent(new CustomEvent('solution-evaluated', {
        detail: { questionId: question.statementId }
      }));
    } catch (err) {
      console.error('Failed to submit rating:', err);
      dispatch(setError('Failed to submit rating. Please try again.'));
    }
  };

  const handleProposalSubmit = async (proposalText: string) => {
    try {
      // Save proposal to Firebase
      await submitProposal(
        proposalText,
        question.statementId,
        userId,
        userName
      );

      // Track analytics
      trackProposalSubmitted(question.statementId, userId, proposalText.length);

      // Update Redux state
      dispatch(proposalSubmitted());
      setShowProposalModal(false);

      // Show success toast
      showToast({
        type: 'success',
        title: t('Proposal Submitted!'),
        message: t('Thank you for sharing your idea with the community.'),
        duration: 5000,
      });
    } catch (err) {
      console.error('Failed to submit proposal:', err);
      dispatch(setError('Failed to submit proposal. Please try again.'));

      // Show error toast
      showToast({
        type: 'error',
        title: t('Submission Failed'),
        message: t('Failed to submit proposal. Please try again.'),
        duration: 5000,
      });

      throw err; // Re-throw to keep modal open
    }
  };

  const handleProposalDismiss = () => {
    setShowProposalModal(false);
    dispatch(dismissProposalPrompt());

    // Track that prompt was dismissed
    trackProposalPromptDismissed(question.statementId, userId);
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
            />
          </div>

          {/* Rating buttons */}
          <div className="swipe-interface__rating-buttons">
            <RatingButton rating={RATING.HATE} onClick={handleSwipe} />
            <RatingButton rating={RATING.DISLIKE} onClick={handleSwipe} />
            <RatingButton rating={RATING.NEUTRAL} onClick={handleSwipe} />
            <RatingButton rating={RATING.LIKE} onClick={handleSwipe} />
            <RatingButton rating={RATING.LOVE} onClick={handleSwipe} />
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

      {/* Proposal Modal */}
      <ProposalModal
        isOpen={showProposalModal}
        onClose={handleProposalDismiss}
        onSubmit={handleProposalSubmit}
      />
    </div>
  );
};

export default SwipeInterface;
